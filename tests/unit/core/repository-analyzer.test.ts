/**
 * ユニットテスト: RepositoryAnalyzer（リポジトリ探索エンジン）
 *
 * テスト対象:
 * - analyzeForBugs(): 潜在的なバグ検出
 * - detectMissingErrorHandling(): エラーハンドリング欠如検出
 * - detectTypeSafetyIssues(): 型安全性問題検出
 * - detectResourceLeaks(): リソースリーク検出
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import { IssueCategory } from '../../../src/types.js';
import path from 'node:path';

// テストフィクスチャのパス
const FIXTURE_PATH = path.join(process.cwd(), 'tests/fixtures/auto-issue');

// =============================================================================
// analyzeForBugs() のテスト
// =============================================================================

describe('RepositoryAnalyzer', () => {
  let analyzer: RepositoryAnalyzer;

  beforeAll(() => {
    // Given: テストフィクスチャを使用したRepositoryAnalyzerインスタンス
    analyzer = new RepositoryAnalyzer(FIXTURE_PATH);
  });

  // ===========================================================================
  // エラーハンドリング欠如検出のテスト
  // ===========================================================================

  describe('analyzeForBugs - エラーハンドリング欠如検出', () => {
    test('非同期関数でtry-catchが使用されていない箇所を検出する', async () => {
      // Given: エラーハンドリング欠如のサンプルコードが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: エラーハンドリング欠如が検出される
      const errorHandlingIssues = candidates.filter(
        (c) => c.title.includes('エラーハンドリングの欠如') && c.file.includes('missing-error-handling.ts')
      );

      expect(errorHandlingIssues.length).toBeGreaterThan(0);

      // 検出された最初のIssueの詳細を検証
      const firstIssue = errorHandlingIssues[0];
      expect(firstIssue.category).toBe(IssueCategory.BUG);
      expect(firstIssue.confidence).toBe(0.95);
      expect(firstIssue.priority).toBe('High');
      expect(firstIssue.description).toContain('try-catch');
      expect(firstIssue.suggestedFixes).toContain('try-catchブロックで非同期関数を囲む');
      expect(firstIssue.expectedBenefits).toContain('アプリケーションの安定性向上');
      expect(firstIssue.codeSnippet).toBeTruthy();
    });

    test('適切にtry-catchが実装されている非同期関数は検出されない', async () => {
      // Given: 適切なエラーハンドリングのサンプルコードが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: fetchDataWithTryCatch関数は検出されない
      const falsePositives = candidates.filter(
        (c) =>
          c.title.includes('fetchDataWithTryCatch') ||
          c.title.includes('processDataAsyncSafe') ||
          (c.file.includes('good-code.ts') && c.title.includes('エラーハンドリング'))
      );

      expect(falsePositives).toHaveLength(0);
    });

    test('async アロー関数のエラーハンドリング欠如を検出する', async () => {
      // Given: async アロー関数のサンプルコードが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: processDataAsync関数のエラーハンドリング欠如が検出される
      const arrowFunctionIssues = candidates.filter(
        (c) =>
          (c.title.includes('processDataAsync') || c.title.includes('<anonymous>')) &&
          c.file.includes('missing-error-handling.ts')
      );

      expect(arrowFunctionIssues.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // 型安全性問題検出のテスト
  // ===========================================================================

  describe('analyzeForBugs - 型安全性問題検出', () => {
    test('any型が使用されている変数を検出する', async () => {
      // Given: any型の変数宣言が存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: any型の使用が検出される
      const typeSafetyIssues = candidates.filter(
        (c) => c.title.includes('型安全性の問題') && c.file.includes('type-safety-issues.ts')
      );

      expect(typeSafetyIssues.length).toBeGreaterThan(0);

      // 変数宣言のany型を検証
      const variableIssues = typeSafetyIssues.filter(
        (c) => c.title.includes('userData') || c.title.includes('config')
      );
      expect(variableIssues.length).toBeGreaterThanOrEqual(2);

      // 検出されたIssueの詳細を検証
      const firstIssue = variableIssues[0];
      expect(firstIssue.category).toBe(IssueCategory.BUG);
      expect(firstIssue.confidence).toBe(0.85);
      expect(firstIssue.priority).toBe('Medium');
      expect(firstIssue.description).toContain('any型が使用されています');
      expect(firstIssue.suggestedFixes).toContain('適切な型アノテーションを追加する');
    });

    test('any型のパラメータを検出する', async () => {
      // Given: any型のパラメータを持つ関数が存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: any型のパラメータが検出される
      const parameterIssues = candidates.filter(
        (c) =>
          c.title.includes('型安全性の問題') &&
          c.title.includes('パラメータ') &&
          c.file.includes('type-safety-issues.ts')
      );

      expect(parameterIssues.length).toBeGreaterThan(0);
    });

    test('型安全なコードは検出されない', async () => {
      // Given: 型安全なコードが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: 型安全なコードは検出されない
      const falsePositives = candidates.filter(
        (c) => c.file.includes('good-code.ts') && c.title.includes('型安全性')
      );

      expect(falsePositives).toHaveLength(0);
    });
  });

  // ===========================================================================
  // リソースリーク検出のテスト
  // ===========================================================================

  describe('analyzeForBugs - リソースリーク検出', () => {
    test('createReadStreamで作成されたストリームが適切にクローズされていない箇所を検出する', async () => {
      // Given: createReadStream未クローズのサンプルコードが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: リソースリークが検出される
      const resourceLeakIssues = candidates.filter(
        (c) => c.title.includes('リソースリーク') && c.file.includes('resource-leaks.ts')
      );

      expect(resourceLeakIssues.length).toBeGreaterThan(0);

      // 検出されたIssueの詳細を検証
      const firstIssue = resourceLeakIssues[0];
      expect(firstIssue.category).toBe(IssueCategory.BUG);
      expect(firstIssue.confidence).toBe(0.80);
      expect(firstIssue.priority).toBe('High');
      expect(firstIssue.description).toContain('createReadStream');
      expect(firstIssue.suggestedFixes).toContain('ストリームを明示的にclose()する');
      expect(firstIssue.expectedBenefits).toContain('メモリリークの防止');
    });

    test('pipe()で接続されたストリームは検出されない', async () => {
      // Given: pipe()を使用した適切なストリーム処理が存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: readFileWithPipe関数は検出されない
      const falsePositives = candidates.filter(
        (c) => c.title.includes('readFileWithPipe') && c.file.includes('resource-leaks.ts')
      );

      expect(falsePositives).toHaveLength(0);
    });

    test('明示的にclose()されたストリームは検出されない', async () => {
      // Given: close()を使用した適切なストリーム処理が存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: readFileWithClose関数は検出されない
      const falsePositives = candidates.filter(
        (c) => c.title.includes('readFileWithClose') && c.file.includes('resource-leaks.ts')
      );

      expect(falsePositives).toHaveLength(0);
    });
  });

  // ===========================================================================
  // 統合テスト: 複数の問題を同時に検出
  // ===========================================================================

  describe('analyzeForBugs - 統合テスト', () => {
    test('複数カテゴリの問題を同時に検出する', async () => {
      // Given: 複数種類の問題を含むコードベースが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: 複数カテゴリの問題が検出される
      expect(candidates.length).toBeGreaterThan(0);

      // エラーハンドリング欠如が含まれる
      const errorHandlingIssues = candidates.filter((c) => c.title.includes('エラーハンドリング'));
      expect(errorHandlingIssues.length).toBeGreaterThan(0);

      // 型安全性問題が含まれる
      const typeSafetyIssues = candidates.filter((c) => c.title.includes('型安全性'));
      expect(typeSafetyIssues.length).toBeGreaterThan(0);

      // リソースリークが含まれる
      const resourceLeakIssues = candidates.filter((c) => c.title.includes('リソースリーク'));
      expect(resourceLeakIssues.length).toBeGreaterThan(0);

      // すべてのIssueが必須フィールドを持つ
      for (const candidate of candidates) {
        expect(candidate.category).toBe(IssueCategory.BUG);
        expect(candidate.title).toBeTruthy();
        expect(candidate.description).toBeTruthy();
        expect(candidate.file).toBeTruthy();
        expect(candidate.lineNumber).toBeGreaterThan(0);
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
        expect(candidate.suggestedFixes).toBeInstanceOf(Array);
        expect(candidate.suggestedFixes.length).toBeGreaterThan(0);
        expect(candidate.expectedBenefits).toBeInstanceOf(Array);
        expect(candidate.expectedBenefits.length).toBeGreaterThan(0);
        expect(['Low', 'Medium', 'High']).toContain(candidate.priority);
      }
    });

    test('問題のないコードからはIssueを検出しない', async () => {
      // Given: 問題のないコードが存在
      // When: バグ解析を実行
      const candidates = await analyzer.analyzeForBugs();

      // Then: good-code.tsからはIssueが検出されない
      const goodCodeIssues = candidates.filter((c) => c.file.includes('good-code.ts'));

      expect(goodCodeIssues).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Phase 2/3 のスタブメソッドテスト
  // ===========================================================================

  describe('Phase 2/3 未実装メソッド', () => {
    test('analyzeForRefactoring() は空の配列を返す', async () => {
      // Given: Phase 2未実装
      // When: リファクタリング解析を実行
      const candidates = await analyzer.analyzeForRefactoring();

      // Then: 空の配列が返される
      expect(candidates).toEqual([]);
    });

    test('analyzeForEnhancements() は空の配列を返す', async () => {
      // Given: Phase 3未実装
      // When: 機能拡張解析を実行
      const candidates = await analyzer.analyzeForEnhancements();

      // Then: 空の配列が返される
      expect(candidates).toEqual([]);
    });
  });

  // ===========================================================================
  // エッジケースのテスト
  // ===========================================================================

  describe('エッジケース', () => {
    test('空のプロジェクトでもエラーが発生しない', async () => {
      // Given: ソースファイルが存在しない空のディレクトリ
      const emptyAnalyzer = new RepositoryAnalyzer('/tmp/empty-test-repo-' + Date.now());

      // When: バグ解析を実行
      const candidates = await emptyAnalyzer.analyzeForBugs();

      // Then: エラーがスローされず、空の配列が返される
      expect(candidates).toEqual([]);
    });
  });
});
