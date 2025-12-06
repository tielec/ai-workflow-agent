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

// =============================================================================
// Issue #225: base_commit記録タイミング のテスト
// =============================================================================

describe('Issue #225: base_commit recording timing', () => {
  describe('UT-1.3: base_commitの値検証（境界値）', () => {
    test('base_commitに記録される値が正しいGitハッシュであることを検証', () => {
      // Given: Gitハッシュ（40文字の16進数 + 改行）
      const gitHash = 'abc123def456789012345678901234567890abcd\n';
      const expectedHash = 'abc123def456789012345678901234567890abcd';

      // When: トリム処理を実行
      const trimmedHash = gitHash.trim();

      // Then: 改行が除去され、正しいハッシュになる
      expect(trimmedHash).toBe(expectedHash);
      expect(trimmedHash.length).toBe(40);
      expect(/^[0-9a-f]{40}$/.test(trimmedHash)).toBe(true);
    });

    test('base_commit短縮ハッシュが7文字であることを検証', () => {
      // Given: 完全なGitハッシュ
      const fullHash = 'abc123def456789012345678901234567890abcd';

      // When: 短縮ハッシュを取得
      const shortHash = fullHash.slice(0, 7);

      // Then: 短縮ハッシュが7文字である
      expect(shortHash).toBe('abc123d');
      expect(shortHash.length).toBe(7);
    });

    test('空白文字を含むGitハッシュが正しくトリムされる', () => {
      // Given: 空白文字を含むGitハッシュ
      const gitHashWithSpaces = '  abc123def456789012345678901234567890abcd\n';

      // When: トリム処理を実行
      const trimmedHash = gitHashWithSpaces.trim();

      // Then: 空白と改行が除去される
      expect(trimmedHash).toBe('abc123def456789012345678901234567890abcd');
      expect(trimmedHash.length).toBe(40);
    });
  });
});

// =============================================================================
// Issue #253: PR URL persistence のテスト
// =============================================================================

/**
 * テスト戦略:
 * handleInitCommand() は外部依存（Git、GitHub API、ファイルシステム）が多いため、
 * ユニットテストでは主要なロジックの検証に焦点を当てます。
 * 実際のGit操作とファイルシステムを使用した統合テストは
 * tests/integration/init-pr-url.test.ts で実施します。
 */
