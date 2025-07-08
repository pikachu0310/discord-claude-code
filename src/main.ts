import { Api, Client } from "traq-bot-ts";
import { Admin } from "./admin/admin.ts";
import { getEnv } from "./env.ts";
import { ensureRepository, parseRepository } from "./git-utils.ts";
import { RepositoryPatInfo, WorkspaceManager } from "./workspace/workspace.ts";
import {
  checkSystemRequirements,
  type CommandStatus,
  formatSystemCheckResults,
} from "./system-check.ts";
// import { generateThreadName, summarizeWithGemini } from "./gemini.ts"; // 将来のスレッド名自動生成機能用

// システム要件チェック
console.log("システム要件をチェックしています...");
const systemCheckResult = await checkSystemRequirements();

if (systemCheckResult.isErr()) {
  const error = systemCheckResult.error;

  if (error.type === "REQUIRED_COMMAND_MISSING") {
    // エラーの場合でも、各コマンドの状態を確認するために再度チェック（結果表示用）
    const allCommands = ["git", "claude", "gh", "devcontainer"];
    const displayResults: CommandStatus[] = [];

    for (const cmd of allCommands) {
      try {
        const process = new Deno.Command(cmd, {
          args: ["--version"],
          stdout: "piped",
          stderr: "piped",
        });
        const result = await process.output();

        if (result.success) {
          const version = new TextDecoder().decode(result.stdout).trim();
          displayResults.push({ command: cmd, available: true, version });
        } else {
          displayResults.push({
            command: cmd,
            available: false,
            error: "Command failed",
          });
        }
      } catch {
        displayResults.push({
          command: cmd,
          available: false,
          error: "Command not found",
        });
      }
    }

    const checkResults = formatSystemCheckResults(
      displayResults,
      error.missingCommands,
    );
    console.log(checkResults);
    console.error(
      "\n❌ 必須コマンドが不足しているため、アプリケーションを終了します。",
    );
  } else {
    console.error(
      `\n❌ システムチェック中にエラーが発生しました: ${JSON.stringify(error)}`,
    );
  }

  Deno.exit(1);
}

const systemCheck = systemCheckResult.value;
const checkResults = formatSystemCheckResults(
  systemCheck.results,
  systemCheck.missingRequired,
);
console.log(checkResults);

console.log("\n✅ システム要件チェック完了\n");

const envResult = getEnv();
if (envResult.isErr()) {
  console.error(`❌ ${envResult.error.message}`);
  console.error(`環境変数 ${envResult.error.variable} を設定してください。`);
  Deno.exit(1);
}

const env = envResult.value;

// traQ API と Client の初期化
const api = new Api({
  baseApiParams: { headers: { Authorization: `Bearer ${env.TRAQ_TOKEN}` } },
});

// traQ Clientの初期化とエラーハンドリング
const client = new Client({ token: env.TRAQ_TOKEN });

// WebSocketエラーのハンドリングを追加
client.on("ERROR", (data) => {
  console.error("traQ Client WebSocketエラー:", data);
  // その他の重要なエラーのみログ出力
  console.error("traQ Client エラー詳細:", data);
});

// 未処理のWebSocketエラーをキャッチ（Deno対応）
globalThis.addEventListener("error", (event) => {
  const error = event.error as Error;
  if (error?.message?.includes("Buffer") && error.message.includes("ping")) {
    console.log("WebSocket ping エラー (無視): ", error.message);
    event.preventDefault(); // エラーを無視
    return;
  }
  console.error("未処理エラー:", error);
});

globalThis.addEventListener("unhandledrejection", (event) => {
  const error = event.reason as Error;
  if (error?.message?.includes("Buffer") && error.message.includes("ping")) {
    console.log("WebSocket ping Promise rejection (無視): ", error.message);
    event.preventDefault(); // エラーを無視
    return;
  }
  console.error("未処理Promise rejection:", error);
});

