import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { jest } from '@jest/globals';

import { logger } from '../../../../src/core/utils/logger.js';
jest.mock('../../../../src/core/utils/error-utils', () => ({
  getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

import {
  extractJsonSegment,
  parseEnhancementProposals,
  readBugOutputFile,
  readEnhancementOutputFile,
  readRefactorOutputFile,
  tryParseEnhancementJson,
} from '../../../../src/core/analyzer/output-parser.js';
import type {
  BugCandidate,
  EnhancementProposal,
  RefactorCandidate,
} from '../../../../src/core/analyzer/types.js';

let debugSpy: jest.SpyInstance;
let infoSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;

beforeEach(() => {
  debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
  infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
  errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
});

afterEach(() => {
  debugSpy.mockRestore();
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe('output-parser: bug candidates', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bug-parser-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses array, wrapper, and single-object formats', () => {
    // TC-OP-001/TC-OP-004/TC-OP-008: 配列・ラッパー・単体形式の正常系パースを網羅
    const arrayPath = path.join(tempDir, 'bugs-array.json');
    const wrapperPath = path.join(tempDir, 'bugs-wrapper.json');
    const singlePath = path.join(tempDir, 'bugs-single.json');

    const base: BugCandidate = {
      title: 'Unhandled promise rejection in API service',
      file: 'src/services/api-service.ts',
      line: 42,
      severity: 'high',
      description:
        'The fetchData method does not properly handle promise rejections, which could lead to unhandled exceptions and application crashes in production.',
      suggestedFix:
        'Wrap the fetch call in a try-catch block and implement proper error handling with user-friendly error messages.',
      category: 'bug',
    };

    fs.writeFileSync(arrayPath, JSON.stringify([base, { ...base, title: 'Another bug' }]));
    fs.writeFileSync(wrapperPath, JSON.stringify({ bugs: [base] }));
    fs.writeFileSync(singlePath, JSON.stringify(base));

    expect(readBugOutputFile(arrayPath)).toHaveLength(2);
    expect(readBugOutputFile(wrapperPath)).toHaveLength(1);
    expect(readBugOutputFile(singlePath)).toHaveLength(1);
  });

  it('returns empty array for missing, malformed, or invalid structures', () => {
    // TC-OP-002/TC-OP-003: 無効JSONやファイル不存在時に空配列と警告を返すことを確認
    const invalidPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidPath, 'not-json');

    const wrongStructurePath = path.join(tempDir, 'wrong.json');
    fs.writeFileSync(wrongStructurePath, JSON.stringify({ data: [] }));

    expect(readBugOutputFile(path.join(tempDir, 'missing.json'))).toEqual([]);
    expect(readBugOutputFile(invalidPath)).toEqual([]);
    expect(readBugOutputFile(wrongStructurePath)).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('parses Japanese bug JSON and logs info for successful read', () => {
    // TC-OP-001: 日本語を含むバグ出力の正常系と情報ログ出力を確認
    const japanesePath = path.join(tempDir, 'bugs-ja.json');
    const japaneseBug: BugCandidate = {
      title: '未処理の例外が発生するバグ',
      file: 'src/services/api-service.ts',
      line: 42,
      severity: 'high',
      description:
        'fetchDataメソッドがPromiseの拒否を適切に処理していないため、ネットワーク障害時にクラッシュする可能性があります。',
      suggestedFix: 'fetch呼び出しをtry-catchでラップし、構造化エラーを返してください。',
      category: 'bug',
    };

    fs.writeFileSync(japanesePath, JSON.stringify([japaneseBug]));

    const result = readBugOutputFile(japanesePath);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('未処理の例外が発生するバグ');
    expect(result[0].description).toContain('fetchDataメソッド');
    expect(infoSpy).toHaveBeenCalled();
  });
});

describe('output-parser: refactor candidates', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-parser-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses array, wrapper, and single-object formats', () => {
    // TC-OP-004/TC-OP-005/TC-OP-008: リファクタリング出力の複数フォーマット正常系を検証
    const arrayPath = path.join(tempDir, 'refactor-array.json');
    const wrapperPath = path.join(tempDir, 'refactor-wrapper.json');
    const singlePath = path.join(tempDir, 'refactor-single.json');

    const base: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/core/repository-analyzer.ts',
      description: 'File exceeds 1000 lines and mixes multiple responsibilities',
      suggestion: 'Extract path exclusion, output parsing, and validation into separate modules',
      priority: 'high',
      lineRange: { start: 1, end: 1200 },
    };

    fs.writeFileSync(arrayPath, JSON.stringify([base, { ...base, type: 'duplication' }]));
    fs.writeFileSync(wrapperPath, JSON.stringify({ candidates: [base] }));
    fs.writeFileSync(singlePath, JSON.stringify(base));

    expect(readRefactorOutputFile(arrayPath)).toHaveLength(2);
    expect(readRefactorOutputFile(wrapperPath)).toHaveLength(1);
    expect(readRefactorOutputFile(singlePath)).toHaveLength(1);
  });

  it('returns empty array for missing or malformed refactor output', () => {
    // TC-OP-006: 無効JSONやファイル不存在時に安全に空配列を返す
    const invalidPath = path.join(tempDir, 'invalid.json');
    fs.writeFileSync(invalidPath, 'oops');

    expect(readRefactorOutputFile(path.join(tempDir, 'missing.json'))).toEqual([]);
    expect(readRefactorOutputFile(invalidPath)).toEqual([]);
  });

  it('logs full file content for parse failures with unescaped newlines', () => {
    // TC-OP-006: 改行エスケープ不備時に内容全体をエラーログへ出力することを確認
    const invalidPath = path.join(tempDir, 'invalid-refactor.json');
    const invalidContent = `[
{"description": "大きなファイルです。
リファクタリングが必要です。"}
]`;
    fs.writeFileSync(invalidPath, invalidContent);

    const result = readRefactorOutputFile(invalidPath);

    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read/parse refactoring output file'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File content for debugging'),
    );
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('大きなファイルです'));
  });

  it('parses Japanese wrapper format correctly', () => {
    // TC-OP-005: ラッパー形式の日本語出力を正常パースする
    const wrapperPath = path.join(tempDir, 'refactor-wrapper-ja.json');
    const japaneseCandidate: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/core/repository-analyzer.ts',
      description: 'このファイルは1000行を超えており、複数の責務が混在しています。',
      suggestion: 'パス除外やバリデーション処理を別モジュールに分割してください。',
      priority: 'high',
      lineRange: { start: 1, end: 1200 },
    };
    fs.writeFileSync(wrapperPath, JSON.stringify({ candidates: [japaneseCandidate] }));

    const result = readRefactorOutputFile(wrapperPath);

    expect(result).toHaveLength(1);
    expect(result[0].description).toContain('1000行を超えており');
    expect(result[0].suggestion).toContain('分割してください');
  });

  it('handles unescaped backslashes as parse failures', () => {
    // TC-OP-007: バックスラッシュ未エスケープの無効JSONをエラー扱いする
    const invalidPath = path.join(tempDir, 'refactor-backslash.json');
    const invalidContent = '[{"filePath": "C:\\Users\\test\\file.ts"}]';
    fs.writeFileSync(invalidPath, invalidContent);

    expect(readRefactorOutputFile(invalidPath)).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('warns and returns empty array when file is missing', () => {
    const missingPath = path.join(tempDir, 'not-found.json');

    expect(readRefactorOutputFile(missingPath)).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Output file not found'),
    );
  });
});

