/**
 * Claude Code の使用統計を JSONL セッションログから解析し、JSON 形式で出力するシステム
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface SessionStats {
  sessionId: string;
  startTime: string;
  endTime?: string;
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  totalTokens: TokenUsage;
  project?: string;
  gitBranch?: string;
  version?: string;
}

export interface DailyStats {
  date: string;
  totalSessions: number;
  totalMessages: number;
  totalTokens: TokenUsage;
  sessions: SessionStats[];
}

export interface UsageReport {
  generated: string;
  totalSessions: number;
  totalMessages: number;
  totalTokens: TokenUsage;
  dailyStats: DailyStats[];
  topProjects: Array<{
    project: string;
    sessions: number;
    tokens: TokenUsage;
  }>;
  topBranches: Array<{
    branch: string;
    sessions: number;
    tokens: TokenUsage;
  }>;
}

/**
 * Claude Code 使用統計解析クラス
 */
export class UsageAnalyzer {
  private claudeProjectsDir: string;

  constructor(claudeProjectsDir?: string) {
    this.claudeProjectsDir = claudeProjectsDir || join(
      process.env.HOME || "~",
      ".claude",
      "projects",
    );
  }

  /**
   * 指定した期間の使用統計を JSON 形式で出力
   */
  async generateReport(days = 30): Promise<UsageReport> {
    const sessions = await this.analyzeSessions(days);
    const dailyStats = this.groupByDate(sessions);
    const totalTokens = this.sumTokens(sessions.map((s) => s.totalTokens));

    return {
      generated: new Date().toISOString(),
      totalSessions: sessions.length,
      totalMessages: sessions.reduce((sum, s) => sum + s.totalMessages, 0),
      totalTokens,
      dailyStats,
      topProjects: this.getTopProjects(sessions),
      topBranches: this.getTopBranches(sessions),
    };
  }

  /**
   * セッションログを解析
   */
  private async analyzeSessions(days: number): Promise<SessionStats[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const projectDirs = await readdir(this.claudeProjectsDir);
    const sessions: SessionStats[] = [];

    for (const projectDir of projectDirs) {
      const projectPath = join(this.claudeProjectsDir, projectDir);
      const projectStat = await stat(projectPath);

      if (!projectStat.isDirectory()) continue;

      try {
        const files = await readdir(projectPath);
        const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

        for (const jsonlFile of jsonlFiles) {
          const filePath = join(projectPath, jsonlFile);
          const fileStat = await stat(filePath);

          // 期間外のファイルをスキップ
          if (fileStat.mtime < cutoffDate) continue;

          const sessionStats = await this.analyzeSessionFile(
            filePath,
            projectDir,
          );
          if (sessionStats) {
            sessions.push(sessionStats);
          }
        }
      } catch (error) {
        console.warn(`Failed to analyze project ${projectDir}:`, error);
      }
    }

    return sessions.sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }

  /**
   * 単一セッションファイルを解析
   */
  private async analyzeSessionFile(
    filePath: string,
    projectDir: string,
  ): Promise<SessionStats | null> {
    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.split("\n").filter((line) => line.trim());

      if (lines.length === 0) return null;

      const sessionId = filePath.split("/").pop()?.replace(".jsonl", "") || "";
      let startTime = "";
      let endTime = "";
      let userMessages = 0;
      let assistantMessages = 0;
      let totalTokens: TokenUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };
      let project = "";
      let gitBranch = "";
      let version = "";

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          // 最初のエントリから開始時刻を取得
          if (!startTime && entry.timestamp) {
            startTime = entry.timestamp;
          }

          // 最後のエントリから終了時刻を取得
          if (entry.timestamp) {
            endTime = entry.timestamp;
          }

          // プロジェクト情報を抽出
          if (entry.cwd && !project) {
            project = this.extractProjectName(entry.cwd);
          }
          if (entry.gitBranch && !gitBranch) {
            gitBranch = entry.gitBranch;
          }
          if (entry.version && !version) {
            version = entry.version;
          }

