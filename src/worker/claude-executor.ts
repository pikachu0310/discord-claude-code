import { ClaudeStreamProcessor } from "./claude-stream-processor.ts";
import { MessageFormatter } from "./message-formatter.ts";
import { err, ok, Result } from "neverthrow";
import type { ClaudeExecutorError } from "./types.ts";

export interface ClaudeCommandExecutor {
  /**
   * Claude CLIをストリーミングモードで実行する
   * @param args Claude CLIに渡すコマンドライン引数
   * @param cwd 作業ディレクトリ
   * @param onData 標準出力データを受信したときのコールバック
   * @param abortSignal プロセスを中断するためのシグナル
   * @param onProcessStart プロセスが正常に生成された場合のみ呼ばれるコールバック。プロセス生成に失敗した場合は呼ばれない
   * @returns 実行結果（終了コードと標準エラー出力）またはエラー
   */
  executeStreaming(
    args: string[],
    cwd: string,
    onData: (data: Uint8Array) => void,
    abortSignal?: AbortSignal,
    onProcessStart?: (childProcess: Deno.ChildProcess) => void,
  ): Promise<Result<{ code: number; stderr: Uint8Array }, ClaudeExecutorError>>;
}

export class DefaultClaudeCommandExecutor implements ClaudeCommandExecutor {
  private readonly verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  async executeStreaming(
    args: string[],
    cwd: string,
    onData: (data: Uint8Array) => void,
    abortSignal?: AbortSignal,
    onProcessStart?: (childProcess: Deno.ChildProcess) => void,
  ): Promise<
    Result<{ code: number; stderr: Uint8Array }, ClaudeExecutorError>
  > {
    // VERBOSEモードでコマンド詳細ログ
    if (this.verbose) {
      console.log(
        `[${
          new Date().toISOString()
        }] [DefaultClaudeCommandExecutor] Claudeコマンド実行:`,
      );
      console.log(`  作業ディレクトリ: ${cwd}`);
      console.log(`  引数: ${JSON.stringify(args)}`);
    }

    try {
      // nvm環境を含むPATHを設定
      const env = { ...Deno.env.toObject() };
      const nvmNodePath = `${env.HOME}/.local/share/nvm/v22.15.0/bin`;
      
      // PATHにnvmのパスを追加（存在する場合）
      if (env.PATH && !env.PATH.includes(nvmNodePath)) {
        env.PATH = `${nvmNodePath}:${env.PATH}`;
      }

      const command = new Deno.Command("claude", {
        args,
        cwd,
        stdout: "piped",
        stderr: "piped",
        signal: abortSignal,
        env,
      });

      const process = command.spawn();

      // プロセス開始コールバック
      onProcessStart?.(process);

      // ClaudeStreamProcessorのprocessStreamsメソッドを使用
      const processor = new ClaudeStreamProcessor(
        new MessageFormatter(), // formatterインスタンスを渡す
      );

      // プロセスの終了を待つ
      const [{ code }, stderrOutput] = await Promise.all([
        process.status,
        processor.processStreams(process.stdout, process.stderr, onData),
      ]);

      // VERBOSEモードで実行結果詳細ログ
      if (this.verbose) {
        console.log(
          `[${
            new Date().toISOString()
          }] [DefaultClaudeCommandExecutor] 実行完了:`,
        );
        console.log(`  終了コード: ${code}`);
        console.log(`  stderr長: ${stderrOutput.length}バイト`);
      }

      return ok({ code, stderr: stderrOutput });
    } catch (error) {
      // AbortErrorの場合は特別な処理
      if (error instanceof Error && error.name === "AbortError") {
        return err({
          type: "STREAM_PROCESSING_ERROR",
          error: "実行が中断されました",
        });
      }
      return err({
        type: "STREAM_PROCESSING_ERROR",
        error: (error as Error).message,
      });
    }
  }
}

export class DevcontainerClaudeExecutor implements ClaudeCommandExecutor {
  private readonly repositoryPath: string;
  private readonly verbose: boolean;
  private readonly ghToken?: string;

  constructor(
    repositoryPath: string,
    verbose = false,
    ghToken?: string,
  ) {
    this.repositoryPath = repositoryPath;
    this.verbose = verbose;
    this.ghToken = ghToken;
  }

  async executeStreaming(
    args: string[],
    _cwd: string,
    onData: (data: Uint8Array) => void,
    abortSignal?: AbortSignal,
    onProcessStart?: (childProcess: Deno.ChildProcess) => void,
  ): Promise<
    Result<{ code: number; stderr: Uint8Array }, ClaudeExecutorError>
  > {
    const argsWithDefaults = [
      "exec",
      "--workspace-folder",
      this.repositoryPath,
      "claude",
      ...args,
    ];
    // VERBOSEモードでdevcontainerコマンド詳細ログ
    if (this.verbose) {
      console.log(
        `[${
          new Date().toISOString()
        }] [DevcontainerClaudeExecutor] devcontainerコマンド実行:`,
      );
      console.log(`  リポジトリパス: ${this.repositoryPath}`);
      console.log(`  引数: ${JSON.stringify(argsWithDefaults)}`);
    }

    try {
      // devcontainer内でclaudeコマンドをストリーミング実行
      const env: Record<string, string> = {
        ...Deno.env.toObject(),
        DOCKER_DEFAULT_PLATFORM: "linux/amd64",
      };

      // GitHub PATが提供されている場合は環境変数に設定
      if (this.ghToken) {
        env.GH_TOKEN = this.ghToken;
        env.GITHUB_TOKEN = this.ghToken; // 互換性のため両方設定
      }

      const devcontainerCommand = new Deno.Command("devcontainer", {
        args: argsWithDefaults,
        stdin: "null",
        stdout: "piped",
        stderr: "piped",
        cwd: this.repositoryPath,
        env,
        signal: abortSignal,
      });

      const process = devcontainerCommand.spawn();

      // プロセス開始コールバック
      if (onProcessStart) {
        onProcessStart(process);
      }

      // ClaudeStreamProcessorのprocessStreamsメソッドを使用
      const processor = new ClaudeStreamProcessor(
        new MessageFormatter(), // formatterインスタンスを渡す
      );

      // プロセスの終了を待つ
      const [{ code }, stderrOutput] = await Promise.all([
        process.status,
        processor.processStreams(process.stdout, process.stderr, onData),
      ]);

      // VERBOSEモードで実行結果詳細ログ
      if (this.verbose) {
        console.log(
          `[${
            new Date().toISOString()
          }] [DevcontainerClaudeExecutor] 実行完了:`,
        );
        console.log(`  終了コード: ${code}`);
        console.log(`  stderr長: ${stderrOutput.length}バイト`);
      }

      return ok({ code, stderr: stderrOutput });
    } catch (error) {
      // AbortErrorの場合は特別な処理
      if (error instanceof Error && error.name === "AbortError") {
        return err({
          type: "STREAM_PROCESSING_ERROR",
          error: "実行が中断されました",
        });
      }
      return err({
        type: "STREAM_PROCESSING_ERROR",
        error: (error as Error).message,
      });
    }
  }
}
