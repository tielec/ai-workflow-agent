import { logger } from '../../../utils/logger.js';
import { getErrorMessage } from '../../../utils/error-utils.js';
import type { ResponsePlan } from '../../../types/pr-comment.js';
import { isValidResponsePlanCandidate, normalizeResponsePlan } from './response-normalizer.js';
import { fixMojibake, sanitizeForJson } from '../../../utils/encoding-utils.js';

export function parseResponsePlan(rawOutput: string, prNumber: number): ResponsePlan {
  logger.debug(`Parsing agent response (${rawOutput.length} chars)`);

  const markdownResult = tryParseMarkdownCodeBlock(rawOutput, prNumber);
  if (markdownResult) {
    logger.debug('Strategy 1 (Markdown Code Block) successful');
    return markdownResult;
  }

  const jsonLinesResult = tryParseJsonLines(rawOutput, prNumber);
  if (jsonLinesResult) {
    logger.debug('Strategy 2 (JSON Lines) successful');
    return jsonLinesResult;
  }

  const plainJsonResult = tryParsePlainJson(rawOutput, prNumber);
  if (plainJsonResult) {
    logger.debug('Strategy 3 (Plain JSON) successful');
    return plainJsonResult;
  }

  logger.error('All parsing strategies failed.');
  logger.debug(`Raw output preview (first 500 chars): ${rawOutput.substring(0, 500)}`);
  throw new Error('Failed to parse agent response: Markdown, JSON Lines, and plain JSON strategies exhausted');
}

export function tryParseMarkdownCodeBlock(rawOutput: string, prNumber: number): ResponsePlan | null {
  logger.debug('Strategy 1: Attempting markdown code block extraction...');

  const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    logger.debug('Strategy 1 failed: No markdown code block found');
    return null;
  }

  try {
    const sanitized = sanitizeForJson(jsonMatch[1]);
    const parsed = JSON.parse(sanitized) as ResponsePlan;
    return normalizeResponsePlan(parsed, prNumber);
  } catch (error) {
    logger.debug(`Strategy 1 failed: JSON parse error - ${getErrorMessage(error)}`);
    return null;
  }
}

export function tryParseJsonLines(rawOutput: string, prNumber: number): ResponsePlan | null {
  logger.debug('Strategy 2: Attempting JSON Lines extraction...');

  const lines = rawOutput.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.length === 0) continue;

    try {
      const parsed = JSON.parse(line);
      if (isValidResponsePlanCandidate(parsed)) {
        logger.debug(`Strategy 2 successful: Found valid JSON at line ${i + 1}`);
        return normalizeResponsePlan(parsed, prNumber);
      }
    } catch {
      continue;
    }
  }

  const multiLine = parseFromBoundaryCandidates(rawOutput, prNumber, 'Strategy 2 (multi-line)');
  if (multiLine) {
    return multiLine;
  }

  logger.debug('Strategy 2 failed: No valid JSON with "comments" field found');
  return null;
}

export function tryParsePlainJson(rawOutput: string, prNumber: number): ResponsePlan | null {
  logger.debug('Strategy 3: Attempting plain JSON extraction...');
  const result = parseFromBoundaryCandidates(rawOutput, prNumber, 'Strategy 3');

  if (!result) {
    logger.debug('Strategy 3 failed: No valid ResponsePlan found in candidates');
  }

  return result;
}

export function parseFromBoundaryCandidates(
  rawOutput: string,
  prNumber: number,
  context: string,
): ResponsePlan | null {
  const candidates = findAllJsonObjectBoundaries(rawOutput);
  if (candidates.length === 0) {
    logger.debug(`${context}: No JSON object boundaries found`);
    return null;
  }

  logger.debug(`${context}: Found ${candidates.length} JSON object candidate(s)`);
  for (let i = candidates.length - 1; i >= 0; i--) {
    const { start, end } = candidates[i];
    const candidateStr = rawOutput.substring(start, end + 1);

    try {
      const parsed = JSON.parse(fixMojibake(candidateStr));
      if (isValidResponsePlanCandidate(parsed)) {
        logger.debug(`${context}: Valid JSON at position ${start}-${end}`);
        return normalizeResponsePlan(parsed, prNumber);
      }
    } catch (error) {
      logger.debug(`${context}: Candidate at ${start}-${end} parse failed - ${getErrorMessage(error)}`);
    }
  }

  return null;
}

export function findAllJsonObjectBoundaries(text: string): Array<{ start: number; end: number }> {
  const boundaries: Array<{ start: number; end: number }> = [];
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') {
      if (depth === 0) {
        startIndex = i;
      }
      depth++;
    } else if (char === '}') {
      if (depth > 0) {
        depth--;
      }
      if (depth === 0 && startIndex !== -1) {
        boundaries.push({ start: startIndex, end: i });
        startIndex = -1;
      }
    }
  }

  return boundaries;
}
