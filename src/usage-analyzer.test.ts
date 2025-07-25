/**
 * UsageAnalyzer のテストファイル
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.220.1/assert/mod.ts";
import { ensureDir, emptyDir } from "https://deno.land/std@0.220.1/fs/mod.ts";
import { join } from "node:path";
import { UsageAnalyzer } from "./usage-analyzer.ts";

const TEST_DIR = "/tmp/usage-analyzer-test";
const TEST_PROJECTS_DIR = join(TEST_DIR, "projects");

Deno.test("UsageAnalyzer - 基本的な統計生成", async () => {
  // テスト用ディレクトリを準備
  await ensureDir(TEST_PROJECTS_DIR);
  await emptyDir(TEST_PROJECTS_DIR);

  // テストデータ作成
  const projectDir = join(TEST_PROJECTS_DIR, "test-project-1");
  await ensureDir(projectDir);

  const sessionContent = [
    {
      sessionId: "test-session-1",
      timestamp: "2024-01-01T10:00:00.000Z",
      type: "user",
      message: { role: "user", content: "Hello" },
      cwd: "/test/project",
      gitBranch: "main",
      version: "1.0.0"
    },
    {
      sessionId: "test-session-1",
      timestamp: "2024-01-01T10:00:10.000Z",
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hello back!" }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 2,
          cache_read_input_tokens: 3
        }
      }
    },
    {
      sessionId: "test-session-1",
      timestamp: "2024-01-01T10:01:00.000Z",
      type: "user",
      message: { role: "user", content: "How are you?" }
    },
    {
      sessionId: "test-session-1",
      timestamp: "2024-01-01T10:01:10.000Z",
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "I'm doing well, thank you!" }],
        usage: {
          input_tokens: 15,
          output_tokens: 8,
          cache_creation_input_tokens: 1,
          cache_read_input_tokens: 2
        }
      }
    }
  ].map(entry => JSON.stringify(entry)).join("\n");

  await Deno.writeTextFile(
    join(projectDir, "test-session-1.jsonl"),
    sessionContent
  );

  // UsageAnalyzer でテスト
  const analyzer = new UsageAnalyzer(TEST_PROJECTS_DIR);
  const report = await analyzer.generateReport(365);

  // 基本的な統計を検証
  assertEquals(report.totalSessions, 1);
  assertEquals(report.totalMessages, 4);
  assertEquals(report.totalTokens.input_tokens, 25);
  assertEquals(report.totalTokens.output_tokens, 13);
  assertEquals(report.totalTokens.cache_creation_input_tokens, 3);
  assertEquals(report.totalTokens.cache_read_input_tokens, 5);

  // 日次統計を検証
  assertEquals(report.dailyStats.length, 1);
  assertEquals(report.dailyStats[0].date, "2024-01-01");
  assertEquals(report.dailyStats[0].totalSessions, 1);

  // プロジェクト統計を検証
  assertExists(report.topProjects);
  assertEquals(report.topProjects.length, 1);
  assertEquals(report.topProjects[0].project, "project");

  // JSON 出力を検証
  const jsonReport = await analyzer.generateJsonReport(365);
  const parsed = JSON.parse(jsonReport);
  assertEquals(parsed.totalSessions, 1);

  // サマリーを検証
  const summary = await analyzer.generateSummary(365);
  assertEquals(typeof summary, "string");
  assertEquals(summary.includes("Total Sessions: 1"), true);
  assertEquals(summary.includes("Total Tokens: 46"), true);

  // クリーンアップ
  await emptyDir(TEST_DIR);
});

Deno.test("UsageAnalyzer - 複数セッション・複数プロジェクト", async () => {
  // テスト用ディレクトリを準備
  await ensureDir(TEST_PROJECTS_DIR);
  await emptyDir(TEST_PROJECTS_DIR);

  // プロジェクト1
  const project1Dir = join(TEST_PROJECTS_DIR, "project-1");
  await ensureDir(project1Dir);

  const session1Content = [
    {
      sessionId: "session-1",
      timestamp: "2024-01-01T10:00:00.000Z",
      type: "user",
      message: { role: "user", content: "Test 1" },
      cwd: "/test/repo1",
      gitBranch: "feature-1",
      version: "1.0.0"
    },
    {
      sessionId: "session-1",
      timestamp: "2024-01-01T10:00:10.000Z",
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Response 1" }],
        usage: { input_tokens: 100, output_tokens: 50 }
      }
    }
  ].map(entry => JSON.stringify(entry)).join("\n");

  await Deno.writeTextFile(
    join(project1Dir, "session-1.jsonl"),
    session1Content
  );

  // プロジェクト2
  const project2Dir = join(TEST_PROJECTS_DIR, "project-2");
  await ensureDir(project2Dir);

  const session2Content = [
    {
      sessionId: "session-2",
      timestamp: "2024-01-02T14:00:00.000Z",
      type: "user",
      message: { role: "user", content: "Test 2" },
      cwd: "/test/repo2",
      gitBranch: "main",
      version: "1.0.0"
    },
    {
      sessionId: "session-2",
      timestamp: "2024-01-02T14:00:10.000Z",
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Response 2" }],
        usage: { input_tokens: 200, output_tokens: 100 }
      }
    }
  ].map(entry => JSON.stringify(entry)).join("\n");

  await Deno.writeTextFile(
    join(project2Dir, "session-2.jsonl"),
    session2Content
  );

  // 統計を生成
  const analyzer = new UsageAnalyzer(TEST_PROJECTS_DIR);
  const report = await analyzer.generateReport(365);

  // 複数セッション・プロジェクトを検証
  assertEquals(report.totalSessions, 2);
  assertEquals(report.totalMessages, 4);
  assertEquals(report.totalTokens.input_tokens, 300);
  assertEquals(report.totalTokens.output_tokens, 150);

  // 日次統計を検証（2日分）
  assertEquals(report.dailyStats.length, 2);
  assertEquals(report.dailyStats[0].date, "2024-01-01");
  assertEquals(report.dailyStats[1].date, "2024-01-02");

  // プロジェクト統計を検証
  assertEquals(report.topProjects.length, 2);

  // ブランチ統計を検証
  assertEquals(report.topBranches.length, 2);

  // クリーンアップ
  await emptyDir(TEST_DIR);
});

Deno.test("UsageAnalyzer - 無効なJSONL行の処理", async () => {
  // テスト用ディレクトリを準備
  await ensureDir(TEST_PROJECTS_DIR);
  await emptyDir(TEST_PROJECTS_DIR);

  const projectDir = join(TEST_PROJECTS_DIR, "test-invalid-json");
  await ensureDir(projectDir);

  // 無効なJSONを含むセッションファイル
  const invalidContent = [
    JSON.stringify({
      sessionId: "test",
      timestamp: "2024-01-01T10:00:00.000Z",
      type: "user",
      message: { role: "user", content: "Valid message" }
    }),
    "{ invalid json line",
    JSON.stringify({
      sessionId: "test",
      timestamp: "2024-01-01T10:00:10.000Z",
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Valid response" }],
        usage: { input_tokens: 10, output_tokens: 5 }
      }
    }),
    "another invalid line"
  ].join("\n");

  await Deno.writeTextFile(
    join(projectDir, "test-invalid.jsonl"),
    invalidContent
  );

  // エラーを投げずに処理できることを確認
  const analyzer = new UsageAnalyzer(TEST_PROJECTS_DIR);
  const report = await analyzer.generateReport(365);

  // 有効な行のみが処理されることを確認
  assertEquals(report.totalSessions, 1);
  assertEquals(report.totalMessages, 2);
  assertEquals(report.totalTokens.input_tokens, 10);
  assertEquals(report.totalTokens.output_tokens, 5);

  // クリーンアップ
  await emptyDir(TEST_DIR);
});

Deno.test("UsageAnalyzer - 空のディレクトリ処理", async () => {
  // テスト用ディレクトリを準備
  await ensureDir(TEST_PROJECTS_DIR);
  await emptyDir(TEST_PROJECTS_DIR);

  const analyzer = new UsageAnalyzer(TEST_PROJECTS_DIR);
  const report = await analyzer.generateReport(365);

  // 空の結果を検証
  assertEquals(report.totalSessions, 0);
  assertEquals(report.totalMessages, 0);
  assertEquals(report.totalTokens.input_tokens, 0);
  assertEquals(report.totalTokens.output_tokens, 0);
  assertEquals(report.dailyStats.length, 0);
  assertEquals(report.topProjects.length, 0);
  assertEquals(report.topBranches.length, 0);

  // JSON とサマリーも正常に生成されることを確認
  const jsonReport = await analyzer.generateJsonReport(365);
  assertExists(jsonReport);

  const summary = await analyzer.generateSummary(365);
  assertEquals(summary.includes("Total Sessions: 0"), true);

  // クリーンアップ
  await emptyDir(TEST_DIR);
});