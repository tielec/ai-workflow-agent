import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Tests to ensure auto-issue prompts share the same file writing instructions.
 * This covers Issue #485 Scenario 5: prompt pattern consistency verification.
 */

const AUTO_ISSUE_PROMPTS_DIR = path.join(process.cwd(), 'src', 'prompts', 'auto-issue');
const PROMPT_FILES = [
  'detect-bugs.txt',
  'detect-refactoring.txt',
  'detect-enhancements.txt',
];
const REQUIRED_PATTERNS = [
  '必ずJSONファイルに書き出してください',
  '出力先.*\\{output_file_path\\}',
  'ファイル出力必須',
  '重要.*標準出力への出力ではなく',
];

describe('Auto-issue prompt file writing instructions', () => {
  PROMPT_FILES.forEach((fileName) => {
    test(`includes the required file writing instructions in ${fileName}`, () => {
      const filePath = path.join(AUTO_ISSUE_PROMPTS_DIR, fileName);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      REQUIRED_PATTERNS.forEach((pattern) => {
        expect(content).toMatch(new RegExp(pattern));
      });
    });
  });
});
