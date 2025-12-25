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
import fs from 'fs-extra';
import * as path from 'node:path';
import { jest } from '@jest/globals';

describe('Integration Test: Phase Template Refactoring (Issue #47)', () => {
  let mockMetadata: MetadataManager;
  let mockGithub: GitHubClient;
  let mockCodex: CodexAgentClient;
  const testWorkingDir = path.join(process.cwd(), 'tmp', 'workspace');
  const testWorkflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-47');

  beforeEach(() => {
    jest.clearAllMocks();

    // 書き込み可能なテストワークスペースを確保
    fs.rmSync(testWorkingDir, { recursive: true, force: true });
    fs.mkdirSync(testWorkingDir, { recursive: true });

    // MetadataManager のモック
    const basePhaseMetadata = () => ({
      status: 'pending',
      retry_count: 0,
      started_at: null,
      completed_at: null,
      review_result: null,
      output_files: [],
      current_step: null,
      completed_steps: [] as string[],
      rollback_context: null,
    });

    const phaseEntries = {
      planning: { ...basePhaseMetadata(), status: 'completed', output_files: [path.join(testWorkflowDir, '00_planning', 'output', 'planning.md')] },
      requirements: basePhaseMetadata(),
      design: basePhaseMetadata(),
      implementation: basePhaseMetadata(),
      test_implementation: basePhaseMetadata(),
      testing: basePhaseMetadata(),
    };

    const metadataData = {
      issue_number: '47',
      phases: phaseEntries,
      design_decisions: {
        implementation_strategy: null,
        test_strategy: null,
        test_code_strategy: null,
      },
    };

    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: metadataData,
      updatePhaseStatus: jest.fn(),
      getPhaseStatus: jest.fn().mockReturnValue('pending'),
      addCompletedStep: jest.fn((phase: string, step: string) => {
        const phaseData = metadataData.phases[phase];
        if (phaseData && !phaseData.completed_steps.includes(step)) {
          phaseData.completed_steps.push(step);
        }
      }),
      getCompletedSteps: jest.fn((phase: string) => {
        const phaseData = metadataData.phases[phase];
        return phaseData?.completed_steps ?? [];
      }),
      updateCurrentStep: jest.fn(),
      save: jest.fn(),
      incrementRetryCount: jest.fn((phase: string) => {
        const phaseData = metadataData.phases[phase];
        if (!phaseData) {
          return 1;
        }
        phaseData.retry_count = (phaseData.retry_count ?? 0) + 1;
        return phaseData.retry_count;
      }),
      getRollbackContext: jest.fn().mockReturnValue(null),
      clearRollbackContext: jest.fn(),
      getCurrentStep: jest.fn().mockReturnValue(null),
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

  });

  // ========================================
  // IT-005: TestingPhase.revise() で test-result.md の更新チェックを検証
  // ========================================
  describe('IT-005: TestingPhase.revise() で test-result.md の更新を検証する', () => {
    it('revise が test-result.md を更新した場合、success を返す', async () => {
      const phase = new TestingPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Revise {review_feedback}');
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('Context');
      jest.spyOn(phase as any, 'getAgentFileReference').mockReturnValue('@.ai-workflow/issue-47/06_testing/output/test-result.md');

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, 'initial', 'utf-8');

      const executeWithAgentSpy = jest.spyOn(phase as any, 'executeWithAgent').mockImplementation(async () => {
        fs.writeFileSync(outputFilePath, 'updated result', 'utf-8');
        return [];
      });

      const reviewFeedback = 'Revise test results with clear updates';
      const result = await (phase as any).revise(reviewFeedback);

      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
      expect(executeWithAgentSpy).toHaveBeenCalledWith(
        expect.stringContaining(reviewFeedback),
        expect.objectContaining({ maxTurns: 80, logDir: expect.any(String) })
      );
      expect((phase as any).getAgentFileReference).toHaveBeenCalledWith(outputFilePath);
    });

    it('revise で test-result.md が更新されないとエラーになる', async () => {
      const phase = new TestingPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Revise {review_feedback}');
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('Context');
      jest.spyOn(phase as any, 'getAgentFileReference').mockReturnValue('@.ai-workflow/issue-47/06_testing/output/test-result.md');

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, 'initial', 'utf-8');

      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);

      const result = await (phase as any).revise('Keep test result unchanged');

      expect(result.success).toBe(false);
      expect(result.error).toContain('test-result.md が更新されていません');
    });
  });

  // ========================================
  // IT-001: RequirementsPhase.execute() 正常実行
  // ========================================
  describe('IT-001: RequirementsPhase.execute() がテンプレートメソッドを使用して正常に実行される', () => {
    it('RequirementsPhase がリファクタリング後も正常に動作する', async () => {
      // Given: RequirementsPhase のインスタンス
      const phase = new RequirementsPhase({
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
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', 'requirements.md');
      const executeWithAgentSpy = jest.spyOn(phase as any, 'executeWithAgent').mockImplementation(async () => {
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
        fs.writeFileSync(outputFilePath, 'requirements output', 'utf-8');
        return [];
      });

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);

      // Then: エージェントが正しいプロンプトで実行される
      expect(executeWithAgentSpy).toHaveBeenCalledWith(
        expect.stringContaining('@.ai-workflow/issue-47/00_planning/output/planning.md'),
        expect.objectContaining({ maxTurns: 30 })
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

      // 設計書の内容をモック（設計決定を含む）
      const designContent = `
# 設計書

## 実装戦略: REFACTOR
## テスト戦略: UNIT_INTEGRATION
## テストコード戦略: CREATE_TEST
`;
      const outputFilePath = path.join(testWorkflowDir, '02_design', 'output', 'design.md');
      const executeWithAgentSpy = jest.spyOn(phase as any, 'executeWithAgent').mockImplementation(async () => {
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
        fs.writeFileSync(outputFilePath, designContent, 'utf-8');
        return [];
      });

      // contentParser.extractDesignDecisions() のモック
      jest.spyOn((phase as any).contentParser, 'extractDesignDecisions').mockResolvedValue({
        implementation_strategy: 'REFACTOR',
        test_strategy: 'UNIT_INTEGRATION',
        test_code_strategy: 'CREATE_TEST',
      });

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
      const designContent = `
# 設計書

## 実装戦略: REFACTOR
## テスト戦略: UNIT_INTEGRATION
## テストコード戦略: CREATE_TEST
`;
      const outputFilePath = path.join(testWorkflowDir, '02_design', 'output', 'design.md');
      jest.spyOn(phase as any, 'executeWithAgent').mockImplementation(async () => {
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
        fs.writeFileSync(outputFilePath, designContent, 'utf-8');
        return [];
      });

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
        planning: { status: 'completed', output_files: [`${testWorkflowDir}/00_planning/output/planning.md`] },
        requirements: { status: 'pending', output_files: [] },
        design: { status: 'pending', output_files: [] },
        test_scenario: { status: 'pending', output_files: [] },
      };

      const phase = new ImplementationPhase({
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
      jest.spyOn(phase as any, 'buildOptionalContext').mockImplementation((phaseName: any) => {
        const fallbacks: Record<string, string> = {
          requirements: '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。',
          design: '設計書は利用できません。Issue情報とPlanning情報に基づいて適切な設計判断を行ってください。',
          test_scenario: 'テストシナリオは利用できません。実装時に適切なテスト考慮を行ってください。',
        };
        return fallbacks[phaseName] || 'Fallback';
      });

      const outputFilePath = path.join(testWorkflowDir, '04_implementation', 'output', 'implementation.md');
      const executeWithAgentSpy = jest.spyOn(phase as any, 'executeWithAgent').mockImplementation(async () => {
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
        fs.writeFileSync(outputFilePath, 'implementation result', 'utf-8');
        return [];
      });

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);

      // Then: フォールバックメッセージが使用される
      expect((phase as any).executeWithAgent).toHaveBeenCalledWith(
        expect.stringContaining('要件定義書は利用できません'),
        expect.objectContaining({ maxTurns: 100 })
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

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, 'initial test result', 'utf-8');
      jest.spyOn(phase as any, 'executePhaseTemplate').mockImplementation(async () => {
        fs.writeFileSync(outputFilePath, 'updated test result version 2', 'utf-8');
        return { success: true, output: outputFilePath };
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
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Test prompt');
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('Context');

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, 'initial test result', 'utf-8');
      jest.spyOn(phase as any, 'executePhaseTemplate').mockResolvedValue({
        success: true,
        output: outputFilePath,
      });

      // When: execute() を実行
      const result = await (phase as any).execute();

      // Then: エラーが返される
      expect(result.success).toBe(false);
      expect(result.error).toContain('test-result.md が更新されていません');
    });
  });

  // ========================================
  // IT-006: 既存フローの回帰テスト
  // ========================================
  describe('IT-006: 既存フローの回帰テスト（execute → review → revise）', () => {
    it('RequirementsPhase で execute → review フローが正常に動作する', async () => {
      // Given: RequirementsPhase のインスタンス
      const phase = new RequirementsPhase({
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

  // ========================================
  // IT-007: TestingPhase.revise プロンプトの矛盾解消と必須タスクの強調（シナリオ2/3）
  // ========================================
  describe('IT-007: TestingPhase.revise prompt aims for clarity and required tasks', () => {
    it('does not mix append instructions or leave out mandatory updates', () => {
      const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
      const promptPath = path.join('src', 'prompts', 'testing', 'revise.txt');
      const promptText = realFs.readFileSync(promptPath, 'utf-8');

      expect(promptText).toContain('⚠️ 必須タスク');
      expect(promptText).toContain('⚠️ 最重要: 必須ファイル更新');
      expect(promptText).toContain('Write ツール');
      expect(promptText).not.toContain('追記してください');

      const overwriteMentions = promptText.match(/上書き保存/g) ?? [];
      expect(overwriteMentions.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ========================================
  // IT-008: 他フェーズの revise プロンプトにも同様の必須更新指示（シナリオ4/5）
  // ========================================
  describe('IT-008: Revise prompts for test implementation and implementation phases keep mandatory updates', () => {
    it('requires the test implementation log to be overwritten', () => {
      const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
      const promptPath = path.join('src', 'prompts', 'test_implementation', 'revise.txt');
      const promptText = realFs.readFileSync(promptPath, 'utf-8');

      expect(promptText).toContain('⚠️ 必須タスク');
      expect(promptText).toContain('test-implementation.md');
      expect(promptText).toContain('⚠️ 最重要: テスト実装ログの上書き');
      expect(promptText).toMatch(/Write|Edit/);
    });

    it('requires the implementation log to be overwritten', () => {
      const realFs = jest.requireActual<typeof import('node:fs')>('node:fs');
      const promptPath = path.join('src', 'prompts', 'implementation', 'revise.txt');
      const promptText = realFs.readFileSync(promptPath, 'utf-8');

      expect(promptText).toContain('⚠️ 必須タスク');
      expect(promptText).toContain('implementation.md');
      expect(promptText).toContain('⚠️ 最重要: 実装ログの上書き');
      expect(promptText).toMatch(/Write|Edit/);
    });
  });

  // ========================================
  // IT-009: 必須タスク明示化の効果確認（シナリオ3）
  // ========================================
  describe('IT-009: Mandatory task enforcement effectiveness verification', () => {
    it('ensures TestingPhase.revise consistently executes file update tasks', async () => {
      // 複数回の実行でファイル更新タスクが100%実行されることを検証
      const phase = new TestingPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      jest.spyOn(phase as any, 'loadPrompt').mockReturnValue('Revise {review_feedback}');
      jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning.md');
      jest.spyOn(phase as any, 'buildOptionalContext').mockReturnValue('Context');
      jest.spyOn(phase as any, 'getAgentFileReference').mockReturnValue('@.ai-workflow/issue-47/06_testing/output/test-result.md');

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });

      let updateCount = 0;
      const executeWithAgentSpy = jest.spyOn(phase as any, 'executeWithAgent').mockImplementation(async () => {
        // 必須タスクが毎回実行されることをシミュレート
        fs.writeFileSync(outputFilePath, `updated result ${++updateCount}`, 'utf-8');
        return [];
      });

      // 3回の実行で毎回ファイル更新が実行されることを確認
      for (let i = 0; i < 3; i++) {
        fs.writeFileSync(outputFilePath, `initial ${i}`, 'utf-8');
        const result = await (phase as any).revise(`Review feedback ${i}`);

        expect(result.success).toBe(true);
        expect(result.output).toBe(outputFilePath);
        expect(fs.readFileSync(outputFilePath, 'utf-8')).toBe(`updated result ${i + 1}`);
      }

      // Write/Edit ツールの使用が3回実行されたことを確認
      expect(executeWithAgentSpy).toHaveBeenCalledTimes(3);
    });
  });

  // ========================================
  // IT-010: TestingPhase のワークフロー回帰・E2Eテスト（シナリオ6/7）
  // ========================================
  describe('IT-010: TestingPhase workflow regression safeguards and E2E integration', () => {
    it('executes revise when review initially fails and then passes', async () => {
      const phase = new TestingPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, 'initial', 'utf-8');

      const executeSpy = jest.spyOn(phase as any, 'execute').mockResolvedValue({
        success: true,
        output: outputFilePath,
      });
      const reviewSpy = jest
        .spyOn(phase as any, 'review')
        .mockResolvedValueOnce({ success: false, error: 'initial review failed' })
        .mockResolvedValueOnce({ success: true, output: 'PASS' });
      const reviseSpy = jest.spyOn(phase as any, 'revise').mockResolvedValue({
        success: true,
        output: outputFilePath,
      });

      const result = await phase.run({ skipReview: false });

      expect(result).toBe(true);
      expect(executeSpy).toHaveBeenCalled();
      expect(reviewSpy).toHaveBeenCalledTimes(2);
      expect(reviseSpy).toHaveBeenCalled();
    });

    it('completes without revise when review succeeds on first attempt', async () => {
      const phase = new TestingPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
      fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
      fs.writeFileSync(outputFilePath, 'initial', 'utf-8');

      const executeSpy = jest.spyOn(phase as any, 'execute').mockResolvedValue({
        success: true,
        output: outputFilePath,
      });
      const reviewSpy = jest.spyOn(phase as any, 'review').mockResolvedValue({
        success: true,
        output: 'PASS',
      });
      const reviseSpy = jest.spyOn(phase as any, 'revise');

      const result = await phase.run({ skipReview: false });

      expect(result).toBe(true);
      expect(executeSpy).toHaveBeenCalled();
      expect(reviewSpy).toHaveBeenCalledTimes(1);
      expect(reviseSpy).not.toHaveBeenCalled();
    });

    it('maintains consistent behavior across multiple workflow executions (regression test)', async () => {
      // 複数のワークフロー実行で一貫した動作を確認（回帰テスト）
      let successCount = 0;

      // 5回の実行で一貫した成功率を確認
      for (let i = 0; i < 5; i++) {
        // 各実行で新しいmockメタデータを作成して独立性を確保
        const freshMetadata = {
          ...mockMetadata,
          data: {
            ...mockMetadata.data,
            phases: {
              ...mockMetadata.data.phases,
              testing: {
                status: 'pending',
                retry_count: 0,
                output_files: [],
                completed_steps: [],
                current_step: null,
                started_at: null,
                completed_at: null,
                review_result: null,
                rollback_context: null,
              }
            }
          }
        };

        const phase = new TestingPhase({
          workingDir: testWorkingDir,
          metadataManager: freshMetadata as any,
          codexClient: mockCodex,
          githubClient: mockGithub,
          skipDependencyCheck: true,
        });

        const outputFilePath = path.join(testWorkflowDir, '06_testing', 'output', 'test-result.md');
        fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
        fs.writeFileSync(outputFilePath, `test content ${i}`, 'utf-8');

        jest.spyOn(phase as any, 'execute').mockResolvedValue({
          success: true,
          output: outputFilePath,
        });
        jest.spyOn(phase as any, 'review').mockResolvedValue({
          success: true,
          output: 'PASS',
        });

        const result = await phase.run({ skipReview: false });
        if (result) successCount++;
      }

      // 成功率が100%であることを確認（既存動作の回帰がない）
      expect(successCount).toBe(5);
    });
  });
});
