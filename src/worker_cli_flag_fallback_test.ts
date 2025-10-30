import { assertEquals } from "https://deno.land/std@0.214.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.214.0/testing/bdd.ts";
import { Worker } from "./worker/worker.ts";
import { CodexCommandExecutor } from "./worker/codex-executor.ts";
import { resetOutputFormatDetectionForTests } from "./worker/codex-cli-capabilities.ts";
import { WorkerState, WorkspaceManager } from "./workspace/workspace.ts";
import { parseRepository } from "./git-utils.ts";
import { ok } from "neverthrow";

class JsonFlagFallbackExecutor implements CodexCommandExecutor {
  attempts = 0;
  argsHistory: string[][] = [];

  async executeStreaming(
    args: string[],
    _cwd: string,
    _onData: (data: Uint8Array) => void,
    _abortSignal?: AbortSignal,
    _onProcessStart?: (childProcess: Deno.ChildProcess) => void,
    _env?: Record<string, string>,
    _options?: { usePty?: boolean },
  ) {
    this.attempts++;
    this.argsHistory.push([...args]);
    const encoder = new TextEncoder();

    if (this.attempts === 1) {
      const stderrMessage =
        "error: unexpected argument '--json' found\n";
      return ok({ code: 2, stderr: encoder.encode(stderrMessage) });
    }

    const sessionMessage = `${
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "test-session-id",
        apiKeySource: "env",
        cwd: ".",
        tools: [],
        mcp_servers: [],
        model: "test-model",
        permissionMode: "default",
      })
    }\n`;
    _onData(encoder.encode(sessionMessage));

    const resultMessage = `${
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "ok",
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        session_id: "test-session-id",
        total_cost_usd: 0,
      })
    }\n`;
    _onData(encoder.encode(resultMessage));

    return ok({ code: 0, stderr: new Uint8Array() });
  }
}

class VerboseFallbackExecutor implements CodexCommandExecutor {
  attempts = 0;
  argsHistory: string[][] = [];

  async executeStreaming(
    args: string[],
    _cwd: string,
    onData: (data: Uint8Array) => void,
    _abortSignal?: AbortSignal,
    _onProcessStart?: (childProcess: Deno.ChildProcess) => void,
    _env?: Record<string, string>,
    _options?: { usePty?: boolean },
  ) {
    this.attempts++;
    this.argsHistory.push([...args]);
    const encoder = new TextEncoder();

    if (this.attempts === 1) {
      const stderrMessage = "error: unexpected argument '--verbose' found\n";
      return ok({ code: 2, stderr: encoder.encode(stderrMessage) });
    }

    const sessionMessage = `${
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "test-session-id",
        apiKeySource: "env",
        cwd: ".",
        tools: [],
        mcp_servers: [],
        model: "test-model",
        permissionMode: "default",
      })
    }\n`;
    onData(encoder.encode(sessionMessage));

    const resultMessage = `${
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "ok",
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        session_id: "test-session-id",
        total_cost_usd: 0,
      })
    }\n`;
    onData(encoder.encode(resultMessage));

    return ok({ code: 0, stderr: new Uint8Array() });
  }
}

class MultipleFlagFallbackExecutor implements CodexCommandExecutor {
  attempts = 0;
  argsHistory: string[][] = [];

  async executeStreaming(
    args: string[],
    _cwd: string,
    onData: (data: Uint8Array) => void,
    _abortSignal?: AbortSignal,
    _onProcessStart?: (childProcess: Deno.ChildProcess) => void,
    _env?: Record<string, string>,
    _options?: { usePty?: boolean },
  ) {
    this.attempts++;
    this.argsHistory.push([...args]);
    const encoder = new TextEncoder();

    if (this.attempts === 1) {
      const stderrMessage =
        "error: unexpected argument '--json' found\n";
      return ok({ code: 2, stderr: encoder.encode(stderrMessage) });
    }

    if (this.attempts === 2) {
      const stderrMessage = "error: unexpected argument '--verbose' found\n";
      return ok({ code: 2, stderr: encoder.encode(stderrMessage) });
    }

    if (this.attempts === 3) {
      const stderrMessage =
        "error: unexpected argument '--dangerously-bypass-approvals-and-sandbox' found\n";
      return ok({ code: 2, stderr: encoder.encode(stderrMessage) });
    }

    const sessionMessage = `${
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "test-session-id",
        apiKeySource: "env",
        cwd: ".",
        tools: [],
        mcp_servers: [],
        model: "test-model",
        permissionMode: "default",
      })
    }\n`;
    onData(encoder.encode(sessionMessage));

    const resultMessage = `${
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "ok",
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        session_id: "test-session-id",
        total_cost_usd: 0,
      })
    }\n`;
    onData(encoder.encode(resultMessage));

    return ok({ code: 0, stderr: new Uint8Array() });
  }
}

