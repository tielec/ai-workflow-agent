/**
 * 統合テスト: Phase Template Refactoring (Issue #47)
 *
 * このテストは、BasePhase.executePhaseTemplate() メソッドが
 * 各フェーズで正しく動作することを検証します。
 */

import { MetadataManager } from '../../src/core/metadata-manager.js';
import { GitHubClient } from '../../src/core/github-client.js';
import { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import { RequirementsPhase } from '../../src/phases/requirements.js';
import { DesignPhase } from '../../src/phases/design.js';
import { ImplementationPhase } from '../../src/phases/implementation.js';
import { TestingPhase } from '../../src/phases/testing.js';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import { jest } from '@jest/globals';

// fs-extra のモック
jest.mock('fs-extra');

describe('Integration Test: Phase Template Refactoring (Issue #47)', () => {
  let mockMetadata: MetadataManager;
  let mockGithub: GitHubClient;
  let mockCodex: CodexAgentClient;
  const testWorkingDir = '/test/workspace';
  const testWorkflowDir = '/test/.ai-workflow/issue-47';

  beforeEach(() => {
    jest.clearAllMocks();

    // MetadataManager のモック
    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: {
        issue_number: '47',
        phases: {
          planning: { status: 'completed', output_file: `${testWorkflowDir}/00_planning/output/planning.md` },
          requirements: { status: 'pending', output_file: null },
          design: { status: 'pending', output_file: null },
        },
        design_decisions: {
          implementation_strategy: null,
          test_strategy: null,
          test_code_strategy: null,
        },
      },
      updatePhaseStatus: jest.fn(),
      getPhaseStatus: jest.fn().mockReturnValue('pending'),
      addCompletedStep: jest.fn(),
      getCompletedSteps: jest.fn().mockReturnValue([]),
      updateCurrentStep: jest.fn(),
      save: jest.fn(),
    } as any;

    // GitHubClient のモック
    mockGithub = {
      getIssueInfo: jest.fn().mockResolvedValue({
        number: 47,
        title: 'Refactor: Extract duplicated phase template pattern',
        state: 'open',
        url: 'https://github.com/test/repo/issues/47',
        labels: ['refactoring'],
        body: 'Issue body content',
      }),
      postComment: jest.fn().mockResolvedValue(undefined),
      createOrUpdateProgressComment: jest.fn().mockResolvedValue(undefined),
    } as any;

    // CodexAgentClient のモック
    mockCodex = {
      execute: jest.fn().mockResolvedValue([{ role: 'assistant', content: 'Agent response' }]),
      getWorkingDirectory: jest.fn().mockReturnValue(testWorkingDir),
    } as any;

    // fs-extra のデフォルトモック
    (fs.existsSync as any) = jest.fn().mockReturnValue(true);
    (fs.ensureDirSync as any) = jest.fn();
    (fs.readFileSync as any) = jest.fn().mockReturnValue('Mock file content');
    (fs.statSync as any) = jest.fn().mockReturnValue({ mtimeMs: 1000, size: 100 });
    (fs.lstatSync as any) = jest.fn().mockReturnValue({ isSymbolicLink: () => false });
  });

  // ========================================
  // IT-001: RequirementsPhase.execute() 正常実行
  // ========================================
  describe('IT-001: RequirementsPhase.execute() がテンプレートメソッドを使用して正常に実行される', () => {
    it('RequirementsPhase がリファクタリング後も正常に動作する', async () => {
      // Given: RequirementsPhase のインスタンス
      const phase = new RequirementsPhase({
        phaseName: 'requirements',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // loadPrompt() のモック
      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
        'Planning: {planning_document_path}\nIssue: {issue_info}\nNumber: {issue_number}'
      );

      // getPlanningDocumentReference() のモック
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue(
        '@.ai-workflow/issue-47/00_planning/output/planning.md'
      );

      // formatIssueInfo() のモック
      jest.spyOn(phase as any, 'formatIssueInfo').mockReturnValue('Issue #47: Refactor phase template');

      // executeWithAgent() のモック
      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      // 出力ファイルが生成されるようにモック
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', 'requirements.md');
      (fs.existsSync as any) = jest.fn((p: string) => p === outputFilePath);

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);

      // Then: エージェントが正しいプロンプトで実行される
      expect((phase as any).executeWithAgent).toHaveBeenCalledWith(
        expect.stringContaining('@.ai-workflow/issue-47/00_planning/output/planning.md'),
        { maxTurns: 30, verbose: undefined, logDir: undefined }
      );
    });
  });

  // ========================================
  // IT-002: DesignPhase.execute() 正常実行（設計決定抽出）
  // ========================================
  describe('IT-002: DesignPhase.execute() がテンプレートメソッドを使用し、設計決定抽出も正常に動作する', () => {
    it('DesignPhase がリファクタリング後も設計決定抽出ロジックを含めて正常に動作する', async () => {
      // Given: DesignPhase のインスタンス
      const phase = new DesignPhase({
        phaseName: 'design',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // loadPrompt() のモック
      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
        'Planning: {planning_document_path}\nRequirements: {requirements_document_path}\nIssue: {issue_info}\nNumber: {issue_number}'
      );

      // getPlanningDocumentReference() のモック
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue(
        '@.ai-workflow/issue-47/00_planning/output/planning.md'
      );

      // buildOptionalContext() のモック
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue(
        '@.ai-workflow/issue-47/01_requirements/output/requirements.md'
      );

      // formatIssueInfo() のモック
      jest.spyOn(phase as any, 'formatIssueInfo').mockReturnValue('Issue #47: Refactor phase template');

      // executeWithAgent() のモック
      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      // 設計書の内容をモック（設計決定を含む）
      const designContent = `
# 設計書

## 実装戦略: REFACTOR
## テスト戦略: UNIT_INTEGRATION
## テストコード戦略: CREATE_TEST
`;
      (fs.readFileSync as any) = jest.fn().mockReturnValue(designContent);

      // contentParser.extractDesignDecisions() のモック
      jest.spyOn((phase as any).contentParser, 'extractDesignDecisions').mockResolvedValue({
        implementation_strategy: 'REFACTOR',
        test_strategy: 'UNIT_INTEGRATION',
        test_code_strategy: 'CREATE_TEST',
      });

      // 出力ファイルが生成されるようにモック
      const outputFilePath = path.join(testWorkflowDir, '02_design', 'output', 'design.md');
      (fs.existsSync as any) = jest.fn((p: string) => p === outputFilePath);

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);

      // Then: 設計決定が抽出される
      expect((phase as any).contentParser.extractDesignDecisions).toHaveBeenCalledWith(designContent);

      // Then: メタデータが更新される
      expect(mockMetadata.save).toHaveBeenCalled();
    });

    it('設計決定が既に存在する場合、再抽出されない', async () => {
      // Given: 設計決定が既に存在する
      mockMetadata.data.design_decisions.implementation_strategy = 'REFACTOR';

      const phase = new DesignPhase({
        phaseName: 'design',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // モック設定（前のテストと同様）
      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Test prompt');
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('@requirements.md');
      jest.spyOn(phase as any, 'formatIssueInfo').mockReturnValue('Issue #47');
      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      const outputFilePath = path.join(testWorkflowDir, '02_design', 'output', 'design.md');
      (fs.existsSync as any) = jest.fn((p: string) => p === outputFilePath);

      jest.spyOn((phase as any).contentParser, 'extractDesignDecisions').mockResolvedValue({});

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);

      // Then: 設計決定抽出がスキップされる
      expect((phase as any).contentParser.extractDesignDecisions).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // IT-003: ImplementationPhase.execute() オプショナルコンテキスト
  // ========================================
  describe('IT-003: ImplementationPhase.execute() がオプショナルコンテキストを構築してテンプレートメソッドを使用する', () => {
    it('オプショナルコンテキストがフォールバックメッセージになる', async () => {
      // Given: 要件定義書・設計書・テストシナリオが存在しない
      mockMetadata.data.phases = {
        planning: { status: 'completed', output_file: `${testWorkflowDir}/00_planning/output/planning.md` },
        requirements: { status: 'pending', output_file: null },
        design: { status: 'pending', output_file: null },
        test_scenario: { status: 'pending', output_file: null },
      };

      const phase = new ImplementationPhase({
        phaseName: 'implementation',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // loadPrompt() のモック
      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
        'Planning: {planning_document_path}\nRequirements: {requirements_context}\nDesign: {design_context}\nTest Scenario: {test_scenario_context}\nStrategy: {implementation_strategy}\nStandards: {coding_standards}\nNumber: {issue_number}'
      );

      // getPlanningDocumentReference() のモック
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');

      // buildOptionalContext() のモック（フォールバックメッセージを返す）
      jest.spyOn(phase as any, 'buildOptionalContext').mockImplementation((phaseName: string) => {
        const fallbacks: Record<string, string> = {
          requirements: '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。',
          design: '設計書は利用できません。Issue情報とPlanning情報に基づいて適切な設計判断を行ってください。',
          test_scenario: 'テストシナリオは利用できません。実装時に適切なテスト考慮を行ってください。',
        };
        return fallbacks[phaseName] || 'Fallback';
      });

      // executeWithAgent() のモック
      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      // 出力ファイルが生成されるようにモック
      const outputFilePath = path.join(testWorkflowDir, '04_implementation', 'output', 'implementation.md');
      (fs.existsSync as any) = jest.fn((p: string) => p === outputFilePath);

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);

      // Then: フォールバックメッセージが使用される
      expect((phase as any).executeWithAgent).toHaveBeenCalledWith(
        expect.stringContaining('要件定義書は利用できません'),
        expect.objectContaining({ maxTurns: 80 })
      );
    });
  });

  // ========================================
  // IT-004: TestingPhase.execute() ファイル更新チェック
  // ========================================
  describe('IT-004: TestingPhase.execute() がファイル更新チェックを含めてテンプレートメソッドを使用する', () => {
    it('テスト実行後にファイルが更新されたことを確認する', async () => {
      // Given: TestingPhase のインスタンス
      const phase = new TestingPhase({
        phaseName: 'testing',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // loadPrompt() のモック
      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Test prompt');

      // getPlanningDocumentReference() のモック
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');

      // buildOptionalContext() のモック
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('Context');

      // executeWithAgent() のモック
      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      // 出力ファイルのパス
      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');

      // ファイル更新チェック: 実行前と実行後で mtime が変化
      let callCount = 0;
      (fs.existsSync as any) = jest.fn((p: string) => p === outputFilePath);
      (fs.statSync as any) = jest.fn((p: string) => {
        if (p === outputFilePath) {
          callCount++;
          return callCount <= 2
            ? { mtimeMs: 1000, size: 100 } // 実行前
            : { mtimeMs: 2000, size: 200 }; // 実行後（更新された）
        }
        return { mtimeMs: 0, size: 0 };
      });

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });

    it('ファイルが更新されない場合、エラーを返す', async () => {
      // Given: TestingPhase のインスタンス
      const phase = new TestingPhase({
        phaseName: 'testing',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // モック設定（前のテストと同様）
      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Test prompt');
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('Context');
      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');

      // ファイル更新チェック: mtime と size が変化しない
      (fs.existsSync as any) = jest.fn((p: string) => p === outputFilePath);
      (fs.statSync as any) = jest.fn((p: string) => {
        if (p === outputFilePath) {
          return { mtimeMs: 1000, size: 100 }; // 常に同じ値
        }
        return { mtimeMs: 0, size: 0 };
      });

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: エラーが返される
      expect(result.success).toBe(false);
      expect(result.error).toContain('test-result.md が更新されていません');
    });
  });

  // ========================================
  // IT-005: 既存フローの回帰テスト
  // ========================================
  describe('IT-005: 既存フローの回帰テスト（execute → review → revise）', () => {
    it('RequirementsPhase で execute → review フローが正常に動作する', async () => {
      // Given: RequirementsPhase のインスタンス
      const phase = new RequirementsPhase({
        phaseName: 'requirements',
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      // execute() のモック
      jest.spyOn(phase as any, 'execute').mockResolvedValue({
        success: true,
        output: '/path/to/requirements.md',
      });

      // review() のモック
      jest.spyOn(phase as any, 'review').mockResolvedValue({
        success: true,
        output: 'PASS',
      });

      // When: run() を実行
      const result = await phase.run({ skipReview: false });

      // Then: 成功が返される
      expect(result).toBe(true);

      // Then: execute() と review() が呼び出される
      expect((phase as any).execute).toHaveBeenCalled();
      expect((phase as any).review).toHaveBeenCalled();
    });
  });
});
