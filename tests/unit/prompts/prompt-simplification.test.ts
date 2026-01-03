import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

/**
 * Prompt Simplification Unit Tests (Issue #207)
 *
 * テスト対象: Phase 4-8のプロンプトファイルの簡潔化
 * テスト戦略: UNIT_INTEGRATION（ユニットテスト部分）
 *
 * このファイルでは、修正されたプロンプトファイルが正しく読み込まれ、
 * 簡潔化されたフォーマット指示が含まれることを検証する。
 */

const PROMPTS_DIR = path.join(process.cwd(), 'src', 'prompts');
const DIST_PROMPTS_DIR = path.join(process.cwd(), 'dist', 'prompts');

describe('Phase 4 (Implementation) Prompt Simplification', () => {
  let promptContent: string;

  beforeAll(() => {
    const promptPath = path.join(PROMPTS_DIR, 'implementation', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
    promptContent = fs.readFileSync(promptPath, 'utf-8');
  });

  // UT-1: Phase 4（Implementation）プロンプト読み込みテスト
  test('should load implementation prompt file', () => {
    expect(promptContent).toBeTruthy();
    expect(promptContent.length).toBeGreaterThan(0);
  });

  test('should contain simplified format instructions - 変更ファイル一覧', () => {
    expect(promptContent).toContain('変更ファイル一覧');
  });

  test('should contain simplified format instructions - 主要な変更点', () => {
    expect(promptContent).toContain('主要な変更点');
  });

  test('should NOT contain detailed implementation section', () => {
    // 実装詳細セクションが削除されていることを確認
    // Note: プロンプトには指示として「実装詳細」という言葉が残る可能性があるが、
    // 詳細な出力フォーマット指示（「### ファイル:」など）が削除されていることを確認
    const hasDetailedFileFormat = /###\s*ファイル:/i.test(promptContent);
    expect(hasDetailedFileFormat).toBe(false);
  });

  test('should contain table format instruction', () => {
    // テーブルフォーマットの指示が含まれていることを確認
    const hasTableFormat = /\|\s*ファイル\s*\|\s*変更種別\s*\|\s*概要\s*\|/i.test(promptContent);
    expect(hasTableFormat).toBe(true);
  });
});

describe('Phase 5 (Test Implementation) Prompt Simplification', () => {
  let promptContent: string;

  beforeAll(() => {
    const promptPath = path.join(PROMPTS_DIR, 'test_implementation', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
    promptContent = fs.readFileSync(promptPath, 'utf-8');
  });

  // UT-2: Phase 5（Test Implementation）プロンプト読み込みテスト
  test('should load test_implementation prompt file', () => {
    expect(promptContent).toBeTruthy();
    expect(promptContent.length).toBeGreaterThan(0);
  });

  test('should contain simplified format instructions - テストファイル一覧', () => {
    expect(promptContent).toContain('テストファイル一覧');
  });

  test('should contain simplified format instructions - テストカバレッジ', () => {
    expect(promptContent).toContain('テストカバレッジ');
  });

  test('should NOT contain detailed test case section', () => {
    // テストケース詳細セクションが削除されていることを確認
    const hasDetailedTestFormat = /###\s*ファイル:.*test_function/is.test(promptContent);
    expect(hasDetailedTestFormat).toBe(false);
  });

  test('should contain table format instruction for test files', () => {
    // テーブルフォーマットの指示が含まれていることを確認
    const hasTableFormat = /\|\s*ファイル\s*\|\s*テスト数\s*\|\s*カバー対象\s*\|/i.test(promptContent);
    expect(hasTableFormat).toBe(true);
  });
});

describe('Phase 6 (Testing) Prompt Simplification', () => {
  let promptContent: string;

  beforeAll(() => {
    const promptPath = path.join(PROMPTS_DIR, 'testing', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
    promptContent = fs.readFileSync(promptPath, 'utf-8');
  });

  // UT-3: Phase 6（Testing）プロンプト読み込みテスト
  test('should load testing prompt file', () => {
    expect(promptContent).toBeTruthy();
    expect(promptContent.length).toBeGreaterThan(0);
  });

  test('should contain test result summary instruction', () => {
    expect(promptContent).toContain('テスト結果サマリー');
  });

  test('should contain success/failure conditional branching instruction', () => {
    // 成功時/失敗時の条件分岐指示が含まれていることを確認
    const hasConditionalBranching =
      promptContent.includes('成功時') ||
      promptContent.includes('失敗時') ||
      promptContent.includes('全てのテストが成功');
    expect(hasConditionalBranching).toBe(true);
  });

  test('should contain instruction to NOT list successful tests in detail', () => {
    // 成功したテストの詳細リストを記載しない旨の指示が含まれていることを確認
    const hasNoSuccessDetailInstruction =
      /成功したテスト.*記載しない/is.test(promptContent) ||
      /成功したテスト.*省略/is.test(promptContent);
    expect(hasNoSuccessDetailInstruction).toBe(true);
  });
});

describe('Phase 7 (Documentation) Prompt Simplification', () => {
  let promptContent: string;

  beforeAll(() => {
    const promptPath = path.join(PROMPTS_DIR, 'documentation', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
    promptContent = fs.readFileSync(promptPath, 'utf-8');
  });

  // UT-4: Phase 7（Documentation）プロンプト読み込みテスト
  test('should load documentation prompt file', () => {
    expect(promptContent).toBeTruthy();
    expect(promptContent.length).toBeGreaterThan(0);
  });

  test('should contain simplified format instructions - 更新サマリー', () => {
    expect(promptContent).toContain('更新サマリー');
  });

  test('should contain instruction to omit unchanged documents', () => {
    // 更新不要と判断したファイルは省略する旨の指示が含まれていることを確認
    const hasOmitUnchangedInstruction =
      /更新不要.*省略/is.test(promptContent) ||
      /更新不要.*記載しない/is.test(promptContent);
    expect(hasOmitUnchangedInstruction).toBe(true);
  });

  test('should NOT contain detailed document investigation section', () => {
    // 調査したドキュメント一覧セクションが削除されていることを確認
    const hasDetailedInvestigation = /##\s*調査したドキュメント/i.test(promptContent);
    expect(hasDetailedInvestigation).toBe(false);
  });

  test('should contain table format instruction for updated documents', () => {
    // テーブルフォーマットの指示が含まれていることを確認
    const hasTableFormat = /\|\s*ファイル\s*\|\s*更新理由\s*\|/i.test(promptContent);
    expect(hasTableFormat).toBe(true);
  });
});

describe('Phase 8 (Report) Prompt Simplification', () => {
  let promptContent: string;

  beforeAll(() => {
    const promptPath = path.join(PROMPTS_DIR, 'report', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
    promptContent = fs.readFileSync(promptPath, 'utf-8');
  });

  // UT-5: Phase 8（Report）プロンプト読み込みテスト
  test('should load report prompt file', () => {
    expect(promptContent).toBeTruthy();
    expect(promptContent.length).toBeGreaterThan(0);
  });

  test('should contain executive summary section', () => {
    expect(promptContent).toContain('エグゼクティブサマリー');
  });

  test('should contain detailed reference section', () => {
    expect(promptContent).toContain('詳細参照');
  });

  test('should contain @references path format', () => {
    // @.ai-workflow/issue-{NUM}/ 形式の参照パスが含まれていることを確認
    const hasReferencePath = /@\.ai-workflow\/issue-/i.test(promptContent);
    expect(hasReferencePath).toBe(true);
  });

  test('should contain instruction to NOT duplicate phase details', () => {
    // 各フェーズの詳細をここに再掲載しない旨の指示が含まれていることを確認
    const hasNoDuplicationInstruction =
      /再掲載.*しない/is.test(promptContent) ||
      /詳細.*再掲載/is.test(promptContent);
    expect(hasNoDuplicationInstruction).toBe(true);
  });

  test('should NOT contain detailed phase summary sections in output format', () => {
    // 要件定義サマリー、設計サマリーなどの詳細再掲載セクションの指示が削除されていることを確認
    // Note: プロンプト内で「サマリー」という言葉自体は残る可能性があるため、
    // より具体的なパターンで検証
    const hasDetailedPhaseSummary = /##\s*(要件定義|設計|実装)サマリー/i.test(promptContent);
    expect(hasDetailedPhaseSummary).toBe(false);
  });
});

describe('Phase 0-2 Prompts Should Not Be Changed', () => {
  // UT-11: Phase 0-2のプロンプトファイルが変更されていないことの確認

  test('Phase 0 (Planning) prompt should exist', () => {
    const promptPath = path.join(PROMPTS_DIR, 'planning', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
  });

  test('Phase 1 (Requirements) prompt should exist', () => {
    const promptPath = path.join(PROMPTS_DIR, 'requirements', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
  });

  test('Phase 2 (Design) prompt should exist', () => {
    const promptPath = path.join(PROMPTS_DIR, 'design', 'ja', 'execute.txt');
    expect(fs.existsSync(promptPath)).toBe(true);
  });

  // Note: 実際の「変更されていない」確認は、Git履歴やdiffで行う必要があるため、
  // ここでは存在確認のみ実施。詳細な変更確認はCIパイプラインやマニュアルレビューで実施。
});

describe('Build Process - Prompt Files Copy', () => {
  // UT-6 to UT-10: ビルド後のプロンプトファイル存在確認テスト
  // Note: このテストはビルド後に実行されることを前提とする

  test('Phase 4 prompt should be copied to dist after build', () => {
    const distPromptPath = path.join(DIST_PROMPTS_DIR, 'implementation', 'ja', 'execute.txt');

    // ビルドされていない場合はスキップ
    if (!fs.existsSync(DIST_PROMPTS_DIR)) {
      console.warn('dist/prompts/ directory does not exist. Skipping build test.');
      return;
    }

    expect(fs.existsSync(distPromptPath)).toBe(true);

    if (fs.existsSync(distPromptPath)) {
      const srcContent = fs.readFileSync(
        path.join(PROMPTS_DIR, 'implementation', 'ja', 'execute.txt'),
        'utf-8'
      );
      const distContent = fs.readFileSync(distPromptPath, 'utf-8');
      expect(distContent).toBe(srcContent);
    }
  });

  test('Phase 5 prompt should be copied to dist after build', () => {
    const distPromptPath = path.join(DIST_PROMPTS_DIR, 'test_implementation', 'ja', 'execute.txt');

    if (!fs.existsSync(DIST_PROMPTS_DIR)) {
      console.warn('dist/prompts/ directory does not exist. Skipping build test.');
      return;
    }

    expect(fs.existsSync(distPromptPath)).toBe(true);

    if (fs.existsSync(distPromptPath)) {
      const srcContent = fs.readFileSync(
        path.join(PROMPTS_DIR, 'test_implementation', 'ja', 'execute.txt'),
        'utf-8'
      );
      const distContent = fs.readFileSync(distPromptPath, 'utf-8');
      expect(distContent).toBe(srcContent);
    }
  });

  test('Phase 6 prompt should be copied to dist after build', () => {
    const distPromptPath = path.join(DIST_PROMPTS_DIR, 'testing', 'ja', 'execute.txt');

    if (!fs.existsSync(DIST_PROMPTS_DIR)) {
      console.warn('dist/prompts/ directory does not exist. Skipping build test.');
      return;
    }

    expect(fs.existsSync(distPromptPath)).toBe(true);

    if (fs.existsSync(distPromptPath)) {
      const srcContent = fs.readFileSync(
        path.join(PROMPTS_DIR, 'testing', 'ja', 'execute.txt'),
        'utf-8'
      );
      const distContent = fs.readFileSync(distPromptPath, 'utf-8');
      expect(distContent).toBe(srcContent);
    }
  });

  test('Phase 7 prompt should be copied to dist after build', () => {
    const distPromptPath = path.join(DIST_PROMPTS_DIR, 'documentation', 'ja', 'execute.txt');

    if (!fs.existsSync(DIST_PROMPTS_DIR)) {
      console.warn('dist/prompts/ directory does not exist. Skipping build test.');
      return;
    }

    expect(fs.existsSync(distPromptPath)).toBe(true);

    if (fs.existsSync(distPromptPath)) {
      const srcContent = fs.readFileSync(
        path.join(PROMPTS_DIR, 'documentation', 'ja', 'execute.txt'),
        'utf-8'
      );
      const distContent = fs.readFileSync(distPromptPath, 'utf-8');
      expect(distContent).toBe(srcContent);
    }
  });

  test('Phase 8 prompt should be copied to dist after build', () => {
    const distPromptPath = path.join(DIST_PROMPTS_DIR, 'report', 'ja', 'execute.txt');

    if (!fs.existsSync(DIST_PROMPTS_DIR)) {
      console.warn('dist/prompts/ directory does not exist. Skipping build test.');
      return;
    }

    expect(fs.existsSync(distPromptPath)).toBe(true);

    if (fs.existsSync(distPromptPath)) {
      const srcContent = fs.readFileSync(
        path.join(PROMPTS_DIR, 'report', 'ja', 'execute.txt'),
        'utf-8'
      );
      const distContent = fs.readFileSync(distPromptPath, 'utf-8');
      expect(distContent).toBe(srcContent);
    }
  });
});
