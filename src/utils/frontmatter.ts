import { logger } from './logger.js';
import { getErrorMessage } from './error-utils.js';
import type { IssueDifficultyAssessment } from '../types.js';

/**
 * IssueDifficultyAssessmentからHTML <details> 折りたたみ形式のメタデータ文字列を生成する。
 */
export function generateFrontmatter(assessment: IssueDifficultyAssessment): string {
  const lines: string[] = ['<details>', '<summary>メタデータ</summary>', ''];

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
  lines.push('');
  lines.push('</details>');
  lines.push('');

  return lines.join('\n');
}

/**
 * Issue本文の先頭にfrontmatterを挿入する。
 * 既存のfrontmatterがある場合は置換する。
 */
export function insertFrontmatter(body: string, frontmatter: string): string {
  const normalizedFrontmatter = frontmatter.endsWith('\n')
    ? frontmatter
    : `${frontmatter}\n`;

  if (!body) {
    return normalizedFrontmatter;
  }

  const existing = extractExistingFrontmatter(body);
  if (!existing) {
    return `${normalizedFrontmatter}\n${body}`;
  }

  const content = existing.content.trimStart();
  if (!content) {
    return normalizedFrontmatter;
  }

  return `${normalizedFrontmatter}\n${content}`;
}

/**
 * frontmatter付き文字列からメタデータとコンテンツを分離する。
 * 新形式（<details>タグ）と旧形式（---区切り）の両方に対応する。
 */
export function parseFrontmatter(body: string): {
  metadata: Record<string, unknown> | null;
  content: string;
} {
  if (!body) {
    return { metadata: null, content: '' };
  }

  try {
    const detailsMatch = body.match(
      /^<details>\n<summary>メタデータ<\/summary>\n\n([\s\S]*?)\n\n<\/details>\n/,
    );
    if (detailsMatch) {
      const metadata = parseFrontmatterLines(detailsMatch[1]);
      if (metadata) {
        return {
          metadata,
          content: body.slice(detailsMatch[0].length),
        };
      }
    }

    const yamlMatch = body.match(/^---\n([\s\S]*?)\n---\n/);
    if (yamlMatch) {
      const metadata = parseFrontmatterLines(yamlMatch[1]);
      if (metadata) {
        return {
          metadata,
          content: body.slice(yamlMatch[0].length),
        };
      }
    }

    return { metadata: null, content: body };
  } catch (error) {
    logger.warn(`Failed to parse frontmatter: ${getErrorMessage(error)}`);
    return { metadata: null, content: body };
  }
}

/**
 * Issue本文から既存のメタデータブロックを検出・抽出する。
 * 新形式（<details>タグ）を優先し、見つからない場合は旧形式（---区切り）にフォールバックする。
 */
function extractExistingFrontmatter(
  body: string,
): { frontmatter: string; content: string } | null {
  const detailsMatch = body.match(
    /^<details>\n<summary>メタデータ<\/summary>\n[\s\S]*?\n<\/details>\n/,
  );
  if (detailsMatch) {
    return {
      frontmatter: detailsMatch[0],
      content: body.slice(detailsMatch[0].length),
    };
  }

  const yamlMatch = body.match(/^---\n[\s\S]*?\n---\n/);
  if (yamlMatch) {
    return {
      frontmatter: yamlMatch[0],
      content: body.slice(yamlMatch[0].length),
    };
  }

  return null;
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