const workspaceManager = new WorkspaceManager(env.WORK_BASE_DIR);
await workspaceManager.initialize();
// Admin状態を読み込む
const adminState = await workspaceManager.loadAdminState();
const admin = Admin.fromState(
  adminState,
  workspaceManager,
  env.VERBOSE,
  env.CLAUDE_APPEND_SYSTEM_PROMPT,
  env.PLAMO_TRANSLATOR_URL,
);

if (env.VERBOSE) {
  console.log("🔍 VERBOSEモードが有効です - 詳細ログが出力されます");
}

// スレッドクローズコールバックを設定
admin.setThreadCloseCallback(async (threadId: string) => {
  try {
    // traQでは明示的なスレッドクローズは不要
    // ログ出力のみ
    console.log(`スレッド ${threadId} を終了しました`);
  } catch (error) {
    console.error(`スレッド ${threadId} の終了に失敗:`, error);
  }
});

// traQではスラッシュコマンドの代わりにメッセージパターンでコマンドを処理します
// コマンドの定義
const COMMANDS = {
  START: /^\/start\s+(\S+)$/,
  SET_PAT: /^\/set-pat\s+(\S+)\s+(\S+)(?:\s+(.*))?$/,
  LIST_PATS: /^\/list-pats$/,
  DELETE_PAT: /^\/delete-pat\s+(\S+)$/,
  STOP: /^\/stop$/,
  CONFIG: /^\/config\s+(\S+)\s+(\S+)$/,
  HELP: /^\/help$/,
};

// Bot起動時の処理
try {
  client.listen(() => {
    console.log("traQ Botの起動が完了しました");

    // 自動再開コールバックを設定
    admin.setAutoResumeCallback(async (threadId: string, message: string) => {
      try {
        // 進捗コールバック
        const onProgress = async (content: string) => {
          try {
            await api.channels.postMessage(threadId, { content, embed: true });
          } catch (sendError) {
            console.error("自動再開メッセージ送信エラー:", sendError);
          }
        };

        // リアクションコールバック（traQではスタンプを使用）
        const onReaction = async (emoji: string) => {
          try {
            // traQではスタンプでリアクションを表現
            // スタンプの代わりにメッセージで状態を通知
            console.log(`リアクション: ${emoji}`);
          } catch (error) {
            console.error("自動再開リアクション追加エラー:", error);
          }
        };

        const replyResult = await admin.routeMessage(
          threadId,
          message,
          onProgress,
          onReaction,
        );

        if (replyResult.isErr()) {
          console.error("自動再開メッセージ処理エラー:", replyResult.error);
          return;
        }

        const reply = replyResult.value;

        if (typeof reply === "string") {
          await api.channels.postMessage(threadId, {
            content: reply,
            embed: true,
          });
        } else {
          // traQではコンポーネントの代わりにメッセージ本文で情報を表示
          await api.channels.postMessage(threadId, {
            content: reply.content,
            embed: true,
          });
        }
      } catch (error) {
        console.error("自動再開メッセージ送信エラー:", error);
      }
    });

    // スレッドクローズコールバックを設定
    admin.setThreadCloseCallback(async (threadId: string) => {
      try {
        // traQでは明示的なスレッドクローズは不要
        console.log(`スレッドを終了しました: ${threadId}`);
      } catch (error) {
        console.error(`スレッドの終了に失敗しました (${threadId}):`, error);
      }
    });

    // アクティブなスレッドを復旧
    console.log("アクティブなスレッドを復旧しています...");
    admin.restoreActiveThreads().then((restoreResult) => {
      if (restoreResult.isOk()) {
        console.log("スレッドの復旧が完了しました。");
      } else {
        console.error(
          "スレッドの復旧でエラーが発生しました:",
          restoreResult.error,
        );
      }
    });

    console.log("traQ Botの初期化が完了しました！");
  });

  // traQではメッセージでコマンドを処理
  // インタラクションの代わりにメッセージイベントでコマンドを処理
  client.on("MESSAGE_CREATED", async ({ body }) => {
    const { user, plainText, channelId, id: messageId } = body.message;

    // Bot自身のメッセージを無視
    if (user.bot) return;

    // コマンドメッセージの処理
    if (plainText.startsWith("/")) {
      await handleCommand(plainText, channelId, user.id);
    } else {
      // 通常のメッセージ処理
      await handleMessage(plainText, channelId, user.id, messageId);
    }
  });
} catch (error) {
  console.error("traQ Bot初期化エラー:", error);
  if (
    error instanceof Error && error.message.includes("Buffer") &&
    error.message.includes("ping")
  ) {
    console.log(
      "WebSocket ping エラーを検出しました。Bot は正常に動作している可能性があります。",
    );
  } else {
    console.error("予期しないエラーが発生しました:", error);
    Deno.exit(1);
  }
}

