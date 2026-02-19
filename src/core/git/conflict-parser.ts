import { ConflictError } from '../../utils/error-utils.js';
import type { ConflictBlock } from '../../types/conflict.js';

const CONFLICT_START = '<<<<<<<';
const CONFLICT_BASE = '|||||||';
const CONFLICT_MID = '=======';
const CONFLICT_END = '>>>>>>>';

function isBinaryContent(content: string): boolean {
  if (!content) {
    return false;
  }

  if (content.includes('\u0000')) {
    return true;
  }

  const sample = content.slice(0, 8000);
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) {
      continue;
    }
    if (code < 32) {
      nonPrintable += 1;
    }
  }

  return nonPrintable > 0 && nonPrintable / sample.length > 0.1;
}

export function hasConflictMarkers(fileContent: string): boolean {
  const startIndex = fileContent.indexOf(CONFLICT_START);
  if (startIndex === -1) {
    return false;
  }
  const midIndex = fileContent.indexOf(CONFLICT_MID, startIndex);
  if (midIndex === -1) {
    return false;
  }
  const endIndex = fileContent.indexOf(CONFLICT_END, midIndex);
  return endIndex !== -1;
}

export function parseConflictMarkers(fileContent: string, filePath: string): ConflictBlock[] {
  const lines = fileContent.split(/\r?\n/);
  const hasStartLine = lines.some((line) => line.startsWith(CONFLICT_START));
  if (!fileContent || !hasStartLine) {
    return [];
  }

  if (isBinaryContent(fileContent)) {
    throw new ConflictError(`Binary file detected: ${filePath}`, [filePath]);
  }

  const hasMidLine = lines.some((line) => line.startsWith(CONFLICT_MID));
  const hasEndLine = lines.some((line) => line.startsWith(CONFLICT_END));
  if (!hasMidLine || !hasEndLine) {
    throw new ConflictError(`Incomplete conflict markers in ${filePath}`, [filePath]);
  }

  const blocks: ConflictBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith(CONFLICT_START)) {
      i += 1;
      continue;
    }

    const startLine = i + 1;
    i += 1;

    const ours: string[] = [];
    const base: string[] = [];
    const theirs: string[] = [];
    let foundBase = false;
    let foundMid = false;
    let foundEnd = false;

    for (; i < lines.length; i += 1) {
      const current = lines[i];
      if (current.startsWith(CONFLICT_BASE)) {
        foundBase = true;
        i += 1;
        break;
      }
      if (current.startsWith(CONFLICT_MID)) {
        foundMid = true;
        i += 1;
        break;
      }
      ours.push(current);
    }

    if (!foundMid) {
      for (; i < lines.length; i += 1) {
        const current = lines[i];
        if (current.startsWith(CONFLICT_MID)) {
          foundMid = true;
          i += 1;
          break;
        }
        base.push(current);
      }
    }

    if (!foundMid) {
      throw new ConflictError(`Incomplete conflict markers in ${filePath}`, [filePath]);
    }

    for (; i < lines.length; i += 1) {
      const current = lines[i];
      if (current.startsWith(CONFLICT_END)) {
        foundEnd = true;
        i += 1;
        break;
      }
      theirs.push(current);
    }

    if (!foundEnd) {
      throw new ConflictError(`Incomplete conflict markers in ${filePath}`, [filePath]);
    }

    const endLine = i;

    blocks.push({
      filePath,
      startLine,
      endLine,
      oursContent: ours.join('\n'),
      theirsContent: theirs.join('\n'),
      baseContent: foundBase ? base.join('\n') : undefined,
    });
  }

  return blocks;
}

export const __testables = {
  isBinaryContent,
};
