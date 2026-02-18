/**
 * Unit tests for ReportPhase revise fallback (Issue #698)
 *
 * Tests cover:
 * - revise() behavior when report.md is missing
 * - revise() behavior when report.md exists (regression)
 * - execute() maxTurns update
 * - enableFallback:false for infinite recursion prevention
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { ReportPhase } from '../../../src/phases/report.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { GitHubClient } from '../../../src/core/github-client.js';
import { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import { PhaseExecutionResult } from '../../../src/types.js';
import { logger } from '../../../src/utils/logger.js';

class TestReportPhase extends ReportPhase {
  public exposeRevise(feedback: string): Promise<PhaseExecutionResult> {
    return this.revise(feedback);
  }

  public exposeExecute(): Promise<PhaseExecutionResult> {
    return this.execute();
  }
}

describe('ReportPhase revise fallback (Issue #698)', () => {
  let testWorkingDir: string;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockGitHub: jest.Mocked<GitHubClient>;
  let mockCodex: jest.Mocked<CodexAgentClient>;
  let reportPhase: TestReportPhase;

  beforeEach(() => {
    testWorkingDir = path.join(process.cwd(), '.test-tmp', 'report-revise-fallback');
    fs.ensureDirSync(testWorkingDir);

    mockMetadata = {
      workflowDir: path.join(testWorkingDir, '.ai-workflow', 'issue-698'),
      data: {
        issue_number: '698',
        target_repository: {
          path: testWorkingDir,
          repo: path.basename(testWorkingDir),
        },
      },
      updatePhaseStatus: jest.fn(),
      getRollbackContext: jest.fn(),
      getLanguage: jest.fn().mockReturnValue('ja'),
    } as any;

    mockGitHub = {
      getIssueInfo: jest.fn(),
      postReviewResult: jest.fn(),
      checkExistingPr: jest.fn(),
      extractPhaseOutputs: jest.fn(),
      generatePrBodyDetailed: jest.fn(),
      updatePullRequest: jest.fn(),
    } as any;

    mockCodex = {
      executeAgent: jest.fn(),
      getWorkingDirectory: jest.fn().mockReturnValue(testWorkingDir),
    } as any;

    reportPhase = new TestReportPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGitHub,
      codexClient: mockCodex,
      claudeClient: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
  });

  it('revise() should call executePhaseTemplate when report.md is missing', async () => {
    // Given: report.md does not exist
    const reviewFeedback = 'report.md が見つかりません: /path/to/output/report.md';
    const executePhaseTemplateSpy = jest
      .spyOn(reportPhase as any, 'executePhaseTemplate')
      .mockResolvedValue({ success: true, output: 'report.md' });
    const executeWithAgentSpy = jest
      .spyOn(reportPhase as any, 'executeWithAgent')
      .mockResolvedValue([] as any[]);

    // When: revise is executed
    const result = await reportPhase.exposeRevise(reviewFeedback);

    // Then: executePhaseTemplate is called with expected arguments
    expect(result.success).toBe(true);
    expect(executePhaseTemplateSpy).toHaveBeenCalledTimes(1);
    const [outputFile, templateVariables, options] = executePhaseTemplateSpy.mock.calls[0];
    expect(outputFile).toBe('report.md');
    expect(templateVariables).toEqual(
      expect.objectContaining({
        planning_document_path: expect.any(String),
        requirements_context: expect.any(String),
        design_context: expect.any(String),
        implementation_context: expect.any(String),
        testing_context: expect.any(String),
        documentation_context: expect.any(String),
        test_scenario_context: expect.any(String),
        test_implementation_context: expect.any(String),
        issue_number: expect.any(String),
      }),
    );
    expect(options).toEqual(expect.objectContaining({ enableFallback: false, maxTurns: 50 }));
    expect(executeWithAgentSpy).not.toHaveBeenCalled();
  });

  it('revise() should log warning when report.md is missing', async () => {
    // Given: report.md does not exist
    const reviewFeedback = 'フォールバックからの呼び出し';
    jest.spyOn(reportPhase as any, 'executePhaseTemplate').mockResolvedValue({
      success: true,
      output: 'report.md',
    });
    const warnSpy = jest.spyOn(logger, 'warn');

    // When: revise is executed
    await reportPhase.exposeRevise(reviewFeedback);

    // Then: warning is logged
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Phase report: report.md not found, creating from scratch via revise'),
    );
  });

  it('revise() should use existing logic when report.md exists (regression)', async () => {
    // Given: report.md exists
    const reportFile = path.join(reportPhase['outputDir'], 'report.md');
    fs.writeFileSync(reportFile, '# プロジェクトレポート\n\n## サマリー\n既存の内容', 'utf-8');

    const agentLogPath = path.join(reportPhase['executeDir'], 'agent_log.md');
    fs.writeFileSync(agentLogPath, 'Previous agent log content for snippet extraction...', 'utf-8');

    jest.spyOn(reportPhase as any, 'loadPrompt').mockReturnValue(
      'Prompt {review_feedback} {previous_log_snippet}',
    );

    const executeWithAgentSpy = jest
      .spyOn(reportPhase as any, 'executeWithAgent')
      .mockResolvedValue([] as any[]);

    // When: revise is executed
    const reviewFeedback = 'レポートの品質が不十分です。サマリーセクションを改善してください。';
    const result = await reportPhase.exposeRevise(reviewFeedback);

    // Then: executeWithAgent is called with correct prompt and options
    expect(result.success).toBe(true);
    expect(executeWithAgentSpy).toHaveBeenCalledTimes(1);
    const [prompt, options] = executeWithAgentSpy.mock.calls[0];
    expect(prompt).toContain(reviewFeedback);
    expect(prompt).toContain('Previous agent log content for snippet extraction');
    expect(options).toEqual(expect.objectContaining({ maxTurns: 30, logDir: reportPhase['reviseDir'] }));
  });

  it('revise() should keep maxTurns=30 in revise mode (regression)', async () => {
    // Given: report.md exists
    const reportFile = path.join(reportPhase['outputDir'], 'report.md');
    fs.writeFileSync(reportFile, '# プロジェクトレポート\n## サマリー\n内容', 'utf-8');

    jest.spyOn(reportPhase as any, 'loadPrompt').mockReturnValue(
      'Prompt {review_feedback} {previous_log_snippet}',
    );

    const executeWithAgentSpy = jest
      .spyOn(reportPhase as any, 'executeWithAgent')
      .mockResolvedValue([] as any[]);

    // When: revise is executed
    await reportPhase.exposeRevise('サマリーを改善してください');

    // Then: executeWithAgent uses maxTurns=30
    const [, options] = executeWithAgentSpy.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({ maxTurns: 30 }));
  });

  it('execute() should use maxTurns=50 and enableFallback=true', async () => {
    // Given: executePhaseTemplate is mocked
    const executePhaseTemplateSpy = jest
      .spyOn(reportPhase as any, 'executePhaseTemplate')
      .mockResolvedValue({ success: true, output: 'report.md' });
    jest.spyOn(reportPhase as any, 'updatePullRequestSummary').mockResolvedValue(undefined);

    // When: execute is called
    const result = await reportPhase.exposeExecute();

    // Then: options include maxTurns=50 and enableFallback=true
    expect(result.success).toBe(true);
    expect(executePhaseTemplateSpy).toHaveBeenCalledTimes(1);
    const [, , options] = executePhaseTemplateSpy.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({ maxTurns: 50, enableFallback: true }));
  });

  it('revise() should pass maxTurns=50 in new creation mode', async () => {
    // Given: report.md does not exist
    const executePhaseTemplateSpy = jest
      .spyOn(reportPhase as any, 'executePhaseTemplate')
      .mockResolvedValue({ success: true, output: 'report.md' });

    // When: revise is executed
    await reportPhase.exposeRevise('フォールバックからの呼び出し');

    // Then: maxTurns=50 is passed
    const [, , options] = executePhaseTemplateSpy.mock.calls[0];
    expect(options).toEqual(expect.objectContaining({ maxTurns: 50 }));
  });

  it('revise() should build the same template variables as execute() when report.md is missing', async () => {
    // Given: report.md does not exist
    const buildOptionalContextSpy = jest
      .spyOn(reportPhase as any, 'buildOptionalContext')
      .mockImplementation((phaseName: string) => `context:${phaseName}`);
    const planningReferenceSpy = jest
      .spyOn(reportPhase as any, 'getPlanningDocumentReference')
      .mockReturnValue('@.ai-workflow/issue-698/00_planning/output/planning.md');

    const executePhaseTemplateSpy = jest
      .spyOn(reportPhase as any, 'executePhaseTemplate')
      .mockResolvedValue({ success: true, output: 'report.md' });

    // When: revise is executed
    await reportPhase.exposeRevise('フォールバックからの呼び出し');

    // Then: buildOptionalContext is called with expected arguments
    const issueNumber = 698;
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'requirements',
      'requirements.md',
      '要件定義書は利用できません。Issue情報から要件を推測してください。',
      issueNumber,
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'design',
      'design.md',
      '設計書は利用できません。Issue情報から設計内容を推測してください。',
      issueNumber,
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'implementation',
      'implementation.md',
      '実装ログは利用できません。リポジトリの実装内容を確認してください。',
      issueNumber,
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'testing',
      'test-result.md',
      'テスト結果は利用できません。実装内容から推測してください。',
      issueNumber,
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'documentation',
      'documentation-update-log.md',
      'ドキュメント更新ログは利用できません。',
      issueNumber,
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'test_scenario',
      'test-scenario.md',
      '',
      issueNumber,
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'test_implementation',
      'test-implementation.md',
      '',
      issueNumber,
    );
    expect(planningReferenceSpy).toHaveBeenCalledWith(issueNumber);

    const [, templateVariables] = executePhaseTemplateSpy.mock.calls[0];
    expect(templateVariables).toEqual(expect.objectContaining({ issue_number: '698' }));
  });

  it('revise() should return error when executePhaseTemplate fails in creation mode', async () => {
    // Given: report.md does not exist and executePhaseTemplate fails
    jest.spyOn(reportPhase as any, 'executePhaseTemplate').mockResolvedValue({
      success: false,
      error: 'エージェント実行失敗',
    });

    // When: revise is executed
    const result = await reportPhase.exposeRevise('フォールバックからの呼び出し');

    // Then: error is returned
    expect(result.success).toBe(false);
    expect(result.error).toBe('エージェント実行失敗');
  });

  it('revise() should return error when report.md disappears after revise', async () => {
    // Given: report.md exists
    const reportFile = path.join(reportPhase['outputDir'], 'report.md');
    fs.writeFileSync(reportFile, '# プロジェクトレポート\n## サマリー\n既存内容', 'utf-8');

    jest.spyOn(reportPhase as any, 'loadPrompt').mockReturnValue(
      'Prompt {review_feedback} {previous_log_snippet}',
    );

    jest.spyOn(reportPhase as any, 'executeWithAgent').mockImplementation(async () => {
      fs.removeSync(reportFile);
      return [] as any[];
    });

    // When: revise is executed
    const result = await reportPhase.exposeRevise('サマリーを改善してください');

    // Then: error is returned
    expect(result.success).toBe(false);
    expect(result.error).toBe('改訂後の report.md を確認できませんでした。');
  });
});
