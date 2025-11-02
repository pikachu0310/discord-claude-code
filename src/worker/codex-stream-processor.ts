import { MessageFormatter } from "./message-formatter.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const LEGACY_MESSAGE_TYPES = new Set([
  "assistant",
  "user",
  "result",
  "system",
]);

/**
 * JSON解析エラー
 */
export class JsonParseError extends Error {
  public readonly line: string;
  public override readonly cause: unknown;

  constructor(line: string, cause: unknown) {
    super(`Failed to parse JSON: ${cause}`);
    this.name = "JsonParseError";
    this.line = line;
    this.cause = cause;
  }
}

/**
 * スキーマ検証エラー
 */
export class SchemaValidationError extends Error {
  constructor(public readonly data: unknown, message: string) {
    super(`Schema validation failed: ${message}`);
    this.name = "SchemaValidationError";
  }
}

// Codex Code SDK message schema based on https://docs.anthropic.com/en/docs/codex-code/sdk#message-schema
export type CodexStreamMessage =
  // アシスタントメッセージ
  | {
    type: "assistant";
    message: Anthropic.Message & {
      usage?: {
        input_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        output_tokens: number;
        service_tier?: string;
      };
    }; // Anthropic SDKから
    session_id: string;
  }
  // ユーザーメッセージ
  | {
    type: "user";
    message: Anthropic.MessageParam; // Anthropic SDKから
    session_id: string;
  }
  // 最後のメッセージとして出力される
  | {
    type: "result";
    subtype: "success";
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    result: string;
    session_id: string;
    total_cost_usd: number;
    usage?: {
      input_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens: number;
      server_tool_use?: {
        web_search_requests: number;
      };
      service_tier?: string;
    };
  }
  // 最大ターン数に達した場合、最後のメッセージとして出力される
  | {
    type: "result";
    subtype: "error_max_turns" | "error_during_execution";
    duration_ms: number;
    duration_api_ms: number;
    is_error: boolean;
    num_turns: number;
    session_id: string;
    total_cost_usd: number;
    usage?: {
      input_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      output_tokens: number;
      server_tool_use?: {
        web_search_requests: number;
      };
      service_tier?: string;
    };
  }
  // 会話の開始時に最初のメッセージとして出力される
  | {
    type: "system";
    subtype: "init";
    apiKeySource: string;
    cwd: string;
    session_id: string;
    tools: string[];
    mcp_servers: {
      name: string;
      status: string;
    }[];
    model: string;
    permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan";
  };

export interface CodexExecUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
}

export interface CodexExecItemContentBlock {
  type?: string;
  text?: string;
  content?: CodexExecItemContentBlock[] | string;
  [key: string]: unknown;
}

export interface CodexExecItem {
  id?: string;
  type?: string;
  role?: string;
  text?: string;
  content?: CodexExecItemContentBlock[] | string;
  delta?: { text?: string };
  output_text?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CodexExecResponse {
  id?: string;
  session_id?: string;
  session?: { id?: string };
  output?: CodexExecItemContentBlock[];
  output_text?: string;
  usage?: CodexExecUsage;
  [key: string]: unknown;
}

export interface CodexExecJsonEvent {
  type: string;
  item?: CodexExecItem;
  delta?: { text?: string };
  response?: CodexExecResponse;
  session?: { id?: string };
  session_id?: string;
  turn?: { id?: string; session_id?: string; session?: { id?: string } };
  usage?: CodexExecUsage;
  [key: string]: unknown;
}

export type CodexStreamEvent = CodexStreamMessage | CodexExecJsonEvent;

export interface ExecEventState {
  aggregates: Map<string, string>;
}

export interface ExecOutputUpdate {
  aggregatedText: string;
  deltaText?: string;
  isFinal: boolean;
  shouldDisplay: boolean;
  itemType?: string;
}

export class CodexCodeRateLimitError extends Error {
  public readonly timestamp: number;
  public readonly retryAt: number;

  constructor(timestamp: number) {
    super(`Codex AI usage limit reached|${timestamp}`);
    this.name = "CodexCodeRateLimitError";
    this.timestamp = timestamp;
    this.retryAt = timestamp;
  }
}

/**
 * Codex CLIのストリーミング出力を処理するクラス
 */
export class CodexStreamProcessor {
  private readonly formatter: MessageFormatter;

  constructor(formatter: MessageFormatter) {
    this.formatter = formatter;
  }

  static createExecEventState(): ExecEventState {
    return { aggregates: new Map<string, string>() };
  }

  /**
   * JSONライン文字列を安全に解析して型検証を行う
   * @param line JSON文字列の行
   * @returns パースされ、検証されたCodexStreamEvent
   * @throws {JsonParseError} JSON解析に失敗した場合
   * @throws {SchemaValidationError} スキーマ検証に失敗した場合
   */
  parseJsonLine(line: string): CodexStreamEvent {
    // JSON解析
    try {
      return JSON.parse(line) as CodexStreamEvent;
    } catch (error) {
      throw new JsonParseError(line, error);
    }
  }