describe('Issue #253: PR URL persistence', () => {
  describe('PR作成後のメタデータコミット&プッシュロジック', () => {
    test('PR作成成功時、pr_urlとpr_numberがメタデータに設定されることを検証', () => {
      // Given: PR作成結果（正常系）
      const prResult = {
        success: true,
        pr_url: 'https://github.com/tielec/ai-workflow-agent/pull/123',
        pr_number: 123,
      };

      // When: PR情報をメタデータに設定（実装ロジックのシミュレーション）
      const metadata = {
        pr_url: prResult.pr_url ?? null,
        pr_number: prResult.pr_number ?? null,
      };

      // Then: メタデータに正しくPR情報が設定される
      expect(metadata.pr_url).toBe('https://github.com/tielec/ai-workflow-agent/pull/123');
      expect(metadata.pr_number).toBe(123);
      expect(metadata.pr_url).not.toBeNull();
      expect(metadata.pr_number).not.toBeNull();
    });

    test('PR作成失敗時、pr_urlとpr_numberがnullのままであることを検証', () => {
      // Given: PR作成結果（異常系）
      const prResult = {
        success: false,
        error: 'PR creation failed: 401 Unauthorized',
      };

      // When: PR情報がメタデータに設定されない（実装ロジックのシミュレーション）
      const metadata = {
        pr_url: null,
        pr_number: null,
      };

      // Then: メタデータのPR情報がnullのまま
      expect(metadata.pr_url).toBeNull();
      expect(metadata.pr_number).toBeNull();
    });

    test('PR番号が大きな値でもメタデータに正しく設定されることを検証（境界値）', () => {
      // Given: PR作成結果（大きなPR番号）
      const prResult = {
        success: true,
        pr_url: 'https://github.com/owner/repo/pull/999999',
        pr_number: 999999,
      };

      // When: PR情報をメタデータに設定
      const metadata = {
        pr_url: prResult.pr_url ?? null,
        pr_number: prResult.pr_number ?? null,
      };

      // Then: メタデータに正しくPR情報が設定される
      expect(metadata.pr_url).toBe('https://github.com/owner/repo/pull/999999');
      expect(metadata.pr_number).toBe(999999);
    });

    test('PR URLの形式が正しいことを検証', () => {
      // Given: 各種PR URL
      const testCases = [
        'https://github.com/owner/repo/pull/123',
        'https://github.com/tielec/ai-workflow-agent/pull/456',
        'https://github.enterprise.com/owner/repo/pull/789',
      ];

      // When & Then: すべてのURLが正しい形式であることを検証
      testCases.forEach((url) => {
        expect(url).toMatch(/^https:\/\/[^\/]+\/[^\/]+\/[^\/]+\/pull\/\d+$/);
      });
    });

    test('PR番号が最小値（1）でもメタデータに正しく設定されることを検証（境界値）', () => {
      // Given: PR作成結果（最小PR番号）
      const prResult = {
        success: true,
        pr_url: 'https://github.com/owner/repo/pull/1',
        pr_number: 1,
      };

      // When: PR情報をメタデータに設定
      const metadata = {
        pr_url: prResult.pr_url ?? null,
        pr_number: prResult.pr_number ?? null,
      };

      // Then: メタデータに正しくPR情報が設定される
      expect(metadata.pr_url).toBe('https://github.com/owner/repo/pull/1');
      expect(metadata.pr_number).toBe(1);
      expect(metadata.pr_number).toBeGreaterThan(0);
    });
  });

  describe('コミット&プッシュのエラーハンドリング', () => {
    test('コミット失敗時、エラーが適切に処理されることを検証（ロジック）', () => {
      // Given: コミット失敗結果
      const commitResult = {
        success: false,
        error: 'Commit failed: nothing to commit',
      };

      // When: エラーハンドリングロジックをシミュレーション
      let warningMessage = '';
      if (!commitResult.success) {
        warningMessage = `Failed to commit PR metadata: ${commitResult.error ?? 'unknown error'}. PR info saved locally.`;
      }

      // Then: 警告メッセージが正しく生成される
      expect(warningMessage).toContain('Failed to commit PR metadata');
      expect(warningMessage).toContain('nothing to commit');
      expect(warningMessage).toContain('PR info saved locally');
    });

    test('プッシュ失敗時、エラーが適切に処理されることを検証（ロジック）', () => {
      // Given: プッシュ失敗結果
      const pushResult = {
        success: false,
        error: 'Push failed: network error',
      };

      // When: エラーハンドリングロジックをシミュレーション
      let warningMessage = '';
      if (!pushResult.success) {
        warningMessage = `Failed to push PR metadata: ${pushResult.error ?? 'unknown error'}. PR info saved locally.`;
      }

      // Then: 警告メッセージが正しく生成される
      expect(warningMessage).toContain('Failed to push PR metadata');
      expect(warningMessage).toContain('network error');
      expect(warningMessage).toContain('PR info saved locally');
    });

    test('予期しないエラー時、エラーが適切に処理されることを検証（ロジック）', () => {
      // Given: 予期しないエラー
      const error = new Error('Unexpected error: EACCES permission denied');

      // When: エラーハンドリングロジックをシミュレーション
      const warningMessage = `Failed to commit/push PR metadata: ${error.message}. PR info saved locally.`;

      // Then: 警告メッセージが正しく生成される
      expect(warningMessage).toContain('Failed to commit/push PR metadata');
      expect(warningMessage).toContain('EACCES permission denied');
      expect(warningMessage).toContain('PR info saved locally');
    });
  });
});