// 関数定義（モジュールルート）
async function handleCommand(
  message: string,
  channelId: string,
  userId: string,
) {
  try {
    // /start コマンドの処理
    const startMatch = message.match(COMMANDS.START);
    if (startMatch) {
      const repositorySpec = startMatch[1];
      return await handleStartCommand(repositorySpec, channelId, userId);
    }

    // /set-pat コマンドの処理
    const setPATMatch = message.match(COMMANDS.SET_PAT);
    if (setPATMatch) {
      const repositorySpec = setPATMatch[1];
      const token = setPATMatch[2];
      const description = setPATMatch[3];
      return await handleSetPATCommand(
        repositorySpec,
        token,
        description,
        channelId,
      );
    }

    // /list-pats コマンドの処理
    if (COMMANDS.LIST_PATS.test(message)) {
      return await handleListPATsCommand(channelId);
    }

    // /delete-pat コマンドの処理
    const deletePATMatch = message.match(COMMANDS.DELETE_PAT);
    if (deletePATMatch) {
      const repositorySpec = deletePATMatch[1];
      return await handleDeletePATCommand(repositorySpec, channelId);
    }

    // /stop コマンドの処理
    if (COMMANDS.STOP.test(message)) {
      return await handleStopCommand(channelId);
    }

    // /config コマンドの処理
    const configMatch = message.match(COMMANDS.CONFIG);
    if (configMatch) {
      const setting = configMatch[1];
      const value = configMatch[2];
      return await handleConfigCommand(setting, value, channelId, userId);
    }

    // /help コマンドの処理
    if (COMMANDS.HELP.test(message)) {
      return await handleHelpCommand(channelId);
    }

    // コマンドが不明の場合のヘルプメッセージ
    await api.channels.postMessage(channelId, {
      content:
        "不明なコマンドです。使用可能なコマンド: /start, /set-pat, /list-pats, /delete-pat, /stop, /config, /help",
      embed: true,
    });
  } catch (error) {
    console.error("コマンド処理エラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleHelpCommand(channelId: string) {
  const helpMessage = `
**traQ Claude Code Bot コマンド一覧**

\`/start <repository>\` - 新しいチャットスレッドを開始します
  例: \`/start owner/repo\`

\`/set-pat <repository> <token> [description]\` - GitHub Fine-Grained PATを設定します
  例: \`/set-pat owner/repo github_pat_xxx "My PAT"\`

\`/list-pats\` - 登録済みのGitHub PATの一覧を表示します

\`/delete-pat <repository>\` - 登録済みのGitHub PATを削除します
  例: \`/delete-pat owner/repo\`

\`/stop\` - 実行中のClaude Codeを中断します

\`/config <setting> <value>\` - 設定を変更します
  例: \`/config devcontainer on\`

\`/help\` - このヘルプメッセージを表示します
  `;

  await api.channels.postMessage(channelId, {
    content: helpMessage,
    embed: true,
  });
}

async function handleStartCommand(
  repositorySpec: string,
  channelId: string,
  _userId: string,
) {
  try {
    // リポジトリ名をパース
    const repositoryParseResult = parseRepository(repositorySpec);
    if (repositoryParseResult.isErr()) {
      const errorMessage =
        repositoryParseResult.error.type === "INVALID_REPOSITORY_NAME"
          ? repositoryParseResult.error.message
          : "リポジトリ名の解析に失敗しました";
      await api.channels.postMessage(channelId, {
        content: `エラー: ${errorMessage}`,
        embed: true,
      });
      return;
    }
    const repository = repositoryParseResult.value;

    // 処理中メッセージを送信
    await api.channels.postMessage(channelId, {
      content: `${repository.fullName} を取得中...`,
      embed: true,
    });

    // リポジトリをclone/更新
    const repositoryResult = await ensureRepository(
      repository,
      workspaceManager,
    );
    if (repositoryResult.isErr()) {
      const errorMessage = repositoryResult.error.type === "GH_CLI_ERROR"
        ? repositoryResult.error.error
        : `リポジトリの取得に失敗しました: ${repositoryResult.error.type}`;
      await api.channels.postMessage(channelId, {
        content: errorMessage,
        embed: true,
      });
      return;
    }

    // Workerを作成してリポジトリ情報を設定
    const workerResult = await admin.createWorker(channelId);
    if (workerResult.isErr()) {
      await api.channels.postMessage(channelId, {
        content: `エラー: ${workerResult.error.type}`,
        embed: true,
      });
      return;
    }
    const worker = workerResult.value;
    await worker.setRepository(repository, repositoryResult.value.path);

    // 更新状況に応じたメッセージを作成
    let statusMessage = repositoryResult.value.wasUpdated
      ? `${repository.fullName}の既存リポジトリをデフォルトブランチの最新に更新しました。`
      : `${repository.fullName}を新規取得しました。`;

    // メタデータがある場合は追加情報を表示
    if (repositoryResult.value.metadata) {
      const metadata = repositoryResult.value.metadata;
      const repoInfo = [
        metadata.description ? `説明: ${metadata.description}` : "",
        metadata.language ? `言語: ${metadata.language}` : "",
        `デフォルトブランチ: ${metadata.defaultBranch}`,
        metadata.isPrivate
          ? "🔒 プライベートリポジトリ"
          : "🌐 パブリックリポジトリ",
      ].filter(Boolean).join(" | ");

      statusMessage += `\n📋 ${repoInfo}`;
    }

    await api.channels.postMessage(channelId, {
      content: `${statusMessage}\nチャットセッションを開始しました。`,
      embed: true,
    });

    // devcontainer.jsonの存在確認と設定
    const devcontainerInfo = await admin.checkAndSetupDevcontainer(
      channelId,
      repositoryResult.value.path,
    );

    // シンプルな初期メッセージを送信
    const greeting =
      `こんにちは！ 準備バッチリだよ！ ${repository.fullName} について何でも聞いてね～！`;

    // devcontainerの設定ボタンがある場合の情報も表示
    let devcontainerMessage = "";
    if (devcontainerInfo.components && devcontainerInfo.components.length > 0) {
      devcontainerMessage = "\n\n**devcontainer設定**\n";
      devcontainerMessage += "devcontainer.jsonが検出されました。\n";
      devcontainerMessage +=
        "devcontainerを使用する場合は `/config devcontainer on` コマンドを実行してください。";
    }

    await api.channels.postMessage(channelId, {
      content: greeting + devcontainerMessage,
      embed: true,
    });
  } catch (error) {
    console.error("startコマンドエラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleSetPATCommand(
  repositorySpec: string,
  token: string,
  description: string | undefined,
  channelId: string,
) {
  try {
    // リポジトリ名をパース
    const repositoryResult = parseRepository(repositorySpec);
    if (repositoryResult.isErr()) {
      const errorMessage =
        repositoryResult.error.type === "INVALID_REPOSITORY_NAME"
          ? repositoryResult.error.message
          : "リポジトリ名の解析に失敗しました";
      await api.channels.postMessage(channelId, {
        content: `エラー: ${errorMessage}`,
        embed: true,
      });
      return;
    }
    const repository = repositoryResult.value;

    // PAT情報を保存
    const patInfo: RepositoryPatInfo = {
      repositoryFullName: repository.fullName,
      token,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: description || undefined,
    };

    await workspaceManager.saveRepositoryPat(patInfo);

    await api.channels.postMessage(channelId, {
      content: `✅ ${repository.fullName}のGitHub PATを設定しました。${
        description ? `\n説明: ${description}` : ""
      }\n\n今後このリポジトリでdevcontainerを使用する際に、このPATが自動的に環境変数として設定されます。`,
      embed: true,
    });
  } catch (error) {
    console.error("PAT設定エラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleListPATsCommand(channelId: string) {
  try {
    const pats = await workspaceManager.listRepositoryPats();

    if (pats.length === 0) {
      await api.channels.postMessage(channelId, {
        content: "登録済みのGitHub PATはありません。",
        embed: true,
      });
      return;
    }

    const patList = pats
      .map((pat) => {
        const maskedToken = `${pat.token.substring(0, 7)}...${
          pat.token.substring(pat.token.length - 4)
        }`;
        return `• **${pat.repositoryFullName}**\n  トークン: \`${maskedToken}\`${
          pat.description ? `\n  説明: ${pat.description}` : ""
        }\n  登録日: ${new Date(pat.createdAt).toLocaleString("ja-JP")}`;
      })
      .join("\n\n");

    await api.channels.postMessage(channelId, {
      content: `📋 **登録済みのGitHub PAT一覧**\n\n${patList}`,
      embed: true,
    });
  } catch (error) {
    console.error("PAT一覧取得エラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleDeletePATCommand(
  repositorySpec: string,
  channelId: string,
) {
  try {
    // リポジトリ名をパース
    const repositoryResult = parseRepository(repositorySpec);
    if (repositoryResult.isErr()) {
      const errorMessage =
        repositoryResult.error.type === "INVALID_REPOSITORY_NAME"
          ? repositoryResult.error.message
          : "リポジトリ名の解析に失敗しました";
      await api.channels.postMessage(channelId, {
        content: `エラー: ${errorMessage}`,
        embed: true,
      });
      return;
    }
    const repository = repositoryResult.value;

    await workspaceManager.deleteRepositoryPat(repository.fullName);

    await api.channels.postMessage(channelId, {
      content: `✅ ${repository.fullName}のGitHub PATを削除しました。`,
      embed: true,
    });
  } catch (error) {
    console.error("PAT削除エラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleStopCommand(channelId: string) {
  try {
    const stopResult = await admin.stopExecution(channelId);

    if (stopResult.isErr()) {
      const error = stopResult.error;
      if (error.type === "WORKER_NOT_FOUND") {
        await api.channels.postMessage(channelId, {
          content:
            "❌ 中断に失敗しました。既に実行が完了している可能性があります。",
          embed: true,
        });
      } else {
        await api.channels.postMessage(channelId, {
          content:
            `❌ 中断処理中にエラーが発生しました: ${error.type}\n\n🔄 もう一度お試しください。`,
          embed: true,
        });
      }
      return;
    }

    await api.channels.postMessage(channelId, {
      content:
        "✅ Claude Codeの実行を中断しました。\n\n💡 新しい指示を送信して作業を続けることができます。",
      embed: true,
    });
  } catch (error) {
    console.error("/stopコマンドエラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleConfigCommand(
  setting: string,
  value: string,
  channelId: string,
  userId: string,
) {
  try {
    const workerResult = admin.getWorker(channelId);

    if (workerResult.isErr()) {
      // botが作成したスレッドかどうかをThreadInfoの存在で判断
      const threadInfo = await workspaceManager.loadThreadInfo(channelId);
      if (threadInfo) {
        // botが作成したスレッドの場合のみメッセージを表示
        await api.channels.postMessage(channelId, {
          content:
            "このスレッドはアクティブではありません。/start コマンドで新しいスレッドを開始してください。",
          embed: true,
        });
      }
      return;
    }

    const worker = workerResult.value;

    if (setting === "devcontainer") {
      if (value === "on") {
        worker.setUseDevcontainer(true);
        await api.channels.postMessage(channelId, {
          content:
            `@${userId} devcontainer環境での実行を設定しました。\n\n準備完了です！何かご質問をどうぞ。`,
          embed: true,
        });
      } else if (value === "off") {
        worker.setUseDevcontainer(false);
        await api.channels.postMessage(channelId, {
          content:
            `@${userId} ホスト環境での実行を設定しました。\n\n準備完了です！何かご質問をどうぞ。`,
          embed: true,
        });
      } else {
        await api.channels.postMessage(channelId, {
          content:
            `@${userId} 不正な設定値です。'/config devcontainer on' または '/config devcontainer off' を使用してください。`,
          embed: true,
        });
      }
    } else {
      await api.channels.postMessage(channelId, {
        content: `@${userId} 不明な設定です。使用可能な設定: devcontainer`,
        embed: true,
      });
    }
  } catch (error) {
    console.error("configコマンドエラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}

async function handleMessage(
  message: string,
  channelId: string,
  userId: string,
  messageId: string,
) {
  try {
    let lastUpdateTime = Date.now();
    const UPDATE_INTERVAL = 2000; // 2秒ごとに更新

    // 進捗更新用のコールバック（新規メッセージ投稿、通知なし）
    const onProgress = async (content: string) => {
      const now = Date.now();
      if (now - lastUpdateTime >= UPDATE_INTERVAL) {
        try {
          await api.channels.postMessage(channelId, {
            content: content,
            embed: true,
          });
          lastUpdateTime = now;
        } catch (sendError) {
          console.error("メッセージ送信エラー:", sendError);
        }
      }
    };

    // リアクション追加用のコールバック
    const onReaction = async (emoji: string) => {
      try {
        // traQではスタンプでリアクションを表現
        // 実際のスタンプAPIが必要な場合は実装を調整
        console.log(`リアクション: ${emoji}`);
      } catch (error) {
        console.error("リアクション追加エラー:", error);
      }
    };

    // AdminにメッセージをルーティングしてWorkerからの返信を取得
    const replyResult = await admin.routeMessage(
      channelId,
      message,
      onProgress,
      onReaction,
      messageId,
      userId,
    );

    if (replyResult.isErr()) {
      const error = replyResult.error;
      if (error.type === "WORKER_NOT_FOUND") {
        // botが作成したスレッドかどうかをThreadInfoの存在で判断
        const threadInfo = await workspaceManager.loadThreadInfo(channelId);
        if (threadInfo) {
          // botが作成したスレッドの場合のみメッセージを表示
          await api.channels.postMessage(channelId, {
            content:
              "このスレッドはアクティブではありません。/start コマンドで新しいスレッドを開始してください。",
            embed: true,
          });
        }
        // botが作成していないスレッドの場合は何も返信しない
      } else {
        console.error("メッセージ処理エラー:", error);
        await api.channels.postMessage(channelId, {
          content: "エラーが発生しました。",
          embed: true,
        });
      }
      return;
    }

    const reply = replyResult.value;

    // 最終的な返信を送信
    if (typeof reply === "string") {
      // 通常のテキストレスポンス（メンション付きで通知あり）
      await api.channels.postMessage(channelId, {
        content: `@${userId} ${reply}`,
        embed: true,
      });
    } else {
      // traQではコンポーネントの代わりにメッセージ本文で情報を表示
      await api.channels.postMessage(channelId, {
        content: `@${userId} ${reply.content}`,
        embed: true,
      });
    }
  } catch (error) {
    console.error("メッセージ処理エラー:", error);
    await api.channels.postMessage(channelId, {
      content: "エラーが発生しました。",
      embed: true,
    });
  }
}
