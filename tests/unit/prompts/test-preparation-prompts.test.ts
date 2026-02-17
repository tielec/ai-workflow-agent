/**
 * ユニットテスト: test_preparation プロンプト
 *
 * テスト対象:
 * - 日本語/英語の execute/review/revise プロンプトの存在
 * - 重要なテンプレート変数の埋め込み
 * - 言語指示の有無
 */

import { describe, test, expect } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';

const PROMPTS_ROOT = path.join(process.cwd(), 'src', 'prompts', 'test_preparation');

const promptFiles = {
  ja: {
    execute: path.join(PROMPTS_ROOT, 'ja', 'execute.txt'),
    review: path.join(PROMPTS_ROOT, 'ja', 'review.txt'),
    revise: path.join(PROMPTS_ROOT, 'ja', 'revise.txt'),
  },
  en: {
    execute: path.join(PROMPTS_ROOT, 'en', 'execute.txt'),
    review: path.join(PROMPTS_ROOT, 'en', 'review.txt'),
    revise: path.join(PROMPTS_ROOT, 'en', 'revise.txt'),
  },
} as const;

describe('test_preparation プロンプトファイルの存在確認', () => {
  test('日本語プロンプト（execute/review/revise）が存在し、空でない', () => {
    const files = Object.values(promptFiles.ja);
    for (const filePath of files) {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });

  test('英語プロンプト（execute/review/revise）が存在し、空でない', () => {
    const files = Object.values(promptFiles.en);
    for (const filePath of files) {
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('test_preparation 実行プロンプトのテンプレート変数', () => {
  test('日本語 execute プロンプトに必須テンプレート変数が含まれる', () => {
    const content = fs.readFileSync(promptFiles.ja.execute, 'utf-8');
    expect(content).toContain('{planning_document_path}');
    expect(content).toContain('{test_implementation_context}');
    expect(content).toContain('{implementation_context}');
    expect(content).toContain('{issue_number}');
  });
});

describe('test_preparation プロンプトの言語指示', () => {
  test('日本語プロンプトに日本語出力指示が含まれる', () => {
    const content = fs.readFileSync(promptFiles.ja.execute, 'utf-8');
    expect(content).toMatch(/日本語/);
  });

  test('英語プロンプトに英語出力指示が含まれる', () => {
    const content = fs.readFileSync(promptFiles.en.execute, 'utf-8');
    expect(content).toMatch(/English/i);
  });
});