class DangerouslySkipPermissionsFallbackExecutor implements CodexCommandExecutor {
  attempts = 0;
  argsHistory: string[][] = [];

  async executeStreaming(
    args: string[],
    _cwd: string,
    onData: (data: Uint8Array) => void,
    _abortSignal?: AbortSignal,
    _onProcessStart?: (childProcess: Deno.ChildProcess) => void,
    _env?: Record<string, string>,
    _options?: { usePty?: boolean },
  ) {
    this.attempts++;
    this.argsHistory.push([...args]);
    const encoder = new TextEncoder();

    if (this.attempts === 1) {
      const stderrMessage =
        "error: unexpected argument '--dangerously-bypass-approvals-and-sandbox' found\n";
      return ok({ code: 2, stderr: encoder.encode(stderrMessage) });
    }

    const sessionMessage = `${
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "test-session-id",
        apiKeySource: "env",
        cwd: ".",
        tools: [],
        mcp_servers: [],
        model: "test-model",
        permissionMode: "default",
      })
    }\n`;
    onData(encoder.encode(sessionMessage));

    const resultMessage = `${
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "ok",
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        session_id: "test-session-id",
        total_cost_usd: 0,
      })
    }\n`;
    onData(encoder.encode(resultMessage));

    return ok({ code: 0, stderr: new Uint8Array() });
  }
}

class TtyFallbackExecutor implements CodexCommandExecutor {
  attempts = 0;
  optionsHistory: Array<{ usePty?: boolean }> = [];

  async executeStreaming(
    args: string[],
    _cwd: string,
    onData: (data: Uint8Array) => void,
    _abortSignal?: AbortSignal,
    _onProcessStart?: (childProcess: Deno.ChildProcess) => void,
    _env?: Record<string, string>,
    options?: { usePty?: boolean },
  ) {
    this.attempts++;
    this.optionsHistory.push({ usePty: options?.usePty });
    const encoder = new TextEncoder();

    if (this.attempts === 1) {
      const stderrMessage = "Error: stdout is not a terminal\n";
      return ok({ code: 1, stderr: encoder.encode(stderrMessage) });
    }

    const sessionMessage = `${
      JSON.stringify({
        type: "system",
        subtype: "init",
        session_id: "test-session-id",
        apiKeySource: "env",
        cwd: ".",
        tools: [],
        mcp_servers: [],
        model: "test-model",
        permissionMode: "default",
      })
    }\n`;
    onData(encoder.encode(sessionMessage));

    const assistantMessage = `${
      JSON.stringify({
        type: "assistant",
        subtype: "message",
        message: {
          content: "result",
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      })
    }\n`;
    onData(encoder.encode(assistantMessage));

    const resultMessage = `${
      JSON.stringify({
        type: "result",
        subtype: "success",
        result: "ok",
        duration_ms: 1,
        duration_api_ms: 1,
        is_error: false,
        num_turns: 1,
        session_id: "test-session-id",
        total_cost_usd: 0,
      })
    }\n`;
    onData(encoder.encode(resultMessage));

    return ok({ code: 0, stderr: new Uint8Array() });
  }
}

describe("Worker --json フラグ自動再試行", () => {
  it("Codex CLIが--jsonを拒否した場合に自動でフラグを無効化する", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceManager = new WorkspaceManager(tempDir);
      await workspaceManager.initialize();

      const executor = new JsonFlagFallbackExecutor();

      resetOutputFormatDetectionForTests();
      const repoPath = await Deno.makeTempDir();
      const gitInit = new Deno.Command("git", { args: ["init"], cwd: repoPath });
      await gitInit.output();

      try {
        const state: WorkerState = {
          workerName: "test-worker",
          threadId: "thread-id",
          devcontainerConfig: {
            useDevcontainer: false,
            useFallbackDevcontainer: false,
            hasDevcontainerFile: false,
            hasAnthropicsFeature: false,
            isStarted: false,
          },
          status: "active",
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        };

        const worker = new Worker(
          state,
          workspaceManager,
          executor,
          true,
        );

        const repositoryResult = parseRepository("test/repo");
        if (repositoryResult.isOk()) {
          await worker.setRepository(repositoryResult.value, repoPath);
        }

        worker.setUseDevcontainer(false);
        Object.defineProperty(worker, "codexExecutor", {
          value: executor,
          writable: true,
          configurable: true,
        });

        const result = await worker.processMessage("テスト");
        assertEquals(result.isOk(), true);
        assertEquals(executor.attempts, 2);

        const firstArgs = executor.argsHistory[0];
        const secondArgs = executor.argsHistory[1];
        assertEquals(firstArgs.includes("--json"), true);
        assertEquals(secondArgs.includes("--json"), false);
      } finally {
        await Deno.remove(repoPath, { recursive: true });
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
      resetOutputFormatDetectionForTests();
    }
  });
});