describe('output-parser: enhancement proposals', () => {
  let tempDir: string;
  const baseProposal: EnhancementProposal = {
    type: 'improvement',
    title: 'Add progress indicator for long-running analysis operations',
    description:
      'The repository analysis process can take several minutes for large codebases. Adding a progress indicator would improve user experience by providing feedback during the analysis.',
    rationale:
      'Users currently have no visibility into analysis progress, leading to uncertainty about whether the process is working correctly.',
    implementation_hints: [
      'Use ora library for spinner implementation',
      'Add progress callbacks to analyzer methods',
      'Display file count and percentage completion',
    ],
    expected_impact: 'medium',
    effort_estimate: 'small',
    related_files: ['src/core/repository-analyzer.ts', 'src/commands/auto-issue.ts'],
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enhancement-parser-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('parses array format, code blocks, and embedded objects', () => {
    // TC-OP-009/TC-OP-010: 配列・コードブロック・埋め込みオブジェクト形式を網羅的にパース
    const arrayPath = path.join(tempDir, 'enhancement-array.json');
    const codeBlockPath = path.join(tempDir, 'enhancement-codeblock.md');
    const objectPath = path.join(tempDir, 'enhancement-object.md');

    fs.writeFileSync(arrayPath, JSON.stringify([baseProposal]));
    fs.writeFileSync(
      codeBlockPath,
      `Some text\n\`\`\`json\n${JSON.stringify([baseProposal])}\n\`\`\`\n`,
    );
    fs.writeFileSync(
      objectPath,
      `Intro text { "type": "improvement", "title": "${baseProposal.title}", "description": "${baseProposal.description}", "rationale": "${baseProposal.rationale}", "implementation_hints": ["hint"], "expected_impact": "medium", "effort_estimate": "small", "related_files": ["file.ts"] } end text`,
    );

    expect(readEnhancementOutputFile(arrayPath)).toHaveLength(1);
    expect(readEnhancementOutputFile(codeBlockPath)).toHaveLength(1);
    expect(readEnhancementOutputFile(objectPath)).toHaveLength(1);
  });

  it('returns empty array when file is missing or content is invalid', () => {
    // TC-OP-011: JSON構造を持たない場合に空配列を返す異常系
    const invalidPath = path.join(tempDir, 'invalid.md');
    fs.writeFileSync(invalidPath, 'plain text without JSON');

    expect(readEnhancementOutputFile(path.join(tempDir, 'missing.md'))).toEqual([]);
    expect(readEnhancementOutputFile(invalidPath)).toEqual([]);
  });

  it('extracts JSON segments and parses leniently', () => {
    // 補助: JSON抽出・緩和パースロジックの境界ケースを確認
    const textWithArray = 'prefix [ {"a":1}, {"b":2} ] suffix';
    const textWithObject = 'prefix { "hello": "world", "nested": { "x": 1 } } suffix';

    expect(extractJsonSegment(textWithArray, '[', ']')).toBe('[ {"a":1}, {"b":2} ]');
    expect(extractJsonSegment(textWithObject, '{', '}')).toContain('"nested"');
    expect(extractJsonSegment('no json here', '{', '}')).toBeNull();

    expect(tryParseEnhancementJson(JSON.stringify(baseProposal))).toEqual([baseProposal]);
    expect(parseEnhancementProposals(textWithArray)).toHaveLength(2);
  });

  it('parses Japanese enhancement proposals and keeps Unicode text', () => {
    // TC-OP-009: 日本語を含むEnhancement提案の正常系パースを確認
    const japanesePath = path.join(tempDir, 'enhancement-ja.json');
    const japaneseProposal: EnhancementProposal = {
      type: 'improvement',
      title: 'リポジトリスキャンの進捗表示機能を追加',
      description:
        '大規模なコードベースでは解析に時間がかかります。進捗インジケータで安心感を提供します。',
      rationale: 'ユーザーが処理状況を把握できるようにするため。',
      implementation_hints: ['oraライブラリを利用', '処理済みファイル数を表示'],
      expected_impact: 'medium',
      effort_estimate: 'small',
      related_files: ['src/core/repository-analyzer.ts'],
    };
    fs.writeFileSync(japanesePath, JSON.stringify([japaneseProposal]));

    const result = readEnhancementOutputFile(japanesePath);

    expect(result).toHaveLength(1);
    expect(result[0].title).toContain('進捗表示機能');
    expect(result[0].description).toContain('進捗インジケータ');
  });

  it('warns when enhancement output contains plain text without JSON', () => {
    // TC-OP-011: JSONを含まないテキスト入力で警告を出す
    const plainPath = path.join(tempDir, 'plain-text.md');
    fs.writeFileSync(plainPath, 'これは有効なJSONではありません。日本語のプレーンテキストです。');

    expect(readEnhancementOutputFile(plainPath)).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Output file does not contain valid enhancement proposals structure'),
    );
  });
});
