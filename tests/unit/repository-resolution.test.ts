/**
 * ユニットテスト: リポジトリ解決機能
 *
 * テスト対象:
 * - parseIssueUrl(): Issue URL解析
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 *
 * 注意: resolveLocalRepoPath()のテストはファイルシステムのモックが複雑なため、
 * インテグレーションテストで実施します。
 * リファクタリング後、parseIssueUrlは src/core/repository-utils.ts に移動されました。
 */

import { describe, test, expect } from '@jest/globals';

// テスト対象の関数をインポート
import { parseIssueUrl } from '../../src/core/repository-utils.js';

// =============================================================================
// UT-001: parseIssueUrl_正常系_標準URL
// =============================================================================
describe('UT-001: parseIssueUrl_正常系_標準URL', () => {
  test('標準的なGitHub Issue URLから正しくリポジトリ情報を抽出できる', () => {
    // Given: 標準的なGitHub Issue URL
    const issueUrl = 'https://github.com/tielec/my-app/issues/123';

    // When: parseIssueUrl()を実行
    const result = parseIssueUrl(issueUrl);

    // Then: 正しい情報が抽出される
    expect(result.owner).toBe('tielec');
    expect(result.repo).toBe('my-app');
    expect(result.issueNumber).toBe(123);
    expect(result.repositoryName).toBe('tielec/my-app');
  });
});

// =============================================================================
// UT-002: parseIssueUrl_正常系_末尾スラッシュあり
// =============================================================================
describe('UT-002: parseIssueUrl_正常系_末尾スラッシュあり', () => {
  test('末尾にスラッシュがあるURLでも正しく解析できる', () => {
    // Given: 末尾にスラッシュがあるURL
    const issueUrl = 'https://github.com/tielec/my-app/issues/123/';

    // When: parseIssueUrl()を実行
    const result = parseIssueUrl(issueUrl);

    // Then: UT-001と同じ結果が返される
    expect(result.owner).toBe('tielec');
    expect(result.repo).toBe('my-app');
    expect(result.issueNumber).toBe(123);
    expect(result.repositoryName).toBe('tielec/my-app');
  });
});

// =============================================================================
// UT-003: parseIssueUrl_正常系_大きなIssue番号
// =============================================================================
describe('UT-003: parseIssueUrl_正常系_大きなIssue番号', () => {
  test('大きなIssue番号でも正しく解析できる（境界値テスト）', () => {
    // Given: 大きなIssue番号のURL
    const issueUrl = 'https://github.com/tielec/infrastructure-as-code/issues/99999';

    // When: parseIssueUrl()を実行
    const result = parseIssueUrl(issueUrl);

    // Then: 正しい情報が抽出される
    expect(result.owner).toBe('tielec');
    expect(result.repo).toBe('infrastructure-as-code');
    expect(result.issueNumber).toBe(99999);
    expect(result.repositoryName).toBe('tielec/infrastructure-as-code');
    expect(result.repo).toContain('-'); // ハイフンが含まれていても正しく解析
  });
});

// =============================================================================
// UT-004: parseIssueUrl_異常系_GitHub以外のURL
// =============================================================================
describe('UT-004: parseIssueUrl_異常系_GitHub以外のURL', () => {
  test('GitHub以外のURLではエラーが発生する', () => {
    // Given: GitHub以外のURL
    const issueUrl = 'https://example.com/issues/123';

    // When & Then: parseIssueUrl()でエラーが投げられる
    expect(() => parseIssueUrl(issueUrl)).toThrow('Invalid GitHub Issue URL');
    expect(() => parseIssueUrl(issueUrl)).toThrow(issueUrl);
  });
});

// =============================================================================
// UT-005: parseIssueUrl_異常系_プルリクエストURL
// =============================================================================
describe('UT-005: parseIssueUrl_異常系_プルリクエストURL', () => {
  test('プルリクエストURLではエラーが発生する', () => {
    // Given: プルリクエストURL
    const issueUrl = 'https://github.com/tielec/my-app/pulls/123';

    // When & Then: parseIssueUrl()でエラーが投げられる
    expect(() => parseIssueUrl(issueUrl)).toThrow('Invalid GitHub Issue URL');
  });
});

// =============================================================================
// UT-006: parseIssueUrl_異常系_Issue番号なし
// =============================================================================
describe('UT-006: parseIssueUrl_異常系_Issue番号なし', () => {
  test('Issue番号がないURLではエラーが発生する', () => {
    // Given: Issue番号がないURL
    const issueUrl = 'https://github.com/tielec/my-app';

    // When & Then: parseIssueUrl()でエラーが投げられる
    expect(() => parseIssueUrl(issueUrl)).toThrow('Invalid GitHub Issue URL');
  });
});

// =============================================================================
// UT-007: parseIssueUrl_異常系_Issue番号が数値でない
// =============================================================================
describe('UT-007: parseIssueUrl_異常系_Issue番号が数値でない', () => {
  test('Issue番号が数値でない場合にエラーが発生する', () => {
    // Given: 数値でないIssue番号のURL
    const issueUrl = 'https://github.com/tielec/my-app/issues/abc';

    // When & Then: parseIssueUrl()でエラーが投げられる
    expect(() => parseIssueUrl(issueUrl)).toThrow('Invalid GitHub Issue URL');
  });
});
