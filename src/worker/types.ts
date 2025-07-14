// WorkerError型定義
export type WorkerError =
  | { type: "REPOSITORY_NOT_SET" }
  | { type: "CONFIGURATION_INCOMPLETE" }
  | { type: "CLAUDE_EXECUTION_FAILED"; error: string }
  | { type: "RATE_LIMIT"; retryAt: number; timestamp: number }
  | { type: "PROMPT_TOO_LONG"; numTurns: number; message: string }
  | { type: "TRANSLATION_FAILED"; error: string }
  | { type: "SESSION_LOG_FAILED"; operation: string; error: string }
  | { type: "DEVCONTAINER_START_FAILED"; error: string }
  | { type: "WORKSPACE_ERROR"; operation: string; error: string }
  | { type: "STREAM_PROCESSING_ERROR"; error: string };

// ClaudeExecutorError型定義
export type ClaudeExecutorError =
  | { type: "COMMAND_EXECUTION_FAILED"; code: number; stderr: string }
  | { type: "STREAM_PROCESSING_ERROR"; error: string };

// MessageFormatterError型定義
export type MessageFormatterError = { type: "FORMAT_ERROR"; error: string };

// SessionLoggerError型定義
export type SessionLoggerError = { type: "SAVE_FAILED"; error: string };

// Claude関連の型定義
export interface ClaudeResponse {
  content: string;
  isRateLimit?: boolean;
  retryAt?: number;
  timestamp?: number;
}

// Worker関連のインターフェース
export interface IWorker {
  processMessage(
    message: string,
    onProgress?: (content: string) => Promise<void>,
    onReaction?: (emoji: string) => Promise<void>,
  ): Promise<import("neverthrow").Result<string, WorkerError>>;
  getName(): string;
  getRepository(): import("../git-utils.ts").GitRepository | null;
  setRepository(
    repository: import("../git-utils.ts").GitRepository,
    localPath: string,
  ): Promise<import("neverthrow").Result<void, WorkerError>>;
  setThreadId(threadId: string): void;
  isUsingDevcontainer(): boolean;
  getUseDevcontainer(): boolean;
  setUseDevcontainer(useDevcontainer: boolean): void;
  setUseFallbackDevcontainer(useFallback: boolean): void;
  getDangerouslySkipPermissions(): boolean;
  setDangerouslySkipPermissions(skipPermissions: boolean): void;
  startDevcontainer(
    onProgress?: (message: string) => Promise<void>,
  ): Promise<{ success: boolean; containerId?: string; error?: string }>;
  updateClaudeExecutorForDevcontainer(): Promise<void>;
  save(): Promise<import("neverthrow").Result<void, WorkerError>>;
  stopExecution(
    onProgress?: (content: string) => Promise<void>,
  ): Promise<boolean>;
}
