/**
 * ユニットテスト: init コマンドモジュール
 *
 * テスト対象:
 * - validateBranchName(): ブランチ名バリデーション
 * - resolveBranchName(): ブランチ名解決（デフォルト vs カスタム）
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect } from '@jest/globals';
import { validateBranchName, resolveBranchName } from '../../../src/commands/init.js';

// =============================================================================
// validateBranchName() のテスト
// =============================================================================

describe('validateBranchName', () => {
  describe('正常系: 有効なブランチ名', () => {
    test('標準的なfeatureブランチ名を受け入れる', () => {
      // Given: 標準的なブランチ名
      const branchName = 'feature/issue-22';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが成功する
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('デフォルトブランチ名（ai-workflow/issue-X）を受け入れる', () => {
      // Given: デフォルトブランチ名
      const branchName = 'ai-workflow/issue-123';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが成功する
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('bugfixブランチ名を受け入れる', () => {
      // Given: bugfixブランチ名
      const branchName = 'bugfix/fix-parser';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが成功する
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('hotfixブランチ名を受け入れる', () => {
      // Given: hotfixブランチ名
      const branchName = 'hotfix/critical-bug';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが成功する
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('複雑なブランチ名（複数のハイフン）を受け入れる', () => {
      // Given: 複雑なブランチ名
      const branchName = 'feature/add-aws-credentials-support';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが成功する
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('異常系: 不正なブランチ名', () => {
    test('スペースを含むブランチ名を拒否する', () => {
      // Given: スペースを含むブランチ名
      const branchName = 'invalid branch';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが失敗する
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('invalid characters');
    });

    test('ドットで始まるブランチ名を拒否する', () => {
      // Given: ドットで始まるブランチ名
      const branchName = '.invalid';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが失敗する
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('cannot start');
    });

    test('特殊文字（^）を含むブランチ名を拒否する', () => {
      // Given: 特殊文字を含むブランチ名
      const branchName = 'feature^123';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが失敗する
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('invalid characters');
    });

    test('スラッシュで終わるブランチ名を拒否する', () => {
      // Given: スラッシュで終わるブランチ名
      const branchName = 'feature/';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが失敗する
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('cannot start or end with');
    });

    test('空文字列を拒否する', () => {
      // Given: 空文字列
      const branchName = '';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが失敗する
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    test('連続ドットを含むブランチ名を拒否する', () => {
      // Given: 連続ドットを含むブランチ名
      const branchName = 'feature/..test';

      // When: バリデーションを実行
      const result = validateBranchName(branchName);

      // Then: バリデーションが失敗する
      expect(result.valid).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain('cannot contain');
    });
  });
});

// =============================================================================
// resolveBranchName() のテスト
// =============================================================================

describe('resolveBranchName', () => {
  describe('正常系: ブランチ名解決', () => {
    test('カスタムブランチ名が指定された場合、そのブランチ名を返す', () => {
      // Given: カスタムブランチ名とIssue番号
      const customBranch = 'feature/custom-work';
      const issueNumber = 22;

      // When: ブランチ名を解決
      const result = resolveBranchName(customBranch, issueNumber);

      // Then: カスタムブランチ名が返される
      expect(result).toBe('feature/custom-work');
    });

    test('カスタムブランチ名が未指定の場合、デフォルトブランチ名を返す', () => {
      // Given: カスタムブランチ名なし、Issue番号
      const customBranch = undefined;
      const issueNumber = 22;

      // When: ブランチ名を解決
      const result = resolveBranchName(customBranch, issueNumber);

      // Then: デフォルトブランチ名が返される
      expect(result).toBe('ai-workflow/issue-22');
    });

    test('Issue番号が大きい場合でもデフォルトブランチ名を正しく生成する', () => {
      // Given: カスタムブランチ名なし、大きなIssue番号
      const customBranch = undefined;
      const issueNumber = 99999;

      // When: ブランチ名を解決
      const result = resolveBranchName(customBranch, issueNumber);

      // Then: デフォルトブランチ名が返される
      expect(result).toBe('ai-workflow/issue-99999');
    });
  });

  describe('異常系: 不正なカスタムブランチ名', () => {
    test('不正なカスタムブランチ名でエラーをスローする', () => {
      // Given: 不正なカスタムブランチ名（スペース含む）
      const customBranch = 'invalid branch';
      const issueNumber = 22;

      // When & Then: エラーがスローされる
      expect(() => {
        resolveBranchName(customBranch, issueNumber);
      }).toThrow();
    });

    test('特殊文字を含むカスタムブランチ名でエラーをスローする', () => {
      // Given: 特殊文字を含むカスタムブランチ名
      const customBranch = 'feature^123';
      const issueNumber = 22;

      // When & Then: エラーがスローされる
      expect(() => {
        resolveBranchName(customBranch, issueNumber);
      }).toThrow();
    });
  });
});
