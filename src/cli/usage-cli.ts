#!/usr/bin/env -S deno run --allow-read --allow-env
/**
 * Claude Code 使用統計 CLI
 */

import { UsageAnalyzer } from "../usage-analyzer.ts";
import { parseArgs } from "https://deno.land/std@0.220.1/cli/parse_args.ts";

interface CliOptions {
  days: number;
  format: "json" | "summary";
  output?: string;
  projects?: string;
  help: boolean;
}

const HELP_TEXT = `
Claude Code Usage Analyzer

Usage: deno run --allow-read --allow-env usage-cli.ts [options]

Options:
  --days <number>      Number of days to analyze (default: 30)
  --format <format>    Output format: json, summary (default: summary)
  --output <file>      Output file (default: stdout)
  --projects <dir>     Claude projects directory (default: ~/.claude/projects)
  --help               Show this help message

Examples:
  # Show 30-day summary
  deno run --allow-read --allow-env usage-cli.ts

  # Generate JSON report for last 7 days
  deno run --allow-read --allow-env usage-cli.ts --days 7 --format json

  # Save detailed report to file
  deno run --allow-read --allow-env usage-cli.ts --days 90 --format json --output usage-report.json

  # Use custom Claude projects directory
  deno run --allow-read --allow-env usage-cli.ts --projects /custom/path/.claude/projects
`;

async function main() {
  const args = parseArgs(Deno.args, {
    string: ["format", "output", "projects"],
    boolean: ["help"],
    default: {
      days: 30,
      format: "summary",
      help: false,
    },
  });

  const options: CliOptions = {
    days: parseInt(args.days?.toString() || "30", 10),
    format: args.format as "json" | "summary",
    output: args.output,
    projects: args.projects,
    help: args.help,
  };

  if (options.help) {
    console.log(HELP_TEXT);
    Deno.exit(0);
  }

  if (options.days <= 0 || options.days > 365) {
    console.error("Error: Days must be between 1 and 365");
    Deno.exit(1);
  }

  if (!["json", "summary"].includes(options.format)) {
    console.error("Error: Format must be 'json' or 'summary'");
    Deno.exit(1);
  }

  try {
    const analyzer = new UsageAnalyzer(options.projects);
    
    let output: string;
    if (options.format === "json") {
      output = await analyzer.generateJsonReport(options.days);
    } else {
      output = await analyzer.generateSummary(options.days);
    }

    if (options.output) {
      await Deno.writeTextFile(options.output, output);
      console.log(`Report saved to: ${options.output}`);
    } else {
      console.log(output);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error generating usage report:", errorMessage);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}