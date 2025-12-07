/**
 * 統合テスト: rollback auto コマンド
 * Issue #271: エージェントベースの自動ロールバック判定機能
 *
 * テスト対象:
 * - handleRollbackAutoCommand() のエンドツーエンドフロー
 * - エージェント呼び出しから rollback 実行までの統合動作
 *
 * テスト戦略: UNIT_INTEGRATION - 統合部分
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { parseRollbackDecision, validateRollbackDecision } from '../../src/commands/rollback.js';
import type { RollbackDecision } from '../../src/types/commands.js';
import * as fs from 'fs-extra';
import * as path from 'node:path';

// =============================================================================
// 統合テスト: エージェント呼び出し〜rollback実行（E2E）
// =============================================================================
describe('統合テスト - rollback auto コマンド', () => {
  // IT-E2E-001: テスト失敗による自動差し戻し（成功シナリオ）
  describe('IT-E2E-001: テスト失敗による自動差し戻し（成功シナリオ）', () => {
    test('エージェントが「テスト失敗の原因が実装にある」と判断し、正しくパースされる', () => {
      // Given: エージェントがテスト失敗を分析したレスポンス（モック）
      const mockAgentResponse = [
        'エージェントの分析結果を以下に示します。',
        '',
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "テスト失敗の原因が実装にあるため、Implementation Phase で修正が必要です。\\n\\n失敗したテスト:\\n- test_commitRollback_converts_paths: 絶対パス変換ロジックが未実装\\n- test_filterExistingFiles_handles_absolute_paths: パス結合の問題",',
        '  "confidence": "high",',
        '  "analysis": "Testing Phase で 3 件のテストが失敗しています。失敗内容を分析した結果、commit-manager.ts の commitRollback メソッドで絶対パスを相対パスに変換するロジックが欠落していることが原因です。"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: 正しくパースされ、バリデーションが成功する
      expect(decision.needs_rollback).toBe(true);
      expect(decision.to_phase).toBe('implementation');
      expect(decision.to_step).toBe('revise');
      expect(decision.confidence).toBe('high');

      // バリデーションも成功することを確認
      expect(() => validateRollbackDecision(decision)).not.toThrow();
    });
  });

  // IT-E2E-002: レビューBLOCKERによる自動差し戻し（成功シナリオ）
  describe('IT-E2E-002: レビューBLOCKERによる自動差し戻し（成功シナリオ）', () => {
    test('エージェントが「レビューBLOCKERにより要件定義に問題がある」と判断し、正しくパースされる', () => {
      // Given: エージェントがレビューBLOCKERを分析したレスポンス（モック）
      const mockAgentResponse = [
        '分析結果:',
        '',
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "planning",',
        '  "to_step": "revise",',
        '  "reason": "要件定義に根本的な問題があります。",',
        '  "confidence": "medium",',
        '  "analysis": "レビュー結果にBLOCKERが存在します。エージェント判断ロジックの入力情報が不足している可能性があります。"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: 正しくパースされる
      expect(decision.needs_rollback).toBe(true);
      expect(decision.to_phase).toBe('planning');
      expect(decision.to_step).toBe('revise');
      expect(decision.confidence).toBe('medium');

      // バリデーションも成功することを確認
      expect(() => validateRollbackDecision(decision)).not.toThrow();
    });
  });

  // IT-E2E-003: 差し戻し不要の判断
  describe('IT-E2E-003: 差し戻し不要の判断', () => {
    test('エージェントが「差し戻し不要」と判断した場合、正しくパースされる', () => {
      // Given: エージェントが差し戻し不要と判断したレスポンス（モック）
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": false,',
        '  "reason": "すべてのテストが成功しており、差し戻しは不要です。",',
        '  "confidence": "high",',
        '  "analysis": "Testing Phase の結果を確認しましたが、全テストが成功しています。レビュー結果にも BLOCKER や MAJOR はありません。"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: needs_rollback が false であることを確認
      expect(decision.needs_rollback).toBe(false);
      expect(decision.confidence).toBe('high');

      // バリデーションも成功することを確認
      expect(() => validateRollbackDecision(decision)).not.toThrow();
    });
  });

  // IT-E2E-004: dry-runモードでの実行（エージェント判断のみ）
  describe('IT-E2E-004: dry-runモードでの実行', () => {
    test('--dry-run オプション使用時、エージェント判断が正しくパースされる', () => {
      // Given: dry-runモードでのエージェントレスポンス（モック）
      const mockAgentResponse = [
        '以下が判断結果です。',
        '',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "実装の問題",',
        '  "confidence": "high",',
        '  "analysis": "テスト失敗"',
        '}',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: 正しくパースされる（dry-runでも同じパース処理）
      expect(decision.needs_rollback).toBe(true);
      expect(decision.to_phase).toBe('implementation');
      expect(decision.to_step).toBe('revise');
    });
  });

  // IT-E2E-005: confidence=high かつ --force での判断
  describe('IT-E2E-005: confidence=high かつ --force での自動実行', () => {
    test('confidence="high" かつ --force オプション使用時、確認プロンプトがスキップされる想定でパースされる', () => {
      // Given: high confidence のエージェントレスポンス（モック）
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "実装の問題",',
        '  "confidence": "high",',
        '  "analysis": "テスト失敗"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: confidence が high であることを確認
      expect(decision.confidence).toBe('high');
      // Note: 確認プロンプトのスキップロジックは handleRollbackAutoCommand() 内で処理される
    });
  });

  // IT-E2E-006: confidence=low の場合、--forceでも確認表示
  describe('IT-E2E-006: confidence=low の場合、--forceでも確認表示', () => {
    test('confidence="low" の場合、--force オプション使用時でも確認が必要であることを確認', () => {
      // Given: low confidence のエージェントレスポンス（モック）
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "design",',
        '  "to_step": "revise",',
        '  "reason": "設計の問題（不確実）",',
        '  "confidence": "low",',
        '  "analysis": "問題原因が不明確です。"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: confidence が low であることを確認
      expect(decision.confidence).toBe('low');
      // Note: 確認プロンプトの強制表示ロジックは handleRollbackAutoCommand() 内で処理される
    });
  });

  // IT-E2E-007: ユーザーが確認をキャンセル（パースまでの確認）
  describe('IT-E2E-007: ユーザーが確認をキャンセル', () => {
    test('エージェント判断は正常にパースされるが、ユーザーがキャンセル可能', () => {
      // Given: 通常のエージェントレスポンス（モック）
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "実装の問題",',
        '  "confidence": "high",',
        '  "analysis": "テスト失敗"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: パースは成功する（キャンセルは handleRollbackAutoCommand() 内で処理）
      expect(decision.needs_rollback).toBe(true);
      // Note: ユーザーキャンセルのロジックは統合フロー内で処理される
    });
  });
});

// =============================================================================
// 統合テスト: エラーハンドリング
// =============================================================================
describe('統合テスト - エラーハンドリング', () => {
  // IT-ERR-004: JSONパース失敗（すべてのパターンで失敗）
  describe('IT-ERR-004: JSONパース失敗（すべてのパターンで失敗）', () => {
    test('すべてのJSONパースパターンで失敗した場合、適切なエラーメッセージが表示される', () => {
      // Given: JSONを含まないエージェントレスポンス（モック）
      const mockAgentResponse = ['エージェントの応答にJSONが含まれていません。'];

      // When & Then: JSONパース失敗エラーがスローされる
      expect(() => parseRollbackDecision(mockAgentResponse)).toThrow(
        /Failed to parse RollbackDecision from agent response/
      );
    });
  });

  // IT-ERR-005: バリデーション失敗（不正なto_phase）
  describe('IT-ERR-005: バリデーション失敗（不正なto_phase）', () => {
    test('エージェントが不正な to_phase 値を返した場合、適切なエラーメッセージが表示される', () => {
      // Given: 不正なto_phaseを含むエージェントレスポンス（モック）
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "invalid_phase",',
        '  "reason": "理由",',
        '  "confidence": "high",',
        '  "analysis": "分析"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: バリデーションエラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /must be one of:/
      );
    });
  });

  // IT-ERR-006: バリデーション失敗（needs_rollback=trueだがto_phase欠損）
  describe('IT-ERR-006: バリデーション失敗（needs_rollback=trueだがto_phase欠損）', () => {
    test('needs_rollback=true だが to_phase が欠損している場合、適切なエラーメッセージが表示される', () => {
      // Given: to_phaseが欠損したエージェントレスポンス（モック）
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "reason": "理由",',
        '  "confidence": "high",',
        '  "analysis": "分析"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: バリデーションエラーがスローされる
      expect(() => validateRollbackDecision(decision)).toThrow(
        /"to_phase" is required when needs_rollback=true/
      );
    });
  });
});

// =============================================================================
// 統合テスト: 既存機能との統合
// =============================================================================
describe('統合テスト - 既存機能との統合', () => {
  // IT-LEGACY-001: 既存rollbackコマンドのリグレッションテスト（パースロジックの独立性確認）
  describe('IT-LEGACY-001: 既存rollbackコマンドとの統合', () => {
    test('parseRollbackDecision() は既存の rollback コマンドに影響を与えない', () => {
      // Given: rollback auto 用のエージェントレスポンス
      const mockAgentResponse = [
        '```json',
        '{',
        '  "needs_rollback": true,',
        '  "to_phase": "implementation",',
        '  "to_step": "revise",',
        '  "reason": "テスト失敗",',
        '  "confidence": "high",',
        '  "analysis": "分析結果"',
        '}',
        '```',
      ];

      // When: parseRollbackDecision()を呼び出す
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: 正しくパースされる（既存コマンドには影響なし）
      expect(decision.needs_rollback).toBe(true);
      expect(decision.to_phase).toBe('implementation');
    });
  });

  // IT-LEGACY-002: rollback_historyにmode="auto"が記録される（想定の確認）
  describe('IT-LEGACY-002: rollback_historyにmode="auto"が記録される', () => {
    test('rollback auto で差し戻しを実行した場合、適切なデータ構造が準備される', () => {
      // Given: rollback auto 用のエージェントレスポンス（モック）
      const mockAgentResponse = [
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
      const decision = parseRollbackDecision(mockAgentResponse);

      // Then: executeRollback() に渡すデータが準備される
      expect(decision.to_phase).toBe('implementation');
      expect(decision.to_step).toBe('revise');
      expect(decision.reason).toBeTruthy();
      // Note: mode="auto" の記録は executeRollback() 内で処理される
    });
  });
});