describe("Worker --verbose フラグ自動再試行", () => {
  it("Codex CLIが--verboseを拒否した場合に自動でフラグを無効化する", async () => {
    const tempDir = await Deno.makeTempDir();
    try {
      const workspaceManager = new WorkspaceManager(tempDir);
      await workspaceManager.initialize();

      const executor = new VerboseFallbackExecutor();

      resetOutputFormatDetectionForTests();
      const repoPath = await Deno.makeTempDir();
      const gitInit = new Deno.Command("git", { args: ["init"], cwd: repoPath });
      await gitInit.output();

      try {
        const state: WorkerState = {
          workerName: "test-worker",
          threadId: "thread-id",
          devcontainerConfig: {
            useDevcontainer: false,
            useFallbackDevcontainer: false,
            hasDevcontainerFile: false,
            hasAnthropicsFeature: false,
            isStarted: false,
          },
          status: "active",
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        };

        const worker = new Worker(
          state,
          workspaceManager,
          executor,
          true,
        );

        const repositoryResult = parseRepository("test/repo");
        if (repositoryResult.isOk()) {
          await worker.setRepository(repositoryResult.value, repoPath);
        }

        worker.setUseDevcontainer(false);
        Object.defineProperty(worker, "codexExecutor", {
          value: executor,
          writable: true,
          configurable: true,
        });

        const result = await worker.processMessage("テスト");
        assertEquals(result.isOk(), true);
        assertEquals(executor.attempts, 2);

        const firstArgs = executor.argsHistory[0];
        const secondArgs = executor.argsHistory[1];
        assertEquals(firstArgs.includes("--verbose"), true);
        assertEquals(secondArgs.includes("--verbose"), false);
      } finally {
        await Deno.remove(repoPath, { recursive: true });
      }
    } finally {
      await Deno.remove(tempDir, { recursive: true });
      resetOutputFormatDetectionForTests();
    }
  });
});

describe("Worker --dangerously-bypass-approvals-and-sandbox フラグ自動再試行", () => {
  it(
    "Codex CLIが--dangerously-bypass-approvals-and-sandboxを拒否した場合に自動でフラグを無効化する",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        const workspaceManager = new WorkspaceManager(tempDir);
        await workspaceManager.initialize();

        const executor = new DangerouslySkipPermissionsFallbackExecutor();

        resetOutputFormatDetectionForTests();
        const repoPath = await Deno.makeTempDir();
        const gitInit = new Deno.Command("git", { args: ["init"], cwd: repoPath });
        await gitInit.output();

        try {
          const state: WorkerState = {
            workerName: "test-worker",
            threadId: "thread-id",
            devcontainerConfig: {
              useDevcontainer: false,
              useFallbackDevcontainer: false,
              hasDevcontainerFile: false,
              hasAnthropicsFeature: false,
              isStarted: false,
            },
            status: "active",
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          };

          const worker = new Worker(
            state,
            workspaceManager,
            executor,
            true,
          );

          const repositoryResult = parseRepository("test/repo");
          if (repositoryResult.isOk()) {
            await worker.setRepository(repositoryResult.value, repoPath);
          }

          worker.setUseDevcontainer(false);
          Object.defineProperty(worker, "codexExecutor", {
            value: executor,
            writable: true,
            configurable: true,
          });

          const result = await worker.processMessage("テスト");
          assertEquals(result.isOk(), true);
          assertEquals(executor.attempts, 2);

          const firstArgs = executor.argsHistory[0];
          const secondArgs = executor.argsHistory[1];
          assertEquals(firstArgs.includes("--dangerously-bypass-approvals-and-sandbox"), true);
          assertEquals(secondArgs.includes("--dangerously-bypass-approvals-and-sandbox"), false);
        } finally {
          await Deno.remove(repoPath, { recursive: true });
          resetOutputFormatDetectionForTests();
        }
      } finally {
        await Deno.remove(tempDir, { recursive: true });
        resetOutputFormatDetectionForTests();
      }
    },
  );
});

