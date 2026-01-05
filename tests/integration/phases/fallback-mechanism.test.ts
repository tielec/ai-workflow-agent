/**
 * Integration tests for Phase Fallback Mechanism (Issue #113)
 *
 * Tests cover:
 * - End-to-end fallback behavior for each phase (Planning, Requirements, Design, etc.)
 * - Log extraction success flow
 * - Log extraction failure → revise flow
 * - Regression tests (existing behavior maintained)
 * - Error handling for fallback failures
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { PlanningPhase } from '../../../src/phases/planning.js';
import { RequirementsPhase } from '../../../src/phases/requirements.js';
import { DesignPhase } from '../../../src/phases/design.js';
import { TestScenarioPhase } from '../../../src/phases/test-scenario.js';
import { ImplementationPhase } from '../../../src/phases/implementation.js';
import { ReportPhase } from '../../../src/phases/report.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { GitHubClient } from '../../../src/core/github-client.js';
import { CodexAgentClient } from '../../../src/core/codex-agent-client.js';

// Skip tests in CI with dummy API keys (they require real agent API calls)
const isDummyKey =
  process.env.CLAUDE_CODE_OAUTH_TOKEN === 'dummy-token-for-ci' ||
  process.env.CODEX_API_KEY === 'dummy-key-for-ci';
const describeOrSkip = isDummyKey ? describe.skip : describe;

describeOrSkip('Fallback Mechanism Integration Tests (Issue #113)', () => {
  let testWorkingDir: string;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockGitHub: jest.Mocked<GitHubClient>;
  let mockCodex: jest.Mocked<CodexAgentClient>;

  beforeEach(() => {
    // Setup test working directory
    testWorkingDir = path.join(process.cwd(), '.test-tmp', 'fallback-integration');
    fs.ensureDirSync(testWorkingDir);

    // TypeScript 5.x strict type checking compatibility:
    // Explicitly specify the type parameter for jest.fn() to avoid type inference issues.
    // Reference: Issue #113 Evaluation Report, Issue #102, #105

    // Mock MetadataManager
    const workflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-113');
    mockMetadata = {
      workflowDir,
      data: {
        issue_number: '113',
        repo_url: 'https://github.com/test/repo',
        design_decisions: {}, // Issue #113: Design/TestScenario/Implementationフェーズが参照
      },
      updatePhaseStatus: jest.fn(),
      getRollbackContext: jest.fn().mockReturnValue(null),
      getPhaseStatus: jest.fn().mockReturnValue('completed'),
      getLanguage: jest.fn().mockReturnValue('ja'),
    } as any;

    // Mock GitHubClient
    mockGitHub = {
      getIssueInfo: jest.fn<any>().mockResolvedValue({
        number: 113,
        title: 'Test Issue',
        state: 'open',
        url: 'https://github.com/test/repo/issues/113',
        labels: ['enhancement'],
        body: 'Test issue body',
      }),
      postComment: jest.fn<any>(),
    } as any;

    // Mock CodexAgentClient
    mockCodex = {
      executeAgent: jest.fn<any>().mockResolvedValue([]),
      getWorkingDirectory: jest.fn<any>().mockReturnValue(testWorkingDir),
    } as any;
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
    jest.restoreAllMocks();
  });

  describe('Planning Phase - Fallback Integration', () => {
    describe('Log extraction success flow', () => {
      it('should successfully execute with fallback when file is not created but log has valid content', async () => {
        // Given: Planning phase with fallback enabled, agent doesn't create file but logs valid content
        const planningPhase = new PlanningPhase({
          workingDir: testWorkingDir,
          metadataManager: mockMetadata,
          codexClient: mockCodex,
          claudeClient: null,
          githubClient: mockGitHub,
        });

        // Setup: Create valid agent log
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        fs.ensureDirSync(executeDir);

        const validPlanningLog = `
# プロジェクト計画書 - Issue #113

## 1. Issue分析
**複雑度**: 中程度
**見積もり工数**: 12~16時間

## 2. 実装戦略判断
**実装戦略**: EXTEND
**テスト戦略**: UNIT_INTEGRATION
**テストコード戦略**: BOTH_TEST

## 3. 影響範囲分析
変更が必要なファイル:
- src/phases/base-phase.ts

## 4. タスク分割
Phase 1: 要件定義 (1~2h)
Phase 2: 設計 (2~3h)
`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validPlanningLog, 'utf-8');

        // Mock executeWithAgent to not create output file
        jest.spyOn(planningPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

        // When: Executing planning phase
        const result = await (planningPhase as any).execute();

        // Then: Fallback succeeds and file is created
        expect(result.success).toBe(true);
        expect(result.output).toContain('planning.md');

        const outputFile = path.join(mockMetadata.workflowDir, '00_planning', 'output', 'planning.md');
        expect(fs.existsSync(outputFile)).toBe(true);

        const savedContent = fs.readFileSync(outputFile, 'utf-8');
        expect(savedContent).toContain('プロジェクト計画書');
        expect(savedContent).toContain('## 1. Issue分析');
      });
    });

    describe('Log extraction failure → revise success flow', () => {
      it('should call revise when log extraction fails and revise creates file successfully', async () => {
        // Given: Planning phase with invalid log content
        const planningPhase = new PlanningPhase({
          workingDir: testWorkingDir,
          metadataManager: mockMetadata,
          codexClient: mockCodex,
          claudeClient: null,
          githubClient: mockGitHub,
        });

        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const reviseDir = path.join(mockMetadata.workflowDir, '00_planning', 'revise');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        fs.ensureDirSync(executeDir);
        fs.ensureDirSync(reviseDir);
        fs.ensureDirSync(outputDir);

        // Invalid log (no valid content)
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), 'Agent output with no valid planning document', 'utf-8');

        // Mock execute to not create file
        const executeAgentSpy = jest.spyOn(planningPhase as any, 'executeWithAgent')
          .mockResolvedValueOnce([] as any[]); // execute call

        // Mock revise to create file
        jest.spyOn(planningPhase as any, 'revise').mockImplementation(async (feedback: any) => {
          expect(feedback).toContain('planning.md が見つかりません');
          // Simulate revise creating the file
          fs.writeFileSync(path.join(outputDir, 'planning.md'), '# Planning Document\n\n## Section 1\nContent', 'utf-8');
          return { success: true, output: path.join(outputDir, 'planning.md') };
        });

        // When: Executing planning phase
        const result = await (planningPhase as any).execute();

        // Then: revise was called and file was created
        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'planning.md'))).toBe(true);
      });
    });
  });

  describe('Requirements Phase - Fallback Integration', () => {
    it('should successfully execute with fallback when log has valid requirements document', async () => {
      // Given: Requirements phase with fallback enabled
      // First, create planning document (dependency)
      const planningDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
      fs.ensureDirSync(planningDir);
      fs.writeFileSync(path.join(planningDir, 'planning.md'), '# Planning Document\n\n実装戦略: EXTEND', 'utf-8');

      const requirementsPhase = new RequirementsPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        claudeClient: null,
        githubClient: mockGitHub,
        skipDependencyCheck: true, // Skip dependency check for test
      });

      const executeDir = path.join(mockMetadata.workflowDir, '01_requirements', 'execute');
      fs.ensureDirSync(executeDir);

      const validRequirementsLog = `
# 要件定義書 - Issue #113

## 1. 概要
本要件定義書では、フォールバック機構の導入について定義します。

## 2. 機能要件
FR-1: BasePhaseへの汎用フォールバック機構の実装
FR-2: executePhaseTemplate()へのフォールバックロジック統合

## 3. 非機能要件
NFR-1: パフォーマンス要件

## 4. 受け入れ基準
Given: エージェントがファイル生成に失敗した
When: handleMissingOutputFile()が呼び出された
Then: ログから抽出される
`;
      fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validRequirementsLog, 'utf-8');

      jest.spyOn(requirementsPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

      // When: Executing requirements phase
      const result = await (requirementsPhase as any).execute();

      // Then: Fallback succeeds
      expect(result.success).toBe(true);

      const outputFile = path.join(mockMetadata.workflowDir, '01_requirements', 'output', 'requirements.md');
      expect(fs.existsSync(outputFile)).toBe(true);

      const savedContent = fs.readFileSync(outputFile, 'utf-8');
      expect(savedContent).toContain('要件定義書');
      expect(savedContent).toContain('## 2. 機能要件');
    });
  });

  describe('Design Phase - Fallback Integration', () => {
    it('should successfully execute with fallback when log has valid design document', async () => {
      // Given: Design phase with fallback enabled
      // Setup dependencies
      const planningDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
      const requirementsDir = path.join(mockMetadata.workflowDir, '01_requirements', 'output');
      fs.ensureDirSync(planningDir);
      fs.ensureDirSync(requirementsDir);
      fs.writeFileSync(path.join(planningDir, 'planning.md'), '# Planning\n\n実装戦略: EXTEND', 'utf-8');
      fs.writeFileSync(path.join(requirementsDir, 'requirements.md'), '# Requirements\n\n機能要件: FR-1', 'utf-8');

      const designPhase = new DesignPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        claudeClient: null,
        githubClient: mockGitHub,
        skipDependencyCheck: true,
      });

      const executeDir = path.join(mockMetadata.workflowDir, '02_design', 'execute');
      fs.ensureDirSync(executeDir);

      const validDesignLog = `
# 詳細設計書 - Issue #113

## 1. アーキテクチャ設計
システム全体図を以下に示します。

## 2. 実装戦略判断
実装戦略: EXTEND（既存のBasePhase.executePhaseTemplate()を拡張）

## 3. テスト戦略判断
テスト戦略: UNIT_INTEGRATION

## 4. クラス設計
BasePhase クラスの拡張について説明します。
`;
      fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validDesignLog, 'utf-8');

      jest.spyOn(designPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

      // When: Executing design phase
      const result = await (designPhase as any).execute();

      // Then: Fallback succeeds
      expect(result.success).toBe(true);

      const outputFile = path.join(mockMetadata.workflowDir, '02_design', 'output', 'design.md');
      expect(fs.existsSync(outputFile)).toBe(true);

      const savedContent = fs.readFileSync(outputFile, 'utf-8');
      expect(savedContent).toContain('詳細設計書');
      expect(savedContent).toContain('## 1. アーキテクチャ設計');
    });
  });

  describe('TestScenario Phase - Fallback Integration', () => {
    it('should successfully execute with fallback when log has valid test scenario', async () => {
      // Given: TestScenario phase with fallback enabled
      // Setup dependencies
      const planningDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
      const designDir = path.join(mockMetadata.workflowDir, '02_design', 'output');
      fs.ensureDirSync(planningDir);
      fs.ensureDirSync(designDir);
      fs.writeFileSync(path.join(planningDir, 'planning.md'), '# Planning\n\nテスト戦略: UNIT_INTEGRATION', 'utf-8');
      fs.writeFileSync(path.join(designDir, 'design.md'), '# Design\n\nアーキテクチャ設計', 'utf-8');

      const testScenarioPhase = new TestScenarioPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        claudeClient: null,
        githubClient: mockGitHub,
        skipDependencyCheck: true,
      });

      const executeDir = path.join(mockMetadata.workflowDir, '03_test_scenario', 'execute');
      fs.ensureDirSync(executeDir);

      const validTestScenarioLog = `
# テストシナリオ - Issue #113

## 1. テスト戦略サマリー
選択されたテスト戦略: UNIT_INTEGRATION

## 2. ユニットテストシナリオ
### テストケース 2.1.1: Planning Phase - ヘッダーパターンマッチ成功
目的: ログからプロジェクト計画書を検出する

## 3. 統合テストシナリオ
### シナリオ 3.1.1: Planning Phase - ログ抽出成功フロー
目的: フォールバック機構が動作することを検証
`;
      fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validTestScenarioLog, 'utf-8');

      jest.spyOn(testScenarioPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

      // When: Executing test scenario phase
      const result = await (testScenarioPhase as any).execute();

      // Then: Fallback succeeds
      expect(result.success).toBe(true);

      const outputFile = path.join(mockMetadata.workflowDir, '03_test_scenario', 'output', 'test-scenario.md');
      expect(fs.existsSync(outputFile)).toBe(true);

      const savedContent = fs.readFileSync(outputFile, 'utf-8');
      expect(savedContent).toContain('テストシナリオ');
      expect(savedContent).toContain('テストケース');
    });
  });

  describe('Implementation Phase - Fallback Integration', () => {
    it('should successfully execute with fallback when log has valid implementation log', async () => {
      // Given: Implementation phase with fallback enabled
      // Setup dependencies
      const designDir = path.join(mockMetadata.workflowDir, '02_design', 'output');
      fs.ensureDirSync(designDir);
      fs.writeFileSync(path.join(designDir, 'design.md'), '# Design\n\n実装詳細', 'utf-8');

      const implementationPhase = new ImplementationPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        claudeClient: null,
        githubClient: mockGitHub,
        skipDependencyCheck: true,
      });

      const executeDir = path.join(mockMetadata.workflowDir, '04_implementation', 'execute');
      fs.ensureDirSync(executeDir);

      const validImplementationLog = `
# 実装ログ - Issue #113

## 概要
本実装では、Evaluation Phaseで実装されたフォールバック機構を6つのフェーズに導入しました。

## 実装内容
### 1. BasePhase.executePhaseTemplate() の拡張
ファイル: src/phases/base-phase.ts

### 2. BasePhase への3つのフォールバックメソッド追加
実装箇所: lines 303-742
`;
      fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validImplementationLog, 'utf-8');

      jest.spyOn(implementationPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

      // When: Executing implementation phase
      const result = await (implementationPhase as any).execute();

      // Then: Fallback succeeds
      expect(result.success).toBe(true);

      const outputFile = path.join(mockMetadata.workflowDir, '04_implementation', 'output', 'implementation.md');
      expect(fs.existsSync(outputFile)).toBe(true);

      const savedContent = fs.readFileSync(outputFile, 'utf-8');
      expect(savedContent).toContain('実装ログ');
      expect(savedContent).toContain('実装内容');
    });
  });

  describe('Report Phase - Fallback Integration', () => {
    it('should successfully execute with fallback when log has valid report', async () => {
      // Given: Report phase with fallback enabled
      // Setup dependencies
      const implementationDir = path.join(mockMetadata.workflowDir, '04_implementation', 'output');
      fs.ensureDirSync(implementationDir);
      fs.writeFileSync(path.join(implementationDir, 'implementation.md'), '# Implementation\n\n実装完了', 'utf-8');

      const reportPhase = new ReportPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        claudeClient: null,
        githubClient: mockGitHub,
        skipDependencyCheck: true,
      });

      const executeDir = path.join(mockMetadata.workflowDir, '08_report', 'execute');
      fs.ensureDirSync(executeDir);

      const validReportLog = `
# プロジェクトレポート - Issue #113

## サマリー
全フェーズにEvaluation Phaseのフォールバック機構を導入しました。

## 主要な成果物
- BasePhase.handleMissingOutputFile()の実装
- executePhaseTemplate()の拡張

## プルリクエスト情報
タイトル: Issue #113 - フォールバック機構の導入
`;
      fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validReportLog, 'utf-8');

      jest.spyOn(reportPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

      // When: Executing report phase
      const result = await (reportPhase as any).execute();

      // Then: Fallback succeeds
      expect(result.success).toBe(true);

      const outputFile = path.join(mockMetadata.workflowDir, '08_report', 'output', 'report.md');
      expect(fs.existsSync(outputFile)).toBe(true);

      const savedContent = fs.readFileSync(outputFile, 'utf-8');
      expect(savedContent).toContain('プロジェクトレポート');
      expect(savedContent).toContain('サマリー');
    });
  });

  describe('Regression Tests', () => {
    it('should maintain existing behavior when enableFallback is not specified (backward compatibility)', async () => {
      // Given: A phase that doesn't specify enableFallback option
      // Note: This test verifies backward compatibility
      // In this test, we cannot directly test phases that don't use executePhaseTemplate
      // Instead, we verify that the default behavior is maintained

      const planningPhase = new PlanningPhase({
        workingDir: testWorkingDir,
        metadataManager: mockMetadata,
        codexClient: mockCodex,
        claudeClient: null,
        githubClient: mockGitHub,
      });

      // Mock executeWithAgent to not create file
      jest.spyOn(planningPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

      // Mock executePhaseTemplate to not use fallback
      const originalExecutePhaseTemplate = (planningPhase as any).executePhaseTemplate.bind(planningPhase);
      jest.spyOn(planningPhase as any, 'executePhaseTemplate').mockImplementation(
        async (phaseOutputFile: any, templateVariables: any, options: any) => {
          // Force enableFallback to false to test backward compatibility
          return originalExecutePhaseTemplate(phaseOutputFile, templateVariables, { ...options, enableFallback: false });
        }
      );

      // When: Executing phase without fallback
      const result = await (planningPhase as any).execute();

      // Then: Error is returned (existing behavior)
      expect(result.success).toBe(false);
      expect(result.error).toContain('が見つかりません');
    });
  });

  describe('Error Handling Integration Tests', () => {
    describe('Complete fallback failure', () => {
      it('should return appropriate error when both log extraction and revise fail', async () => {
        // Given: Planning phase where both extraction and revise fail
        const planningPhase = new PlanningPhase({
          workingDir: testWorkingDir,
          metadataManager: mockMetadata,
          codexClient: mockCodex,
          claudeClient: null,
          githubClient: mockGitHub,
        });

        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        fs.ensureDirSync(executeDir);

        // Invalid log content
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), 'Invalid content', 'utf-8');

        jest.spyOn(planningPhase as any, 'executeWithAgent').mockResolvedValue([] as any[]);

        // Mock revise to also fail
        jest.spyOn(planningPhase as any, 'revise').mockImplementation(async () => {
          return {
            success: false,
            output: null,
            error: 'Revise ステップでもファイルが作成されませんでした。',
          };
        });

        // When: Executing planning phase
        const result = await (planningPhase as any).execute();

        // Then: Error is returned
        expect(result.success).toBe(false);
        expect(result.error).toContain('Revise ステップでもファイルが作成されませんでした');
      });
    });
  });
});
