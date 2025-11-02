import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import {
  ClaudeCodeRateLimitError,
  ClaudeStreamMessage,
  ClaudeStreamProcessor,
} from "./claude-stream-processor.ts";
import { MessageFormatter } from "./message-formatter.ts";

Deno.test("ClaudeStreamProcessor - extractOutputMessage - assistantメッセージ", () => {
  const formatter = new MessageFormatter();
  const processor = new ClaudeStreamProcessor(formatter);

  const message = {
    type: "assistant" as const,
    message: {
      id: "msg-123",
      type: "message",
      role: "assistant",
      model: "claude",
      content: [
        { type: "text", text: "これはテストです", citations: null },
      ],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        server_tool_use: null,
        service_tier: "standard",
      },
    },
    session_id: "session-123",
  } satisfies ClaudeStreamMessage;

  const result = processor.extractOutputMessage(message);
  assertEquals(result, "これはテストです");
});

Deno.test("ClaudeStreamProcessor - extractOutputMessage - tool_useメッセージ", () => {
  const formatter = new MessageFormatter();
  const processor = new ClaudeStreamProcessor(formatter);

  const message = {
    type: "assistant" as const,
    message: {
      id: "msg-123",
      type: "message",
      role: "assistant",
      model: "claude",
      content: [
        {
          type: "tool_use",
          id: "tool-123",
          name: "Bash",
          input: { command: "ls", description: "ファイル一覧" },
        },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: {
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        input_tokens: 0,
        output_tokens: 0,
        server_tool_use: null,
        service_tier: "standard",
      },
    },
    session_id: "session-123",
  } satisfies ClaudeStreamMessage;

  const result = processor.extractOutputMessage(message);
  assertEquals(
    result,
    "⚡ **Bash**:\nファイル一覧\n```sh\nls\n```",
  );
});

Deno.test("ClaudeStreamProcessor - extractOutputMessage - resultメッセージは無視", () => {
  const formatter = new MessageFormatter();
  const processor = new ClaudeStreamProcessor(formatter);

  const message = {
    type: "result" as const,
    subtype: "success" as const,
    is_error: false,
    result: "最終結果",
    session_id: "session-123",
    duration_ms: 0,
    duration_api_ms: 0,
    num_turns: 0,
    total_cost_usd: 0,
  } satisfies ClaudeStreamMessage;

  const result = processor.extractOutputMessage(message);
  assertEquals(result, null);
});

Deno.test("ClaudeStreamProcessor - extractOutputMessage - systemメッセージ", () => {
  const formatter = new MessageFormatter();
  const processor = new ClaudeStreamProcessor(formatter);

  const message = {
    type: "system" as const,
    subtype: "init" as const,
    apiKeySource: "default" as const,
    session_id: "session-123",
    cwd: "/workspace",
    tools: ["Bash", "Read", "Write"],
    mcp_servers: [
      { name: "server1", status: "active" },
    ],
    model: "claude",
    permissionMode: "default",
  } satisfies ClaudeStreamMessage;

  const result = processor.extractOutputMessage(message);
  assertEquals(
    result,
    "🔧 **システム初期化:** ツール: Bash, Read, Write, MCPサーバー: server1(active)",
  );
});

Deno.test("ClaudeStreamProcessor - processStreams - 基本的なストリーム処理", async () => {
  const formatter = new MessageFormatter();
  const processor = new ClaudeStreamProcessor(formatter);

  // テスト用のストリームを作成
  const testData = new TextEncoder().encode("テストデータ");
  const stdout = new ReadableStream({
    start(controller) {
      controller.enqueue(testData);
      controller.close();
    },
  });

  const stderr = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  let receivedData: Uint8Array | null = null;
  const onData = (data: Uint8Array) => {
    receivedData = data;
  };

  const result = await processor.processStreams(stdout, stderr, onData);

  assertEquals(receivedData, testData);
  assertEquals(result.length, 0); // stderrは空
});

Deno.test("ClaudeStreamProcessor - processStreams - stderrの処理", async () => {
  const formatter = new MessageFormatter();
  const processor = new ClaudeStreamProcessor(formatter);

  const stdout = new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

  const errorData = new TextEncoder().encode("エラーメッセージ");
  const stderr = new ReadableStream({
    start(controller) {
      controller.enqueue(errorData);
      controller.close();
    },
  });

  const onData = () => {};

  const result = await processor.processStreams(stdout, stderr, onData);

  assertEquals(result, errorData);
});

Deno.test("ClaudeCodeRateLimitError - エラー作成", () => {
  const timestamp = Date.now();
  const error = new ClaudeCodeRateLimitError(timestamp);

  assertEquals(error.name, "ClaudeCodeRateLimitError");
  assertEquals(error.timestamp, timestamp);
  assertEquals(error.message, `Claude AI usage limit reached|${timestamp}`);
});
