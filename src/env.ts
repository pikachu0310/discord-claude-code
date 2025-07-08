import { err, ok, Result } from "neverthrow";

export interface Env {
  TRAQ_TOKEN: string;
  WORK_BASE_DIR: string;
  VERBOSE: boolean;
  CLAUDE_APPEND_SYSTEM_PROMPT?: string;
  GEMINI_API_KEY?: string;
  /**
   * PLaMo-2-translate API URL（オプション）
   * 設定されている場合、日本語の指示を英語に翻訳してからClaude Codeに渡す
   * 例: http://localhost:8080
   */
  PLAMO_TRANSLATOR_URL?: string;
}

/**
 * 環境変数関連のエラー
 */
export type EnvError = {
  type: "MISSING_ENV_VAR";
  variable: string;
  message: string;
};

export function getEnv(): Result<Env, EnvError> {
  const token = Deno.env.get("TRAQ_TOKEN");
  const workBaseDir = Deno.env.get("WORK_BASE_DIR");
  const verbose = Deno.env.get("VERBOSE") === "true";
  const claudeAppendSystemPrompt = Deno.env.get("CLAUDE_APPEND_SYSTEM_PROMPT");
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  const plamoTranslatorUrl = Deno.env.get("PLAMO_TRANSLATOR_URL");

  if (!token) {
    return err({
      type: "MISSING_ENV_VAR",
      variable: "TRAQ_TOKEN",
      message: "TRAQ_TOKEN is not set",
    });
  }

  if (!workBaseDir) {
    return err({
      type: "MISSING_ENV_VAR",
      variable: "WORK_BASE_DIR",
      message: "WORK_BASE_DIR is not set",
    });
  }

  return ok({
    TRAQ_TOKEN: token,
    WORK_BASE_DIR: workBaseDir,
    VERBOSE: verbose,
    CLAUDE_APPEND_SYSTEM_PROMPT: claudeAppendSystemPrompt,
    GEMINI_API_KEY: geminiApiKey,
    PLAMO_TRANSLATOR_URL: plamoTranslatorUrl,
  });
}
