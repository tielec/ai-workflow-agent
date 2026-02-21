import { logger } from './logger.js';
import { getErrorMessage } from './error-utils.js';
import type { IssueDifficultyAssessment } from '../types.js';

/**
 * IssueDifficultyAssessmentからYAML frontmatter文字列を生成する。
 */
export function generateFrontmatter(assessment: IssueDifficultyAssessment): string {
  const lines: string[] = ['---'];

  lines.push(`difficulty: ${assessment.grade}`);
  lines.push(`difficulty_label: ${assessment.label}`);
  lines.push('bug_risk:');
  lines.push(`  expected_bugs: ${assessment.bug_risk.expected_bugs}`);
  lines.push(`  probability: ${assessment.bug_risk.probability}`);
  lines.push(`  risk_score: ${assessment.bug_risk.risk_score.toFixed(2)}`);
  lines.push('rationale: |');

  const rationaleLines = assessment.rationale.split('\n');
  for (const line of rationaleLines) {
    lines.push(`  ${line}`);
  }

  lines.push(`assessed_by: ${assessment.assessed_by}`);
  lines.push(`assessed_at: ${assessment.assessed_at}`);
  lines.push('---');

  return lines.join('\n');
}

/**
 * Issue本文の先頭にfrontmatterを挿入する。
 * 既存のfrontmatterがある場合は置換する。
 */
export function insertFrontmatter(body: string, frontmatter: string): string {
  if (!body) {
    return frontmatter;
  }

  const existing = extractExistingFrontmatter(body);
  if (!existing) {
    return `${frontmatter}\n\n${body}`;
  }

  const content = existing.content.trimStart();
  if (!content) {
    return frontmatter;
  }

  return `${frontmatter}\n\n${content}`;
}

/**
 * frontmatter付き文字列からメタデータとコンテンツを分離する。
 */
export function parseFrontmatter(body: string): {
  metadata: Record<string, unknown> | null;
  content: string;
} {
  if (!body) {
    return { metadata: null, content: '' };
  }

  try {
    const match = body.match(/^---\n([\s\S]*?)\n---\n/);
    if (!match) {
      return { metadata: null, content: body };
    }

    const metadata = parseFrontmatterLines(match[1]);
    if (!metadata) {
      return { metadata: null, content: body };
    }

    return {
      metadata,
      content: body.slice(match[0].length),
    };
  } catch (error) {
    logger.warn(`Failed to parse frontmatter: ${getErrorMessage(error)}`);
    return { metadata: null, content: body };
  }
}

function extractExistingFrontmatter(
  body: string,
): { frontmatter: string; content: string } | null {
  const match = body.match(/^---\n[\s\S]*?\n---\n/);
  if (!match) {
    return null;
  }

  return {
    frontmatter: match[0],
    content: body.slice(match[0].length),
  };
}

function parseFrontmatterLines(raw: string): Record<string, unknown> | null {
  const metadata: Record<string, unknown> = {};
  const lines = raw.split('\n');
  let currentObject: Record<string, unknown> | null = null;
  let blockKey: string | null = null;
  let blockLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (blockKey) {
      if (line.startsWith('  ')) {
        blockLines.push(line.slice(2));
        continue;
      }
      metadata[blockKey] = blockLines.join('\n');
      blockKey = null;
      blockLines = [];
    }

    if (!line.trim()) {
      continue;
    }

    if (line.startsWith('  ')) {
      if (!currentObject) {
        return null;
      }
      const parsed = splitKeyValue(line.trimStart());
      if (!parsed) {
        return null;
      }
      currentObject[parsed.key] = parsed.value;
      continue;
    }

    const parsed = splitKeyValue(line);
    if (!parsed) {
      return null;
    }

    if (parsed.value === '|') {
      blockKey = parsed.key;
      blockLines = [];
      currentObject = null;
      continue;
    }

    if (parsed.value === '') {
      const child: Record<string, unknown> = {};
      metadata[parsed.key] = child;
      currentObject = child;
      continue;
    }

    metadata[parsed.key] = parsed.value;
    currentObject = null;
  }

  if (blockKey) {
    metadata[blockKey] = blockLines.join('\n');
  }

  return metadata;
}

function splitKeyValue(line: string): { key: string; value: string } | null {
  const separatorIndex = line.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim();
  const value = line.slice(separatorIndex + 1).trim();

  if (!key) {
    return null;
  }

  return { key, value };
}
