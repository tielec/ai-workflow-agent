import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { BugCandidate, RefactorCandidate, EnhancementProposal } from './types.js';

export function readBugOutputFile(filePath: string): BugCandidate[] {
  if (!fs.existsSync(filePath)) {
    logger.warn(`Output file not found: ${filePath}. Agent may have failed to write the file.`);
    return [];
  }

  let rawContent: string;

  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
    logger.debug(`Output file content (first 500 chars): ${rawContent.substring(0, 500)}`);
  } catch (readError) {
    logger.error(`Failed to read output file: ${getErrorMessage(readError)}`);
    return [];
  }

  try {
    const parsed = JSON.parse(rawContent);

    if (parsed.bugs && Array.isArray(parsed.bugs)) {
      logger.info(`Read ${parsed.bugs.length} bug candidates from output file.`);
      return parsed.bugs as BugCandidate[];
    }

    if (Array.isArray(parsed)) {
      logger.info(`Read ${parsed.length} bug candidates from output file.`);
      return parsed as BugCandidate[];
    }

    if (parsed.title && parsed.file) {
      logger.info('Read 1 bug candidate from output file.');
      return [parsed as BugCandidate];
    }

    logger.warn('Output file does not contain valid bug candidates structure.');
    return [];
  } catch (error) {
    logger.error(`Failed to parse output file: ${getErrorMessage(error)}`);
    logger.error(`File content for debugging:\n${rawContent}`);
    return [];
  }
}

export function readRefactorOutputFile(filePath: string): RefactorCandidate[] {
  if (!fs.existsSync(filePath)) {
    logger.warn(`Output file not found: ${filePath}. Agent may have failed to write the file.`);
    return [];
  }

  let rawContent: string;

  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
    logger.debug(`Output file content (first 500 chars): ${rawContent.substring(0, 500)}`);
  } catch (readError) {
    logger.error(`Failed to read refactoring output file: ${getErrorMessage(readError)}`);
    return [];
  }

  try {
    const parsed = JSON.parse(rawContent);

    if (Array.isArray(parsed)) {
      logger.info(`Read ${parsed.length} refactoring candidates from output file.`);
      return parsed as RefactorCandidate[];
    }

    if (parsed.candidates && Array.isArray(parsed.candidates)) {
      logger.info(`Read ${parsed.candidates.length} refactoring candidates from output file.`);
      return parsed.candidates as RefactorCandidate[];
    }

    if (parsed.type && parsed.filePath) {
      logger.info('Read 1 refactoring candidate from output file.');
      return [parsed as RefactorCandidate];
    }

    logger.warn('Output file does not contain valid refactoring candidates structure.');
    return [];
  } catch (error) {
    logger.error(`Failed to read/parse refactoring output file: ${getErrorMessage(error)}`);
    logger.error(`File content for debugging:\n${rawContent}`);
    return [];
  }
}

export function readEnhancementOutputFile(filePath: string): EnhancementProposal[] {
  if (!fs.existsSync(filePath)) {
    logger.warn(`Output file not found: ${filePath}. Agent may have failed to write the file.`);
    return [];
  }

  let rawContent: string;

  try {
    rawContent = fs.readFileSync(filePath, 'utf-8');
    logger.debug(`Output file content (first 500 chars): ${rawContent.substring(0, 500)}`);
  } catch (readError) {
    logger.error(`Failed to read enhancement output file: ${getErrorMessage(readError)}`);
    return [];
  }

  try {
    const proposals = parseEnhancementProposals(rawContent);
    if (proposals.length > 0) {
      logger.info(`Read ${proposals.length} enhancement proposals from output file.`);
      return proposals;
    }

    logger.warn('Output file does not contain valid enhancement proposals structure.');
    return [];
  } catch (error) {
    logger.error(`Failed to parse enhancement output file: ${getErrorMessage(error)}`);
    logger.error(`File content for debugging:\n${rawContent}`);
    return [];
  }
}

export function parseEnhancementProposals(rawContent: string): EnhancementProposal[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  const trimmed = rawContent.trim();
  const directParse = tryParseEnhancementJson(trimmed);
  if (directParse && directParse.length > 0) {
    return directParse;
  }

  const candidates: string[] = [];

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch?.[1]) {
    candidates.push(codeBlockMatch[1].trim());
  }

  const arraySegment = extractJsonSegment(trimmed, '[', ']');
  if (arraySegment && arraySegment.includes('{')) {
    candidates.push(arraySegment);
  }

  const objectSegment = extractJsonSegment(trimmed, '{', '}');
  if (objectSegment) {
    candidates.push(objectSegment);
  }

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  for (const candidate of uniqueCandidates) {
    if (!candidate) {
      continue;
    }
    const parsed = tryParseEnhancementJson(candidate);
    if (parsed && parsed.length > 0) {
      return parsed;
    }
  }

  logger.debug('Failed to parse enhancement proposals with lenient parser.');
  return [];
}

export function tryParseEnhancementJson(payload: string): EnhancementProposal[] | null {
  try {
    const parsed = JSON.parse(payload);
    if (Array.isArray(parsed)) {
      return parsed as EnhancementProposal[];
    }
    if (parsed && typeof parsed === 'object') {
      return [parsed as EnhancementProposal];
    }
    return null;
  } catch (error) {
    logger.debug(`Failed to parse enhancement JSON payload: ${getErrorMessage(error)}`);
    return null;
  }
}

export function extractJsonSegment(
  source: string,
  startChar: '[' | '{',
  endChar: ']' | '}',
): string | null {
  const startIndex = source.indexOf(startChar);
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
    }

    if (!inString) {
      if (char === startChar) {
        depth += 1;
      } else if (char === endChar) {
        depth -= 1;
        if (depth === 0) {
          return source.slice(startIndex, i + 1);
        }
      }
    }
  }

  return null;
}