          // メッセージ種別をカウント
          if (entry.type === "user") {
            userMessages++;
          } else if (entry.type === "assistant") {
            assistantMessages++;

            // トークン使用量を累積
            if (entry.message?.usage) {
              const usage = entry.message.usage;
              totalTokens.input_tokens += usage.input_tokens || 0;
              totalTokens.output_tokens += usage.output_tokens || 0;
              totalTokens.cache_creation_input_tokens! += 
                usage.cache_creation_input_tokens || 0;
              totalTokens.cache_read_input_tokens! += 
                usage.cache_read_input_tokens || 0;
            }
          }
        } catch (parseError) {
          // 無効な JSON 行をスキップ
          continue;
        }
      }

      return {
        sessionId,
        startTime,
        endTime,
        totalMessages: userMessages + assistantMessages,
        userMessages,
        assistantMessages,
        totalTokens,
        project: project || projectDir,
        gitBranch,
        version,
      };
    } catch (error) {
      console.warn(`Failed to analyze session file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * プロジェクト名を CWD から抽出
   */
  private extractProjectName(cwd: string): string {
    const parts = cwd.split("/");
    const repoIndex = parts.findIndex((part) => part === "repositories");
    
    if (repoIndex !== -1 && repoIndex + 2 < parts.length) {
      return `${parts[repoIndex + 1]}/${parts[repoIndex + 2]}`;
    }

    const worktreeIndex = parts.findIndex((part) => part === "worktrees");
    if (worktreeIndex !== -1 && worktreeIndex + 1 < parts.length) {
      return `worktree-${parts[worktreeIndex + 1]}`;
    }

    return parts[parts.length - 1] || "unknown";
  }

  /**
   * セッションを日付ごとにグループ化
   */
  private groupByDate(sessions: SessionStats[]): DailyStats[] {
    const dailyMap = new Map<string, SessionStats[]>();

    for (const session of sessions) {
      const date = session.startTime.split("T")[0];
      if (!dailyMap.has(date)) {
        dailyMap.set(date, []);
      }
      dailyMap.get(date)!.push(session);
    }

    const dailyStats: DailyStats[] = [];
    for (const [date, dateSessions] of dailyMap) {
      const totalTokens = this.sumTokens(dateSessions.map((s) => s.totalTokens));
      dailyStats.push({
        date,
        totalSessions: dateSessions.length,
        totalMessages: dateSessions.reduce((sum, s) => sum + s.totalMessages, 0),
        totalTokens,
        sessions: dateSessions,
      });
    }

    return dailyStats.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * トップ プロジェクトを取得
   */
  private getTopProjects(sessions: SessionStats[]): Array<{
    project: string;
    sessions: number;
    tokens: TokenUsage;
  }> {
    const projectMap = new Map<string, SessionStats[]>();

    for (const session of sessions) {
      const project = session.project || "unknown";
      if (!projectMap.has(project)) {
        projectMap.set(project, []);
      }
      projectMap.get(project)!.push(session);
    }

    const projects = Array.from(projectMap.entries()).map(([project, sessions]) => ({
      project,
      sessions: sessions.length,
      tokens: this.sumTokens(sessions.map((s) => s.totalTokens)),
    }));

    return projects
      .sort((a, b) => this.getTotalTokenCount(b.tokens) - this.getTotalTokenCount(a.tokens))
      .slice(0, 10);
  }

  /**
   * トップ ブランチを取得
   */
  private getTopBranches(sessions: SessionStats[]): Array<{
    branch: string;
    sessions: number;
    tokens: TokenUsage;
  }> {
    const branchMap = new Map<string, SessionStats[]>();

    for (const session of sessions) {
      const branch = session.gitBranch || "unknown";
      if (!branchMap.has(branch)) {
        branchMap.set(branch, []);
      }
      branchMap.get(branch)!.push(session);
    }

    const branches = Array.from(branchMap.entries()).map(([branch, sessions]) => ({
      branch,
      sessions: sessions.length,
      tokens: this.sumTokens(sessions.map((s) => s.totalTokens)),
    }));

    return branches
      .sort((a, b) => this.getTotalTokenCount(b.tokens) - this.getTotalTokenCount(a.tokens))
      .slice(0, 10);
  }

  /**
   * トークン使用量を合計
   */
  private sumTokens(tokenUsages: TokenUsage[]): TokenUsage {
    return tokenUsages.reduce(
      (sum, usage) => ({
        input_tokens: sum.input_tokens + usage.input_tokens,
        output_tokens: sum.output_tokens + usage.output_tokens,
        cache_creation_input_tokens: 
          (sum.cache_creation_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
        cache_read_input_tokens: 
          (sum.cache_read_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
      }),
      {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    );
  }

  /**
   * 総トークン数を計算
   */
  private getTotalTokenCount(usage: TokenUsage): number {
    return usage.input_tokens + usage.output_tokens + 
           (usage.cache_creation_input_tokens || 0) + 
           (usage.cache_read_input_tokens || 0);
  }

  /**
   * 統計をフォーマットされた JSON 文字列として出力
   */
  async generateJsonReport(days = 30): Promise<string> {
    const report = await this.generateReport(days);
    return JSON.stringify(report, null, 2);
  }

  /**
   * 簡潔なサマリーを出力
   */
  async generateSummary(days = 30): Promise<string> {
    const report = await this.generateReport(days);
    const totalTokens = this.getTotalTokenCount(report.totalTokens);

    return [
      `Claude Code Usage Summary (Last ${days} days)`,
      `Generated: ${new Date(report.generated).toLocaleString()}`,
      "",
      `Total Sessions: ${report.totalSessions}`,
      `Total Messages: ${report.totalMessages}`,
      `Total Tokens: ${totalTokens.toLocaleString()}`,
      `  - Input: ${report.totalTokens.input_tokens.toLocaleString()}`,
      `  - Output: ${report.totalTokens.output_tokens.toLocaleString()}`,
      `  - Cache Creation: ${(report.totalTokens.cache_creation_input_tokens || 0).toLocaleString()}`,
      `  - Cache Read: ${(report.totalTokens.cache_read_input_tokens || 0).toLocaleString()}`,
      "",
      `Daily Average: ${Math.round(totalTokens / days).toLocaleString()} tokens/day`,
      `Top Project: ${report.topProjects[0]?.project || "N/A"}`,
      `Top Branch: ${report.topBranches[0]?.branch || "N/A"}`,
    ].join("\n");
  }
}