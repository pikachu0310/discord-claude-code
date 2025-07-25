/**
 * Discord Bot用の使用統計コマンド
 */

import { UsageAnalyzer } from "../usage-analyzer.ts";
import { SlashCommandBuilder } from "npm:discord.js@14";
import type { ChatInputCommandInteraction } from "npm:discord.js@14";

export const usageCommand = {
  data: new SlashCommandBuilder()
    .setName("usage")
    .setDescription("Claude Code の使用統計を表示")
    .addIntegerOption(option =>
      option
        .setName("days")
        .setDescription("分析する日数 (1-90)")
        .setMinValue(1)
        .setMaxValue(90)
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName("format")
        .setDescription("出力形式")
        .addChoices(
          { name: "サマリー", value: "summary" },
          { name: "JSON", value: "json" }
        )
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    try {
      const days = interaction.options.getInteger("days") ?? 30;
      const format = interaction.options.getString("format") ?? "summary";

      const analyzer = new UsageAnalyzer();

      let content: string;
      let attachment: { name: string; content: string } | null = null;

      if (format === "json") {
        const jsonReport = await analyzer.generateJsonReport(days);
        
        // JSON は添付ファイルとして送信
        attachment = {
          name: `claude-usage-${days}days-${new Date().toISOString().split('T')[0]}.json`,
          content: jsonReport
        };
        
        // サマリーも表示
        content = await analyzer.generateSummary(days);
      } else {
        content = await analyzer.generateSummary(days);
      }

      // Discord の文字数制限対応 (2000文字)
      if (content.length > 1900) {
        content = content.substring(0, 1900) + "\n...(省略)";
      }

      const reply: any = { content: `\`\`\`\n${content}\n\`\`\`` };

      if (attachment) {
        reply.files = [{
          attachment: attachment.content,
          name: attachment.name
        }];
      }

      await interaction.editReply(reply);

    } catch (error) {
      console.error("Usage command error:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "使用統計の取得中にエラーが発生しました";

      await interaction.editReply({
        content: `❌ エラー: ${errorMessage}`,
      });
    }
  },
};

/**
 * 管理者用の詳細統計コマンド
 */
export const usageDetailCommand = {
  data: new SlashCommandBuilder()
    .setName("usage-detail")
    .setDescription("Claude Code の詳細使用統計を表示 (管理者のみ)")
    .addIntegerOption(option =>
      option
        .setName("days")
        .setDescription("分析する日数 (1-365)")
        .setMinValue(1)
        .setMaxValue(365)
        .setRequired(false)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    // 管理者権限チェック
    if (!interaction.memberPermissions?.has("Administrator")) {
      await interaction.reply({
        content: "❌ このコマンドは管理者のみ使用できます",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const days = interaction.options.getInteger("days") ?? 90;
      const analyzer = new UsageAnalyzer();

      const [summary, jsonReport] = await Promise.all([
        analyzer.generateSummary(days),
        analyzer.generateJsonReport(days)
      ]);

      const fileName = `claude-usage-detail-${days}days-${new Date().toISOString().split('T')[0]}.json`;

      await interaction.editReply({
        content: `\`\`\`\n${summary}\n\`\`\``,
        files: [{
          attachment: jsonReport,
          name: fileName
        }]
      });

    } catch (error) {
      console.error("Usage detail command error:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "詳細統計の取得中にエラーが発生しました";

      await interaction.editReply({
        content: `❌ エラー: ${errorMessage}`,
      });
    }
  },
};