  isLegacyMessage(event: CodexStreamEvent): event is CodexStreamMessage {
    return typeof event === "object" && event !== null &&
      "type" in event &&
      typeof (event as { type: unknown }).type === "string" &&
      LEGACY_MESSAGE_TYPES.has((event as { type: string }).type);
  }

  isExecJsonEvent(event: CodexStreamEvent): event is CodexExecJsonEvent {
    return typeof event === "object" && event !== null &&
      "type" in event &&
      typeof (event as { type: unknown }).type === "string" &&
      !LEGACY_MESSAGE_TYPES.has((event as { type: string }).type);
  }

  /**
   * プロセスストリームを処理する
   */
  async processStreams(
    stdout: ReadableStream<Uint8Array>,
    stderr: ReadableStream<Uint8Array>,
    onData: (data: Uint8Array) => void,
  ): Promise<Uint8Array> {
    const stdoutReader = stdout.getReader();
    const stderrReader = stderr.getReader();
    let stderrOutput = new Uint8Array();

    // stdoutの読み取りPromise
    const stdoutPromise = (async () => {
      try {
        while (true) {
          const { done, value } = await stdoutReader.read();
          if (done) break;
          if (value) {
            onData(value);
          }
        }
      } catch (error) {
        if (error instanceof CodexCodeRateLimitError) {
          throw error; // レートリミットエラーはそのまま投げる
        }

        console.error("stdout読み取りエラー:", error);
      } finally {
        stdoutReader.releaseLock();
      }
    })();

    // stderrの読み取りPromise
    const stderrPromise = (async () => {
      try {
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await stderrReader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
          }
        }
        // stderrの内容を結合
        const totalLength = chunks.reduce(
          (sum, chunk) => sum + chunk.length,
          0,
        );
        stderrOutput = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          stderrOutput.set(chunk, offset);
          offset += chunk.length;
        }
      } catch (error) {
        console.error("stderr読み取りエラー:", error);
      } finally {
        stderrReader.releaseLock();
      }
    })();

    await Promise.all([stdoutPromise, stderrPromise]);
    return stderrOutput;
  }

  /**
   * JSONL行からCodex Codeの実際の出力メッセージを抽出する
   */
  extractOutputMessage(parsed: CodexStreamEvent): string | null {
    if (this.isLegacyMessage(parsed)) {
      switch (parsed.type) {
        case "assistant":
          // assistantメッセージの処理
          return this.extractAssistantMessage(parsed.message.content);
        case "user":
          // userメッセージの処理（tool_result等）
          return this.extractUserMessage(parsed.message.content);
        case "system":
          // systemメッセージの処理（初期化情報）
          return this.extractSystemMessage(parsed);

        case "result":
          // resultメッセージは最終結果として別途処理されるため、ここでは返さない
          return null;
      }
    }

    return null;
  }

  extractExecOutputUpdate(
    event: CodexExecJsonEvent,
    state: ExecEventState,
  ): ExecOutputUpdate | null {
    const eventType = event.type;

    if (eventType.startsWith("item.")) {
      if (!event.item) {
        return null;
      }

      const itemId = event.item.id || "unknown";
      const aggregateKey = `item:${itemId}`;
      const previous = state.aggregates.get(aggregateKey) ?? "";
      const extracted = this.extractItemAggregateText(event, previous);
      if (!extracted) {
        return null;
      }

      const { aggregate, delta, itemType } = extracted;
      if (!aggregate) {
        return null;
      }

      const normalizedType = (itemType || "").toLowerCase();
      const isAgentMessage = normalizedType.includes("agent") ||
        normalizedType.includes("assistant") ||
        normalizedType === "message" ||
        normalizedType === "output_text";
      if (!isAgentMessage) {
        return null;
      }

      const isFinalItem = eventType === "item.completed";
      if (!isFinalItem && aggregate === previous) {
        return null;
      }

      state.aggregates.set(aggregateKey, aggregate);

      return {
        aggregatedText: aggregate,
        deltaText: delta,
        isFinal: isFinalItem,
        shouldDisplay: true,
        itemType,
      };
    }

    if (eventType.startsWith("response.")) {
      const responseId = event.response?.id || "response";
      const aggregateKey = `response:${responseId}`;
      const previous = state.aggregates.get(aggregateKey) ?? "";
      const aggregate = this.extractResponseText(event, previous);
      if (!aggregate) {
        return null;
      }

      const isFinalResponse = eventType === "response.completed";
      if (!isFinalResponse && aggregate === previous) {
        return null;
      }

      state.aggregates.set(aggregateKey, aggregate);
      return {
        aggregatedText: aggregate,
        deltaText: aggregate.slice(previous.length) || undefined,
        isFinal: isFinalResponse,
        shouldDisplay: isFinalResponse,
      };
    }

    return null;
  }

  private extractResponseText(
    event: CodexExecJsonEvent,
    previous: string,
  ): string | null {
    if (event.delta?.text) {
      return previous + (event.delta.text || "").toString();
    }

    if (event.response?.output_text && typeof event.response.output_text === "string") {
      return event.response.output_text;
    }

    if (Array.isArray(event.response?.output)) {
      return this.collectExecBlocksText(event.response?.output);
    }

    return null;
  }

  private extractItemAggregateText(
    event: CodexExecJsonEvent,
    previous: string,
  ): { aggregate: string; delta?: string; itemType?: string } | null {
    const item = event.item;
    if (!item) {
      return null;
    }

    let aggregate = previous;
    let delta: string | undefined;

    if (item.delta?.text) {
      delta = item.delta.text;
    } else if (event.delta?.text) {
      delta = event.delta.text;
    }

    if (typeof item.text === "string") {
      aggregate = item.text;
    } else if (typeof item.output_text === "string") {
      aggregate = item.output_text;
    } else if (typeof item.content === "string") {
      aggregate = item.content;
    } else if (Array.isArray(item.content)) {
      aggregate = this.collectExecBlocksText(item.content);
    }

    if (!aggregate && delta) {
      aggregate = previous + delta;
    }

    if (!aggregate) {
      return null;
    }

    return { aggregate, delta, itemType: item.type };
  }

  private collectExecBlocksText(blocks: CodexExecItemContentBlock[]): string {
    let result = "";
    for (const block of blocks) {
      if (!block) continue;
      if (typeof block.text === "string") {
        result += block.text;
        continue;
      }

      if (Array.isArray(block.content)) {
        result += this.collectExecBlocksText(block.content);
        continue;
      }

      if (typeof block.content === "string") {
        result += block.content;
      }
    }
    return result;
  }

  /**
   * assistantメッセージのcontentを処理する
   */
  private extractAssistantMessage(
    content: Anthropic.Message["content"],
  ): string | null {
    let textContent = "";

    for (const item of content) {
      switch (item.type) {
        case "text":
          textContent += item.text || "";
          break;
        case "tool_use":
          textContent += this.formatter.formatToolUse(item);
          break;
        case "web_search_tool_result":
          if (Array.isArray(item.content)) {
            textContent += `🔍 **検索結果:** ${item.content.length}件\n`;
          } else {
            textContent +=
              `🔍 **Web検索に失敗しました:** ${item.content.error_code}\n`;
          }
          break;
        case "thinking":
          textContent += `🤔 **思考中...**: ${item.thinking}\n`;
          break;
        case "redacted_thinking":
          textContent += `🤔 **思考中...**: ${item.data}\n`;
          break;
        case "server_tool_use":
          textContent += `**server tool use**: ${JSON.stringify(item.input)}`;
          break;
        default:
          throw new Error(item satisfies never);
      }
    }
    return textContent || null;
  }

  /**
   * userメッセージのcontentを処理する（tool_result等）
   */
  private extractUserMessage(
    content: Anthropic.MessageParam["content"],
  ): string | null {
    if (typeof content === "string") {
      // contentが文字列の場合はそのまま返す
      return content;
    }

    for (const item of content) {
      if (item.type === "tool_result") {
        let resultContent = "";

        // contentが配列の場合（タスクエージェントなど）
        if (Array.isArray(item.content)) {
          for (const contentItem of item.content) {
            if (contentItem.type === "text" && contentItem.text) {
              resultContent += contentItem.text;
            }
          }
        } else {
          // contentが文字列の場合（通常のツール結果）
          resultContent = item.content || "";
        }

        // TodoWrite成功の定型文はスキップ
        if (
          !item.is_error &&
          this.formatter.isTodoWriteSuccessMessage(resultContent)
        ) {
          return null;
        }

        // ツール結果を進捗として投稿
        const resultIcon = item.is_error ? "❌" : "✅";

        // 長さに応じて処理を分岐
        const formattedContent = this.formatter.formatToolResult(
          resultContent,
          item.is_error || false,
        );

        return `${resultIcon} **ツール実行結果:**\n${formattedContent}`;
      } else if (item.type === "text" && item.text) {
        return item.text;
      }
    }
    return null;
  }

  /**
   * systemメッセージの処理
   */
  private extractSystemMessage(
    parsed: CodexStreamMessage,
  ): string | null {
    if (parsed.type === "system" && parsed.subtype === "init") {
      const tools = parsed.tools?.join(", ") || "なし";
      const mcpServers = parsed.mcp_servers?.map((s) =>
        `${s.name}(${s.status})`
      ).join(", ") || "なし";
      return `🔧 **システム初期化:** ツール: ${tools}, MCPサーバー: ${mcpServers}`;
    }
    return null;
  }

  /**
   * Codex Codeのレートリミットメッセージかを判定する
   */
  isCodexCodeRateLimit(result: string): boolean {
    // より包括的な検知を行う
    return result.includes("Codex AI usage limit reached");
  }

  /**
   * レートリミットメッセージからタイムスタンプを抽出する
   */
  extractRateLimitTimestamp(result: string): number | null {
    // より柔軟な正規表現で検知（パイプまたはスペース区切り）
    const match = result.match(/Codex AI usage limit reached[\|\s](\d+)/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return null;
  }
}
