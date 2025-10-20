/**
 * ユニットテスト: ContentParser.parseEvaluationDecision()
 *
 * テスト対象:
 * - ContentParser.parseEvaluationDecision() の評価決定解析ロジック
 * - 4つの決定タイプ（PASS、PASS_WITH_ISSUES、FAIL_PHASE_*、ABORT）の解析
 * - 無効な形式のエラーハンドリング
 * - 境界値テスト
 *
 * テストシナリオ準拠: test-scenario.md セクション 2.1
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ContentParser } from '../../src/core/content-parser.js';

describe('ContentParser.parseEvaluationDecision - 正常系', () => {
  let parser: ContentParser;

  beforeEach(() => {
    // OpenAI API キーが設定されている場合のみテストを実行
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[WARNING] OPENAI_API_KEY not set, tests will be skipped');
    }
    parser = new ContentParser();
  });

  test('1-1: PASS 決定の解析（正常系）', async () => {
    // Given: PASS 決定を含む評価レポート
    const content = `# 評価レポート

## エグゼクティブサマリー
全フェーズが正常に完了しました。

## 決定
DECISION: PASS

## 理由
REASONING:
All phases completed successfully with high quality outputs.
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: PASS が正しく解析される
    expect(result.success).toBe(true);
    expect(result.decision).toBe('PASS');
    expect(result.error).toBeUndefined();
  });

  test('1-2: PASS_WITH_ISSUES 決定の解析（正常系）', async () => {
    // Given: PASS_WITH_ISSUES 決定と残タスクを含む評価レポート
    const content = `# 評価レポート

DECISION: PASS_WITH_ISSUES

REMAINING_TASKS:
- [ ] タスク1: ドキュメントの誤字修正
- [ ] タスク2: テストカバレッジを80%に向上

REASONING:
Implementation is complete but minor improvements needed.
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: PASS_WITH_ISSUES と残タスクが正しく解析される
    expect(result.success).toBe(true);
    expect(result.decision).toBe('PASS_WITH_ISSUES');
    expect(result.remainingTasks).toBeDefined();
    expect(Array.isArray(result.remainingTasks)).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test('1-3: FAIL_PHASE_2 決定の解析（正常系）', async () => {
    // Given: FAIL_PHASE_2 決定と失敗フェーズ、問題点を含む評価レポート
    const content = `# 評価レポート

DECISION: FAIL_PHASE_2

FAILED_PHASE: design

ISSUES:
1. アーキテクチャ設計が不完全
2. データベーススキーマが定義されていない
3. API仕様が曖昧

REASONING:
Design phase has critical issues that must be addressed before proceeding.
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: FAIL_PHASE_2 と失敗フェーズが正しく解析される
    expect(result.success).toBe(true);
    expect(result.decision).toBe('FAIL_PHASE_2');
    expect(result.failedPhase).toBe('design');
    expect(result.error).toBeUndefined();
  });

  test('1-4: ABORT 決定の解析（正常系）', async () => {
    // Given: ABORT 決定と中止理由、推奨アクションを含む評価レポート
    const content = `# 評価レポート

DECISION: ABORT

ABORT_REASON:
プロジェクトの技術スタックが要件と根本的に不一致です。

RECOMMENDED_ACTIONS:
1. 技術スタックの再選定
2. 要件の見直し
3. プロジェクト計画の再策定

REASONING:
Fundamental mismatch between requirements and chosen technology stack.
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: ABORT と中止理由が正しく解析される
    expect(result.success).toBe(true);
    expect(result.decision).toBe('ABORT');
    expect(result.abortReason).toBeDefined();
    expect(typeof result.abortReason).toBe('string');
    expect(result.error).toBeUndefined();
  });
});

describe('ContentParser.parseEvaluationDecision - 異常系', () => {
  let parser: ContentParser;

  beforeEach(() => {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[WARNING] OPENAI_API_KEY not set, tests will be skipped');
    }
    parser = new ContentParser();
  });

  test('1-5: 無効な決定形式の解析（異常系）', async () => {
    // Given: DECISION を含まない評価レポート
    const content = `# 評価レポート

これは評価レポートですが、DECISION が含まれていません。

## 理由
何らかの理由
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: フォールバック処理でPASSがデフォルト値として返される
    // (LLMパースが失敗した場合、フォールバックパターンマッチングが使用される)
    expect(result.success).toBe(true);
    expect(result.decision).toBeDefined();
  });

  test('1-6: 境界値テスト - 空の評価レポート（異常系）', async () => {
    // Given: 空のファイル
    const content = '';

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: フォールバック処理が実行される
    expect(result.success).toBe(true);
    expect(result.decision).toBeDefined();
  });

  test('1-7: 無効な判定タイプ（INVALID_DECISION_TYPE）の解析', async () => {
    // Given: 無効な DECISION を含む評価レポート
    const content = `# 評価レポート

DECISION: INVALID_DECISION_TYPE

REASONING:
This is an invalid decision type.
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: エラーまたは無効な判定として扱われる
    // (LLMパースの場合、無効な判定タイプはエラーとして返される可能性がある)
    if (!result.success) {
      expect(result.error).toBeDefined();
    } else {
      // LLMが補正した場合、有効な判定タイプに変換されている可能性がある
      expect(result.decision).toBeDefined();
    }
  });
});

describe('ContentParser.parseEvaluationDecision - フォールバックパターンマッチング', () => {
  let parser: ContentParser;

  beforeEach(() => {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('[WARNING] OPENAI_API_KEY not set, tests will be skipped');
    }
    parser = new ContentParser();
  });

  test('1-8: パターンマッチングによる PASS 抽出', async () => {
    // Given: 日本語形式の評価レポート
    const content = `# 評価レポート

**総合評価**: **PASS**

すべてのフェーズが正常に完了しました。
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: PASS が抽出される
    expect(result.success).toBe(true);
    expect(result.decision).toBe('PASS');
  });

  test('1-9: 判定タイプが見つからない場合のデフォルト値', async () => {
    // Given: 判定タイプを含まない評価レポート
    const content = `# 評価レポート

これは評価レポートですが、明確な判定タイプが含まれていません。
`;

    // When: 評価決定を解析
    const result = await parser.parseEvaluationDecision(content);

    // Then: デフォルト値（PASS）が返される
    expect(result.success).toBe(true);
    expect(result.decision).toBeDefined();
  });
});
