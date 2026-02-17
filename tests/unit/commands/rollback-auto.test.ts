/**
 * ユニットテスト: rollback auto コマンドモジュール
 * Issue #271: エージェントベースの自動ロールバック判定機能
 *
 * テスト対象:
 * - parseRollbackDecision()
 * - validateRollbackDecision()
 * - handleRollbackAutoCommand() (統合テスト)
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  parseRollbackDecision,
  validateRollbackDecision,
  getPhaseNumber,
} from '../../../src/commands/rollback.js';
import type { RollbackDecision } from '../../../src/types/commands.js';
import { PhaseName, StepName } from '../../../src/types.js';

// =============================================================================
// JSON パース処理のテスト (UT-PARSE-001 ~ UT-PARSE-006)
// =============================================================================
describe('JSON パース処理 - parseRollbackDecision()', () => {
  // UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース
  describe('UT-PARSE-001: Markdownコードブロック内のJSONを正常にパース', () => {
    test('Markdownコードブロック内のJSONを正しく抽出・パースできる', () => {
      // Given: Markdownコードブロック形式のエージェント出力
      const agentOutput = [
        'エージェントの分析結果は以下の通りです。',
        '',
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "テスト失敗の原因が実装にあります。",',
        '  "confidence": "high",',
        '  "analysis": "Testing Phaseで3件のテストが失敗しています。"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const result = parseRollbackDecision(agentOutput);

      // Then: 正しくパースされた RollbackDecision が返される
      expect(result.needs_rollback).toBe(true);
      expect(result.to_phase).toBe('implementation');
      expect(result.to_step).toBe('revise');
      expect(result.reason).toBe('テスト失敗の原因が実装にあります。');
      expect(result.confidence).toBe('high');
      expect(result.analysis).toBe('Testing Phaseで3件のテストが失敗しています。');
    });
  });

  // UT-PARSE-002: プレーンテキスト内のJSONを正常にパース
  describe('UT-PARSE-002: プレーンテキスト内のJSONを正常にパース', () => {
    test('Markdownコードブロックがない場合でも、プレーンテキスト内のJSONを抽出できる', () => {
      // Given: プレーンテキスト形式のエージェント出力
      const agentOutput = [
        '判断結果: {"needs_rollback": false, "reason": "差し戻し不要", "confidence": "high", "analysis": "全テスト成功"}',
      ];

      // When: parseRollbackDecision()を呼び出す
      const result = parseRollbackDecision(agentOutput);

      // Then: 正しくパースされる
      expect(result.needs_rollback).toBe(false);
      expect(result.reason).toBe('差し戻し不要');
      expect(result.confidence).toBe('high');
      expect(result.analysis).toBe('全テスト成功');
    });
  });

  // UT-PARSE-003: JSON開始・終了探索パターンでパース
  describe('UT-PARSE-003: JSON開始・終了探索パターンでパース', () => {
    test('Markdownコードブロックもプレーンテキストパターンも失敗した場合、{ と } を探索してJSONを抽出できる', () => {
      // Given: 特殊な形式のエージェント出力
      const agentOutput = [
        '以下が判断結果です:',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "design",',
        '  "to_step": "revise",',
        '  "reason": "設計の不備があります。",',
        '  "confidence": "medium",',
        '  "analysis": "レビュー結果にBLOCKERが存在します。"',
        '}',
        'その他の情報...',
      ];

      // When: parseRollbackDecision()を呼び出す
      const result = parseRollbackDecision(agentOutput);

      // Then: ブラケット検索により正しくパースされる
      expect(result.needs_rollback).toBe(true);
      expect(result.to_phase).toBe('design');
      expect(result.to_step).toBe('revise');
      expect(result.reason).toBe('設計の不備があります。');
      expect(result.confidence).toBe('medium');
      expect(result.analysis).toBe('レビュー結果にBLOCKERが存在します。');
    });
  });

  // UT-PARSE-004: JSON抽出失敗時のエラー
  describe('UT-PARSE-004: JSON抽出失敗時のエラー', () => {
    test('JSONが全く含まれていない出力に対して、適切なエラーメッセージを返す', () => {
      // Given: JSONを含まない出力
      const agentOutput = ['エージェントの応答にJSONが含まれていません。'];

      // When & Then: エラーがスローされる
      expect(() => parseRollbackDecision(agentOutput)).toThrow(
        /Failed to parse RollbackDecision from agent response/
      );
    });
  });

  // UT-PARSE-005: 不正なJSON構文でパース失敗
  describe('UT-PARSE-005: 不正なJSON構文でパース失敗', () => {
    test('JSON構文エラー（カンマ抜け）に対して、適切なエラーメッセージを返す', () => {
      // Given: 不正なJSON（カンマ抜け）
      const agentOutput = [
        '```json',
        '{',
        '  "needs_rollback": true',
        '  "to_phase": "implementation"',
        '}',
        '```',
      ];

      // When & Then: エラーがスローされる
      expect(() => parseRollbackDecision(agentOutput)).toThrow(
        /Failed to parse RollbackDecision/
      );
    });
  });

  // UT-PARSE-006: 改行を含むJSONフィールドを正常にパース
  describe('UT-PARSE-006: 改行を含むJSONフィールドを正常にパース', () => {
    test('reason や analysis フィールドに改行が含まれる場合でも、正しくパースできる', () => {
      // Given: 改行を含むJSONフィールド
      const agentOutput = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "テスト失敗の原因が実装にあります。\\n\\n失敗したテスト:\\n- test_commitRollback_converts_paths\\n- test_filterExistingFiles_handles_absolute_paths",',
        '  "confidence": "high",',
        '  "analysis": "Testing Phaseで3件のテストが失敗しています。"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const result = parseRollbackDecision(agentOutput);

      // Then: 改行が正しく処理される（実際の改行文字になる）
      expect(result.reason).toContain('失敗したテスト:');
      expect(result.reason).toContain('- test_commitRollback_converts_paths');
      expect(result.reason).toContain('- test_filterExistingFiles_handles_absolute_paths');
    });
  });
});

// =============================================================================
// バリデーション処理のテスト (UT-VALID-001 ~ UT-VALID-010)
// =============================================================================
describe('バリデーション処理 - validateRollbackDecision()', () => {
  // UT-VALID-001: 正常なRollbackDecisionをバリデーション成功
  describe('UT-VALID-001: 正常なRollbackDecisionをバリデーション成功', () => {
    test('すべての必須フィールドが正しい形式の場合、バリデーションが成功する', () => {
      // Given: 正常なRollbackDecision
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'implementation',
        to_step: 'revise',
        reason: 'テスト失敗の原因が実装にあります。',
        confidence: 'high',
        analysis: 'Testing Phaseで3件のテストが失敗しています。',
      };

      // When & Then: エラーがスローされない
      expect(() => validateRollbackDecision(decision)).not.toThrow();
    });
  });

  // UT-VALID-002: needs_rollback フィールド欠損時のエラー
  describe('UT-VALID-002: needs_rollback フィールド欠損時のエラー', () => {
    test('needs_rollback フィールドが欠損している場合、エラーがスローされる', () => {
      // Given: needs_rollback が欠損
      const decision = {
        to_phase: 'implementation',
        reason: '理由',
        confidence: 'high',
        analysis: '分析',
      } as any;

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /"needs_rollback" must be a boolean/
      );
    });
  });

  // UT-VALID-003: needs_rollback=true時にto_phaseが欠損
  describe('UT-VALID-003: needs_rollback=true時にto_phaseが欠損', () => {
    test('needs_rollback=true の場合、to_phase が必須であることを検証', () => {
      // Given: to_phase が欠損
      const decision: RollbackDecision = {
        needs_rollback: true,
        reason: '理由',
        confidence: 'high',
        analysis: '分析',
      } as any;

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /"to_phase" is required when needs_rollback=true/
      );
    });
  });

  // UT-VALID-004: 不正なto_phase値
  describe('UT-VALID-004: 不正なto_phase値', () => {
    test('to_phase が有効なPhaseName以外の値の場合、エラーがスローされる', () => {
      // Given: 不正なto_phase
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'invalid_phase' as any,
        reason: '理由',
        confidence: 'high',
        analysis: '分析',
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /must be one of:/
      );
    });
  });

  // UT-VALID-005: 不正なto_step値
  describe('UT-VALID-005: 不正なto_step値', () => {
    test('to_step が execute | review | revise 以外の値の場合、エラーがスローされる', () => {
      // Given: 不正なto_step
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'implementation',
        to_step: 'invalid_step' as any,
        reason: '理由',
        confidence: 'high',
        analysis: '分析',
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /must be one of: execute, review, revise/
      );
    });
  });

  // UT-VALID-006: 不正なconfidence値
  describe('UT-VALID-006: 不正なconfidence値', () => {
    test('confidence が high | medium | low 以外の値の場合、エラーがスローされる', () => {
      // Given: 不正なconfidence
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'implementation',
        reason: '理由',
        confidence: 'unknown' as any,
        analysis: '分析',
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /must be "high", "medium", or "low"/
      );
    });
  });

  // UT-VALID-007: reasonフィールドが空文字列
  describe('UT-VALID-007: reasonフィールドが空文字列', () => {
    test('reason フィールドが空文字列の場合、エラーがスローされる', () => {
      // Given: 空のreason
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'implementation',
        reason: '',
        confidence: 'high',
        analysis: '分析',
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /"reason" must be a non-empty string/
      );
    });
  });

  // UT-VALID-008: analysisフィールドが欠損
  describe('UT-VALID-008: analysisフィールドが欠損', () => {
    test('analysis フィールドが欠損または空文字列の場合、エラーがスローされる', () => {
      // Given: analysisが欠損
      const decision = {
        needs_rollback: true,
        to_phase: 'implementation',
        reason: '理由',
        confidence: 'high',
      } as any;

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /"analysis" must be a non-empty string/
      );
    });
  });

  // UT-VALID-009: needs_rollback=falseの場合のバリデーション
  describe('UT-VALID-009: needs_rollback=falseの場合のバリデーション', () => {
    test('needs_rollback=false の場合、to_phase が不要であることを検証', () => {
      // Given: needs_rollback=false
      const decision: RollbackDecision = {
        needs_rollback: false,
        reason: '差し戻し不要',
        confidence: 'high',
        analysis: '全テスト成功',
      };

      // When & Then: エラーがスローされない
      expect(() => validateRollbackDecision(decision)).not.toThrow();
    });
  });

  // UT-VALID-010: すべての有効なPhaseName値でバリデーション成功
  describe('UT-VALID-010: すべての有効なPhaseName値でバリデーション成功', () => {
    test('すべての有効な PhaseName 値でバリデーションが成功することを検証', () => {
      // Given: すべての有効なフェーズ名
      const validPhases: PhaseName[] = [
        'planning',
        'requirements',
        'design',
        'test_scenario',
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
        'evaluation',
      ];

      // When & Then: すべてのフェーズでバリデーション成功
      for (const phase of validPhases) {
        const decision: RollbackDecision = {
          needs_rollback: true,
          to_phase: phase,
          reason: '理由',
          confidence: 'high',
          analysis: '分析',
        };

        expect(() => validateRollbackDecision(decision)).not.toThrow();
      }
    });
  });

  // 追加テスト: reason の長さ制限チェック
  describe('UT-VALID-011: reasonフィールドの長さ制限', () => {
    test('reason フィールドが1000文字を超える場合、エラーがスローされる', () => {
      // Given: 1000文字を超えるreason
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'implementation',
        reason: 'a'.repeat(1001),
        confidence: 'high',
        analysis: '分析',
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /must be 1000 characters or less/
      );
    });

    test('reason フィールドが1000文字ちょうどの場合、バリデーションが成功する', () => {
      // Given: 1000文字のreason
      const decision: RollbackDecision = {
        needs_rollback: true,
        to_phase: 'implementation',
        reason: 'a'.repeat(1000),
        confidence: 'high',
        analysis: '分析',
      };

      // When & Then: エラーがスローされない
      expect(() => validateRollbackDecision(decision)).not.toThrow();
    });
  });
});

// =============================================================================
// ヘルパー関数のテスト
// =============================================================================
describe('ヘルパー関数 - getPhaseNumber()', () => {
  test('すべてのフェーズ名から正しいフェーズ番号が返される', () => {
    // Given & When & Then: 各フェーズ名に対応する番号が返される
    expect(getPhaseNumber('planning')).toBe('00');
    expect(getPhaseNumber('requirements')).toBe('01');
    expect(getPhaseNumber('design')).toBe('02');
    expect(getPhaseNumber('test_scenario')).toBe('03');
    expect(getPhaseNumber('implementation')).toBe('04');
    expect(getPhaseNumber('test_implementation')).toBe('05');
    expect(getPhaseNumber('test_preparation')).toBe('06');
    expect(getPhaseNumber('testing')).toBe('07');
    expect(getPhaseNumber('documentation')).toBe('08');
    expect(getPhaseNumber('report')).toBe('09');
    expect(getPhaseNumber('evaluation')).toBe('10');
  });
});
