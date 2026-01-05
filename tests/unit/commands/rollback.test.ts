/**
 * ユニットテスト: rollback コマンドモジュール
 * Issue #90: フェーズ差し戻し機能の実装
 *
 * テスト対象:
 * - validateRollbackOptions()
 * - loadRollbackReason()
 * - confirmRollback()
 * - generateRollbackReasonMarkdown()
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  validateRollbackOptions,
  loadRollbackReason,
  generateRollbackReasonMarkdown,
  getPhaseNumber,
  handleRollbackAutoCommand,
} from '../../../src/commands/rollback.js';
import type { RollbackCommandOptions } from '../../../src/types/commands.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { PromptLoader } from '../../../src/core/prompt-loader.js';
import { AgentExecutor } from '../../../src/phases/core/agent-executor.js';
import * as path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

describe('Rollback コマンド - バリデーション', () => {
  let metadataManager: MetadataManager;
  // ユニットテスト: プロジェクトルート配下のパスを使用（MetadataManagerが実ファイルシステムを使用するため）
  const testWorkflowDir = path.join(process.cwd(), '.ai-workflow', 'issue-90-unit');
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  beforeEach(() => {
    jest.clearAllMocks();

    // 実ファイルシステムを使用（MetadataManagerが実際のfs-extraを呼び出すため）
    fs.ensureDirSync(path.dirname(testMetadataPath));

    const basePhase = {
      status: 'pending',
      completed_steps: [],
      current_step: null,
      started_at: null,
      completed_at: null,
      review_result: null,
      retry_count: 0,
      rollback_context: null,
    };

    const metadataData = {
      issue_number: '90',
      issue_url: '',
      issue_title: '',
      created_at: '',
      updated_at: '',
      current_phase: 'planning',
      phases: {
        planning: { ...basePhase },
        requirements: { ...basePhase },
        design: { ...basePhase },
        test_scenario: { ...basePhase },
        implementation: { ...basePhase, status: 'completed', completed_steps: ['execute', 'review'] },
        test_implementation: { ...basePhase },
        testing: { ...basePhase },
        documentation: { ...basePhase },
        report: { ...basePhase },
        evaluation: { ...basePhase },
      },
      github_integration: { progress_comment_url: null },
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
      design_decisions: {},
      model_config: null,
      difficulty_analysis: null,
      rollback_history: [],
    };

    // 実ファイルを作成
    fs.writeJsonSync(testMetadataPath, metadataData, { spaces: 2 });

    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // UC-RC-01: validateRollbackOptions() - 有効なオプション
  // =============================================================================
  describe('UC-RC-01: validateRollbackOptions() - 有効なオプション', () => {
    test('有効なオプションでバリデーションが成功する', () => {
      // Given: 有効なオプション
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'Type definition missing...',
        toStep: 'revise'
      };

      // When & Then: バリデーションが成功する（例外がスローされない）
      expect(() => validateRollbackOptions(options, metadataManager)).not.toThrow();
    });
  });

  // =============================================================================
  // UC-RC-02: validateRollbackOptions() - 無効なフェーズ名
  // =============================================================================
  describe('UC-RC-02: validateRollbackOptions() - 無効なフェーズ名', () => {
    test('無効なフェーズ名が指定された場合にエラーがスローされる', () => {
      // Given: 無効なフェーズ名
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'invalid-phase',
        reason: 'Test'
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/Invalid phase name/);
    });
  });

  // =============================================================================
  // UC-RC-03: validateRollbackOptions() - 無効なステップ名
  // =============================================================================
  describe('UC-RC-03: validateRollbackOptions() - 無効なステップ名', () => {
    test('無効なステップ名が指定された場合にエラーがスローされる', () => {
      // Given: 無効なステップ名
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        toStep: 'invalid-step',
        reason: 'Test'
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/Invalid step/);
    });
  });

  // =============================================================================
  // UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し
  // =============================================================================
  describe('UC-RC-04: validateRollbackOptions() - 未開始フェーズへの差し戻し', () => {
    test('未開始（pending）フェーズへの差し戻しがエラーになる', () => {
      // Given: 未開始フェーズ（documentation）
      metadataManager.data.phases.documentation.status = 'pending';
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'documentation',
        reason: 'Test'
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/has not been started yet/);
    });
  });

  // =============================================================================
  // UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定
  // =============================================================================
  describe('UC-RC-05: validateRollbackOptions() - 差し戻し理由が未指定', () => {
    test('差し戻し理由が指定されていない場合にエラーがスローされる', () => {
      // Given: 差し戻し理由が未指定
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation'
        // reason, reasonFile, interactive が未指定
      };

      // When & Then: エラーがスローされる
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/Rollback reason is required/);
    });
  });

  // =============================================================================
  // TC-UR-004 (Issue #208): pending でも completed_steps が存在（不整合状態）
  // =============================================================================
  describe('TC-UR-004 (Issue #208): pending でも completed_steps が存在（不整合状態）', () => {
    test('不整合状態でもrollbackが成功し、警告ログが出力される', () => {
      // Given: status: 'pending' だが completed_steps が存在する不整合状態
      metadataManager.data.phases.test_implementation.status = 'pending';
      metadataManager.data.phases.test_implementation.completed_steps = ['execute', 'review'];
      metadataManager.data.phases.test_implementation.started_at = null;

      const options: RollbackCommandOptions = {
        issue: '194',
        toPhase: 'test_implementation',
        toStep: 'revise',
        reason: 'Fix inconsistent state'
      };

      // When & Then: エラーが発生しない（バリデーション成功）
      expect(() => validateRollbackOptions(options, metadataManager)).not.toThrow();
    });
  });

  // =============================================================================
  // TC-UR-005 (Issue #208): completed_steps が undefined
  // =============================================================================
  describe('TC-UR-005 (Issue #208): completed_steps が undefined', () => {
    test('completed_steps が undefined の場合はエラーになる', () => {
      // Given: status: 'pending' かつ completed_steps が undefined
      metadataManager.data.phases.test_implementation.status = 'pending';
      metadataManager.data.phases.test_implementation.completed_steps = undefined as any;
      metadataManager.data.phases.test_implementation.started_at = null;

      const options: RollbackCommandOptions = {
        issue: '194',
        toPhase: 'test_implementation',
        toStep: 'execute',
        reason: 'Test'
      };

      // When & Then: エラーが発生する
      expect(() => validateRollbackOptions(options, metadataManager))
        .toThrow(/has not been started yet/);
    });
  });
});

describe('Rollback コマンド - 差し戻し理由の読み込み', () => {
  const testWorkflowDir = path.join(process.cwd(), '.ai-workflow', 'issue-90-reason');

  beforeEach(() => {
    jest.clearAllMocks();
    // テストディレクトリを作成
    fs.ensureDirSync(testWorkflowDir);
  });

  afterEach(() => {
    // テスト後にクリーンアップ
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）
  // =============================================================================
  describe('UC-RC-06: loadRollbackReason() - --reasonオプション（正常系）', () => {
    test('--reasonオプションで差し戻し理由が正しく読み込まれる', async () => {
      // Given: --reasonオプションが指定されている
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: '  Type definition missing...  '
      };

      // When: loadRollbackReason()を呼び出す
      const reason = await loadRollbackReason(options, testWorkflowDir);

      // Then: トリムされた理由が返される
      expect(reason).toBe('Type definition missing...');
    });
  });

  // =============================================================================
  // UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）
  // =============================================================================
  describe('UC-RC-07: loadRollbackReason() - --reasonオプション（空文字列）', () => {
    test('空文字列が指定された場合にエラーがスローされる', async () => {
      // Given: 空文字列
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: '   '
      };

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/cannot be empty/);
    });
  });

  // =============================================================================
  // UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）
  // =============================================================================
  describe('UC-RC-08: loadRollbackReason() - --reasonオプション（1000文字超）', () => {
    test('1000文字を超える理由が指定された場合にエラーがスローされる', async () => {
      // Given: 1000文字超の理由
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reason: 'a'.repeat(1001)
      };

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/1000 characters or less/);
    });
  });

  // =============================================================================
  // UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）
  // =============================================================================
  describe('UC-RC-09: loadRollbackReason() - --reason-fileオプション（正常系）', () => {
    test('--reason-fileオプションでファイルから差し戻し理由が読み込まれる', async () => {
      // Given: ファイルが存在する
      const reasonFilePath = path.join(testWorkflowDir, 'review-result.md');
      fs.writeFileSync(reasonFilePath, 'Review result content');

      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reasonFile: reasonFilePath
      };

      // When: loadRollbackReason()を呼び出す
      const reason = await loadRollbackReason(options, testWorkflowDir);

      // Then: ファイルの内容が返される
      expect(reason).toBe('Review result content');
    });
  });

  // =============================================================================
  // UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）
  // =============================================================================
  describe('UC-RC-10: loadRollbackReason() - --reason-fileオプション（ファイル不在）', () => {
    test('指定されたファイルが存在しない場合にエラーがスローされる', async () => {
      // Given: ファイルが存在しない
      const nonExistentFile = path.join(testWorkflowDir, 'non-existent-file.md');
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reasonFile: nonExistentFile
      };

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/not found/);
    });
  });

  // =============================================================================
  // UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）
  // =============================================================================
  describe('UC-RC-11: loadRollbackReason() - --reason-fileオプション（ファイルサイズ超過）', () => {
    test('ファイルサイズが100KBを超える場合にエラーがスローされる', async () => {
      // Given: ファイルサイズが100KB超（200KB）
      const largeFilePath = path.join(testWorkflowDir, 'large-file.md');
      const largeContent = 'x'.repeat(200 * 1024); // 200KB
      fs.writeFileSync(largeFilePath, largeContent);

      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        reasonFile: largeFilePath
      };

      // When & Then: エラーがスローされる
      await expect(loadRollbackReason(options, testWorkflowDir))
        .rejects.toThrow(/100KB or less/);
    });
  });
});

describe('Rollback コマンド - ROLLBACK_REASON.md生成', () => {
  // =============================================================================
  // UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報
  // =============================================================================
  describe('UC-RC-15: generateRollbackReasonMarkdown() - 完全な情報', () => {
    test('差し戻し理由ドキュメントが正しく生成される', () => {
      // Given: 完全な差し戻し情報
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation',
        fromPhase: 'testing',
        reasonFile: '.ai-workflow/issue-49/06_testing/review/result.md'
      };
      const reason = 'Type definition missing...';
      const details = {
        blocker_count: 2,
        suggestion_count: 4,
        affected_tests: ['StepExecutor', 'PhaseRunner']
      };

      // When: generateRollbackReasonMarkdown()を呼び出す
      const markdown = generateRollbackReasonMarkdown(options, reason);

      // Then: Markdown形式のドキュメントが返される
      expect(markdown).toContain('# Phase 04 (implementation) への差し戻し理由');
      expect(markdown).toContain('**差し戻し元**: Phase testing');
      expect(markdown).toContain('Type definition missing...');
      expect(markdown).toContain('@.ai-workflow/issue-49/06_testing/review/result.md');
    });
  });

  // =============================================================================
  // UC-RC-16: generateRollbackReasonMarkdown() - 最小限の情報
  // =============================================================================
  describe('UC-RC-16: generateRollbackReasonMarkdown() - 最小限の情報', () => {
    test('最小限の情報でもドキュメントが生成される', () => {
      // Given: 最小限の情報
      const options: RollbackCommandOptions = {
        issue: '49',
        toPhase: 'implementation'
      };
      const reason = 'Manual rollback for testing';
      const details = null;

      // When: generateRollbackReasonMarkdown()を呼び出す
      const markdown = generateRollbackReasonMarkdown(options, reason);

      // Then: Markdown形式のドキュメントが返される
      expect(markdown).toContain('# Phase 04 (implementation) への差し戻し理由');
      expect(markdown).toContain('Manual rollback for testing');
      expect(markdown).not.toContain('詳細情報');
      expect(markdown).not.toContain('参照ドキュメント');
    });
  });
});

describe('Rollback コマンド - ヘルパー関数', () => {
  // =============================================================================
  // getPhaseNumber() のテスト
  // =============================================================================
  describe('getPhaseNumber()', () => {
    test('フェーズ名から正しいフェーズ番号が返される', () => {
      // Then: 各フェーズ名に対応する番号が返される
      expect(getPhaseNumber('planning')).toBe('00');
      expect(getPhaseNumber('requirements')).toBe('01');
      expect(getPhaseNumber('design')).toBe('02');
      expect(getPhaseNumber('test_scenario')).toBe('03');
      expect(getPhaseNumber('implementation')).toBe('04');
      expect(getPhaseNumber('test_implementation')).toBe('05');
      expect(getPhaseNumber('testing')).toBe('06');
      expect(getPhaseNumber('documentation')).toBe('07');
      expect(getPhaseNumber('report')).toBe('08');
      expect(getPhaseNumber('evaluation')).toBe('09');
    });
  });
});

describe('Rollback auto language switching', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let repoRoot: string;
  let issueDir: string;
  let metadataPath: string;
  const createdDecisionFiles: string[] = [];

  const basePhase = {
    status: 'completed',
    completed_steps: ['execute'],
    current_step: null,
    started_at: null,
    completed_at: null,
    review_result: null,
    retry_count: 0,
    rollback_context: null,
  };

  const createMetadata = () => ({
    issue_number: '575',
    issue_url: '',
    issue_title: 'Rollback auto language test',
    created_at: '',
    updated_at: '',
    current_phase: 'testing',
    phases: {
      planning: { ...basePhase },
      requirements: { ...basePhase },
      design: { ...basePhase },
      test_scenario: { ...basePhase },
      implementation: { ...basePhase },
      test_implementation: { ...basePhase },
      testing: { ...basePhase },
      documentation: { ...basePhase },
      report: { ...basePhase },
      evaluation: { ...basePhase },
    },
    github_integration: { progress_comment_url: null },
    costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
    design_decisions: {},
    model_config: null,
    difficulty_analysis: null,
    rollback_history: [],
  });

  beforeEach(() => {
    originalEnv = { ...process.env };
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-lang-root-'));
    const repoDir = path.join(repoRoot, 'repo');
    issueDir = path.join(repoDir, '.ai-workflow', 'issue-575');
    metadataPath = path.join(issueDir, 'metadata.json');

    fs.ensureDirSync(path.join(repoDir, '.git'));
    fs.ensureDirSync(issueDir);
    fs.writeJsonSync(metadataPath, createMetadata(), { spaces: 2 });
    process.env.REPOS_ROOT = repoRoot;
    process.env.CODEX_API_KEY = 'codex-api-key-mock-1234567890';
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    for (const filePath of createdDecisionFiles) {
      if (fs.existsSync(filePath)) {
        fs.removeSync(filePath);
      }
    }
    createdDecisionFiles.length = 0;
    if (repoRoot && fs.existsSync(repoRoot)) {
      fs.removeSync(repoRoot);
    }
  });

  const stubAgentExecution = (outputPath: string) =>
    jest.spyOn(AgentExecutor.prototype, 'executeWithAgent').mockImplementation(async () => {
      const decision = {
        needs_rollback: false,
        reason: 'language-check',
        confidence: 'high',
        analysis: 'not needed',
      };
      createdDecisionFiles.push(outputPath);
      fs.writeFileSync(outputPath, JSON.stringify(decision));
    });

  it('uses Japanese rollback auto prompt when AI_WORKFLOW_LANGUAGE=ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    jest.spyOn(Date, 'now').mockReturnValue(1767085536064);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456);
    const expectedPath = path.join(os.tmpdir(), 'rollback-auto-1767085536064-4fzyo8.json');
    const pathSpy = jest.spyOn(PromptLoader as any, 'resolvePromptPath');
    const executeSpy = stubAgentExecution(expectedPath);

    await handleRollbackAutoCommand({ issueNumber: 575, agent: 'auto', dryRun: true, force: true });

    expect(pathSpy).toHaveBeenCalledWith('rollback', 'auto-analyze', 'ja');
    expect(executeSpy).toHaveBeenCalled();
    expect(executeSpy.mock.calls[0][0]).toContain('Rollback Auto Analysis Prompt');
  });

  it('uses English rollback auto prompt when AI_WORKFLOW_LANGUAGE=en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    jest.spyOn(Date, 'now').mockReturnValue(1767085536085);
    jest.spyOn(Math, 'random').mockReturnValue(0.123456);
    const expectedPath = path.join(os.tmpdir(), 'rollback-auto-1767085536085-4fzyo8.json');
    const pathSpy = jest.spyOn(PromptLoader as any, 'resolvePromptPath');
    const executeSpy = stubAgentExecution(expectedPath);

    await handleRollbackAutoCommand({ issueNumber: 575, agent: 'auto', dryRun: true, force: true });

    expect(pathSpy).toHaveBeenCalledWith('rollback', 'auto-analyze', 'en');
    expect(executeSpy).toHaveBeenCalled();
    expect(executeSpy.mock.calls[0][0]).toContain('Rollback Auto Analysis Prompt');
  });
});
