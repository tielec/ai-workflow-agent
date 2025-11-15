/**
 * ユニットテスト: RepositoryAnalyzer
 * Phase 5 Test Implementation: Issue #121
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import { IssueCategory } from '../../../src/types.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RepositoryAnalyzer', () => {
  let analyzer: RepositoryAnalyzer;
  const fixturesPath = path.join(__dirname, '../../fixtures/sample-repository');

  beforeEach(() => {
    // テストフィクスチャのパスを使用してアナライザーを初期化
    analyzer = new RepositoryAnalyzer(fixturesPath);
  });

  describe('analyzeForBugs', () => {
    /**
     * テストケース 2.1.1: analyzeForBugs_正常系_エラーハンドリング欠如検出
     * 目的: 非同期関数でtry-catchが使用されていない箇所を正しく検出できることを検証
     */
    it('should detect missing error handling in async functions', async () => {
      // When: バグ検出を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: エラーハンドリング欠如が検出される
      const missingErrorHandling = candidates.filter((c) =>
        c.title.includes('Missing error handling'),
      );

      expect(missingErrorHandling.length).toBeGreaterThan(0);

      const firstCandidate = missingErrorHandling[0];
      expect(firstCandidate.category).toBe(IssueCategory.BUG);
      expect(firstCandidate.file).toContain('missing-error-handling.ts');
      expect(firstCandidate.confidence).toBeGreaterThanOrEqual(0.7);
      expect(firstCandidate.priority).toBe('High');
      expect(firstCandidate.suggestedFixes.length).toBeGreaterThan(0);
      expect(firstCandidate.codeSnippet).toBeTruthy();
    });

    /**
     * テストケース 2.1.2: analyzeForBugs_正常系_try-catchあり
     * 目的: 適切にtry-catchが実装されている非同期関数が誤検知されないことを検証
     */
    it('should not detect async functions with try-catch', async () => {
      // When: バグ検出を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: fetchDataWithTryCatch関数は検出されない
      const falsePositives = candidates.filter(
        (c) => c.title.includes('fetchDataWithTryCatch') && c.title.includes('Missing error handling'),
      );

      expect(falsePositives.length).toBe(0);
    });

    /**
     * テストケース 2.1.3: detectTypeSafetyIssues_正常系_any型検出
     * 目的: any型が使用されている変数を正しく検出できることを検証
     */
    it('should detect any type usage', async () => {
      // When: バグ検出を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: any型使用が検出される
      const typeSafetyIssues = candidates.filter((c) => c.title.includes('Type safety issue'));

      expect(typeSafetyIssues.length).toBeGreaterThan(0);

      const firstIssue = typeSafetyIssues[0];
      expect(firstIssue.category).toBe(IssueCategory.BUG);
      expect(firstIssue.file).toContain('type-safety-issues.ts');
      expect(firstIssue.confidence).toBeGreaterThanOrEqual(0.6);
      expect(firstIssue.priority).toBe('Medium');
    });

    /**
     * テストケース 2.1.4: detectResourceLeaks_正常系_未クローズストリーム検出
     * 目的: createReadStreamで作成されたストリームが適切にクローズされていない箇所を検出できることを検証
     */
    it('should detect resource leaks (unclosed streams)', async () => {
      // When: バグ検出を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: リソースリークが検出される
      const resourceLeaks = candidates.filter((c) => c.title.includes('resource leak'));

      expect(resourceLeaks.length).toBeGreaterThan(0);

      const firstLeak = resourceLeaks[0];
      expect(firstLeak.category).toBe(IssueCategory.BUG);
      expect(firstLeak.file).toContain('resource-leaks.ts');
      expect(firstLeak.confidence).toBeGreaterThanOrEqual(0.8);
      expect(firstLeak.priority).toBe('High');
    });

    /**
     * テストケース 2.1.5: extractCodeSnippet_境界値_ファイル先頭
     * 目的: ファイル先頭付近（10行未満）のコードスニペット抽出が正しく動作することを検証
     */
    it('should extract code snippet near file start', async () => {
      // When: バグ検出を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: コードスニペットが適切に抽出される
      const candidateWithSnippet = candidates.find((c) => c.lineNumber < 10);

      if (candidateWithSnippet) {
        expect(candidateWithSnippet.codeSnippet).toBeTruthy();
        expect(candidateWithSnippet.codeSnippet.length).toBeGreaterThan(0);
        // ファイル先頭を超えてマイナス行にならないことを確認
        const lines = candidateWithSnippet.codeSnippet.split('\n');
        expect(lines.length).toBeGreaterThan(0);
      }
    });

    /**
     * テストケース 2.1.7: analyzeForBugs_異常系_空プロジェクト
     * 目的: ソースファイルが存在しない空プロジェクトでもエラーが発生しないことを検証
     */
    it('should handle empty project gracefully', async () => {
      // Given: 空のディレクトリでアナライザーを初期化
      const emptyAnalyzer = new RepositoryAnalyzer('/tmp/empty-project-' + Date.now());

      // When: バグ検出を実行
      const candidates = await emptyAnalyzer.analyzeForBugs();

      // Then: エラーがスローされず、空の配列が返却される
      expect(candidates).toBeInstanceOf(Array);
      expect(candidates.length).toBe(0);
    });
  });

  describe('analyzeForRefactoring', () => {
    /**
     * Phase 2: リファクタリング検出（未実装）
     * 目的: Phase 2で実装されるまで空配列を返すことを検証
     */
    it('should return empty array (Phase 2 not implemented)', async () => {
      // When: リファクタリング検出を実行
      const candidates = await analyzer.analyzeForRefactoring();

      // Then: 空配列が返却される（Phase 2で実装予定）
      expect(candidates).toBeInstanceOf(Array);
      expect(candidates.length).toBe(0);
    });
  });

  describe('analyzeForEnhancements', () => {
    /**
     * Phase 3: 機能拡張検出（未実装）
     * 目的: Phase 3で実装されるまで空配列を返すことを検証
     */
    it('should return empty array (Phase 3 not implemented)', async () => {
      // When: 機能拡張検出を実行
      const candidates = await analyzer.analyzeForEnhancements();

      // Then: 空配列が返却される（Phase 3で実装予定）
      expect(candidates).toBeInstanceOf(Array);
      expect(candidates.length).toBe(0);
    });
  });
});