describe("Worker Codex CLI TTYフォールバック", () => {
  it(
    "Codex CLIがTTYを要求する場合にscript経由の実行へ切り替える",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        const workspaceManager = new WorkspaceManager(tempDir);
        await workspaceManager.initialize();

        const executor = new TtyFallbackExecutor();

        resetOutputFormatDetectionForTests();
        const repoPath = await Deno.makeTempDir();
        const gitInit = new Deno.Command("git", { args: ["init"], cwd: repoPath });
        await gitInit.output();

        try {
          const state: WorkerState = {
            workerName: "test-worker",
            threadId: "thread-id",
            devcontainerConfig: {
              useDevcontainer: false,
              useFallbackDevcontainer: false,
              hasDevcontainerFile: false,
              hasAnthropicsFeature: false,
              isStarted: false,
            },
            status: "active",
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          };

          const worker = new Worker(
            state,
            workspaceManager,
            executor,
            true,
          );

          const repositoryResult = parseRepository("test/repo");
          if (repositoryResult.isOk()) {
            await worker.setRepository(repositoryResult.value, repoPath);
          }

          worker.setUseDevcontainer(false);
          Object.defineProperty(worker, "codexExecutor", {
            value: executor,
            writable: true,
            configurable: true,
          });

          const result = await worker.processMessage("テスト");
          assertEquals(result.isOk(), true);
          assertEquals(executor.attempts, 2);
          assertEquals(executor.optionsHistory[0].usePty, false);
          assertEquals(executor.optionsHistory[1].usePty, true);
        } finally {
          await Deno.remove(repoPath, { recursive: true });
          resetOutputFormatDetectionForTests();
        }
      } finally {
        await Deno.remove(tempDir, { recursive: true });
      }
    },
  );
});

describe("Worker Codex CLI互換フラグの多段再試行", () => {
  it(
    "--json・--verbose・--dangerously-bypass-approvals-and-sandboxが順に非対応でも順次無効化して成功する",
    async () => {
      const tempDir = await Deno.makeTempDir();
      try {
        const workspaceManager = new WorkspaceManager(tempDir);
        await workspaceManager.initialize();

        const executor = new MultipleFlagFallbackExecutor();

        resetOutputFormatDetectionForTests();
        const repoPath = await Deno.makeTempDir();
        const gitInit = new Deno.Command("git", { args: ["init"], cwd: repoPath });
        await gitInit.output();

        try {
          const state: WorkerState = {
            workerName: "test-worker",
            threadId: "thread-id",
            devcontainerConfig: {
              useDevcontainer: false,
              useFallbackDevcontainer: false,
              hasDevcontainerFile: false,
              hasAnthropicsFeature: false,
              isStarted: false,
            },
            status: "active",
            createdAt: new Date().toISOString(),
            lastActiveAt: new Date().toISOString(),
          };

          const worker = new Worker(
            state,
            workspaceManager,
            executor,
            true,
          );

          const repositoryResult = parseRepository("test/repo");
          if (repositoryResult.isOk()) {
            await worker.setRepository(repositoryResult.value, repoPath);
          }

          worker.setUseDevcontainer(false);
          Object.defineProperty(worker, "codexExecutor", {
            value: executor,
            writable: true,
            configurable: true,
          });

          const result = await worker.processMessage("テスト");
          assertEquals(result.isOk(), true);
          assertEquals(executor.attempts, 4);

          const firstArgs = executor.argsHistory[0];
          const secondArgs = executor.argsHistory[1];
          const thirdArgs = executor.argsHistory[2];
          const fourthArgs = executor.argsHistory[3];

          assertEquals(firstArgs.includes("--json"), true);
          assertEquals(firstArgs.includes("--verbose"), true);
          assertEquals(
            firstArgs.includes("--dangerously-bypass-approvals-and-sandbox"),
            true,
          );

          assertEquals(secondArgs.includes("--json"), false);
          assertEquals(secondArgs.includes("--verbose"), true);
          assertEquals(
            secondArgs.includes("--dangerously-bypass-approvals-and-sandbox"),
            true,
          );

          assertEquals(thirdArgs.includes("--json"), false);
          assertEquals(thirdArgs.includes("--verbose"), false);
          assertEquals(
            thirdArgs.includes("--dangerously-bypass-approvals-and-sandbox"),
            true,
          );

          assertEquals(fourthArgs.includes("--json"), false);
          assertEquals(fourthArgs.includes("--verbose"), false);
          assertEquals(
            fourthArgs.includes("--dangerously-bypass-approvals-and-sandbox"),
            false,
          );
        } finally {
          await Deno.remove(repoPath, { recursive: true });
        }
      } finally {
        await Deno.remove(tempDir, { recursive: true });
        resetOutputFormatDetectionForTests();
      }
    },
  );
});
