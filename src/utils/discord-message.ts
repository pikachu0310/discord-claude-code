import { DISCORD } from "../constants.ts";

const CODE_BLOCK_PADDING = 8; // 追加で閉じたり開いたりする分の余白

/**
 * Discordのメッセージ長制限を考慮してコンテンツを分割する
 */
export function splitDiscordMessage(
  content: string,
  chunkSize = DISCORD.DEFAULT_CHUNK_LENGTH,
): string[] {
  const normalized = content.replace(/\r\n/g, "\n");
  if (normalized.length === 0) {
    return [];
  }

  if (normalized.length <= Math.min(chunkSize, DISCORD.MAX_MESSAGE_LENGTH)) {
    return [normalized];
  }

  const effectiveLimit = Math.max(
    50,
    Math.min(chunkSize, DISCORD.MAX_MESSAGE_LENGTH) - CODE_BLOCK_PADDING,
  );
  const forcedLimit = DISCORD.MAX_MESSAGE_LENGTH - CODE_BLOCK_PADDING;

  const segments: string[] = [];
  let buffer = "";

  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const suffix = i < lines.length - 1 ? "\n" : "";
    const candidate = buffer + line + suffix;

    if (candidate.length > effectiveLimit && buffer.length > 0) {
      segments.push(buffer);
      buffer = line + suffix;
      continue;
    }

    if ((line + suffix).length > effectiveLimit) {
      if (buffer.length > 0) {
        segments.push(buffer);
        buffer = "";
      }
      let remaining = line + suffix;
      while (remaining.length > effectiveLimit) {
        segments.push(remaining.slice(0, effectiveLimit));
        remaining = remaining.slice(effectiveLimit);
      }
      buffer = remaining;
      continue;
    }

    buffer = candidate;
  }

  if (buffer.length > 0) {
    segments.push(buffer);
  }

  const finalChunks: string[] = [];
  let reopenCodeBlock = false;

  for (const segment of segments) {
    if (!segment) continue;
    const forcedSegments = forceSplit(segment, forcedLimit);

    for (const forcedSegment of forcedSegments) {
      if (!forcedSegment) continue;

      let chunk = forcedSegment;
      if (reopenCodeBlock) {
        chunk = `\`\`\`\n${chunk}`;
      }

      const tickMatches = forcedSegment.match(/```/g);
      const toggled = tickMatches ? tickMatches.length % 2 !== 0 : false;

      if (toggled) {
        chunk = chunk.endsWith("```") ? chunk : `${chunk}\n\`\`\``;
      }

      finalChunks.push(chunk);
      reopenCodeBlock = toggled;
    }
  }

  return finalChunks.length > 0 ? finalChunks : [normalized];
}

function forceSplit(text: string, limit: number): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const result: string[] = [];
  let index = 0;

  while (index < text.length) {
    result.push(text.slice(index, index + limit));
    index += limit;
  }

  return result;
}
