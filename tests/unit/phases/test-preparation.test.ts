/**
 * ユニットテスト: TestPreparationPhase
 *
 * テスト対象:
 * - constructor
 * - execute()
 * - review()
 * - revise()
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TestPreparationPhase } from '../../../src/phases/test-preparation.js';
import type { PhaseExecutionResult } from '../../../src/types.js';

const ISSUE_NUMBER = '123';

const DEFAULT_TEST_IMPL_FALLBACK =
  'テストコード実装ログは利用できません。実装コードとリポジトリ構成から環境準備を行ってください。';
const DEFAULT_IMPL_FALLBACK =
  '実装ログは利用できません。リポジトリの実装内容を直接確認して環境準備を行ってください。';

const REVIEW_IMPL_FALLBACK =
  '実装ログは利用できません。テスト準備内容から実装を推測してレビューしてください。';
const REVIEW_TEST_IMPL_FALLBACK =
  'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測してレビューしてください。';

const REVISE_IMPL_FALLBACK =
  '実装ログは利用できません。テスト準備内容から実装を推測して修正してください。';
const REVISE_TEST_IMPL_FALLBACK =
  'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測して修正してください。';

describe('TestPreparationPhase', () => {
  let tempRoot: string;
  let workingDir: string;
  let workflowDir: string;
  let metadataManager: any;
  let githubClient: any;

  const createPhase = (): TestPreparationPhase =>
    new TestPreparationPhase({
      workingDir,
      metadataManager,
      githubClient,
      skipDependencyCheck: true,
    });

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-workflow-test-prep-'));
    workingDir = path.join(tempRoot, 'repo');
    workflowDir = path.join(workingDir, '.ai-workflow', `issue-${ISSUE_NUMBER}`);
    fs.ensureDirSync(workingDir);

    metadataManager = {
      workflowDir,
      data: {
        issue_number: ISSUE_NUMBER,
        target_repository: {
          path: workingDir,
          repo: path.basename(workingDir),
        },
      },
      updatePhaseStatus: jest.fn<any>(),
      getPhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      save: jest.fn<any>(),
      getLanguage: jest.fn<any>().mockReturnValue('ja'),
    };

    githubClient = {
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
      postReviewResult: jest.fn<any>(),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (tempRoot && fs.existsSync(tempRoot)) {
      fs.removeSync(tempRoot);
    }
  });

  test('UT-PHASE-001: コンストラクタで phaseName が test_preparation に設定される', () => {
    const phase = createPhase();
    expect((phase as any).phaseName).toBe('test_preparation');
  });

  test('UT-PHASE-002: execute() が executePhaseTemplate を呼び出す', async () => {
    const phase = createPhase();

    const buildOptionalContextSpy = jest
      .spyOn(phase as any, 'buildOptionalContext')
      .mockReturnValue('mock-context');
    const planningRefSpy = jest
      .spyOn(phase as any, 'getPlanningDocumentReference')
      .mockReturnValue('@planning');
    const executeTemplateSpy = jest
      .spyOn(phase as any, 'executePhaseTemplate')
      .mockResolvedValue({ success: true } as PhaseExecutionResult);

    const result = await (phase as any).execute();

    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'test_implementation',
      'test-implementation.md',
      DEFAULT_TEST_IMPL_FALLBACK,
      Number(ISSUE_NUMBER),
    );
    expect(buildOptionalContextSpy).toHaveBeenCalledWith(
      'implementation',
      'implementation.md',
      DEFAULT_IMPL_FALLBACK,
      Number(ISSUE_NUMBER),
    );
    expect(planningRefSpy).toHaveBeenCalledWith(Number(ISSUE_NUMBER));
    expect(executeTemplateSpy).toHaveBeenCalledWith(
      'test-preparation.md',
      {
        planning_document_path: '@planning',
        test_implementation_context: 'mock-context',
        implementation_context: 'mock-context',
        issue_number: ISSUE_NUMBER,
      },
      { maxTurns: 80, enableFallback: true },
    );
    expect(result.success).toBe(true);
  });

  test('UT-PHASE-004: review() が出力ファイル不在時に失敗する', async () => {
    const phase = createPhase();

    const result = await (phase as any).review();

    expect(result.success).toBe(false);
    expect(result.error).toContain('test-preparation.md が存在しません');
  });

  test('UT-PHASE-005: review() がレビュープロンプトを実行して結果を返す', async () => {
    const phase = createPhase();
    const outputFile = path.join((phase as any).outputDir, 'test-preparation.md');
    fs.ensureDirSync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, '# テスト準備', 'utf-8');

    jest.spyOn(phase as any, 'getPlanningDocumentReference').mockReturnValue('@planning');
    jest.spyOn(phase as any, 'getPhaseOutputFile').mockReturnValue(null);
    jest.spyOn(phase as any, 'getAgentFileReference').mockReturnValue('@test-prep');
    jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
      'Planning: {planning_document_path}\n' +
        'Prep: {test_preparation_document_path}\n' +
        'Impl: {implementation_document_path}\n' +
        'TestImpl: {test_implementation_document_path}'
    );

    const executeSpy = jest
      .spyOn(phase as any, 'executeWithAgent')
      .mockResolvedValue([{ role: 'assistant', content: 'OK' }] as any);

    jest.spyOn((phase as any).contentParser, 'parseReviewResult').mockResolvedValue({
      result: 'PASS',
      feedback: 'LGTM',
      suggestions: [],
    });

    const result = await (phase as any).review();

    const [[promptArg, optionsArg]] = executeSpy.mock.calls;
    expect(promptArg).toContain('Planning: @planning');
    expect(promptArg).toContain('Prep: @test-prep');
    expect(promptArg).toContain(`Impl: ${REVIEW_IMPL_FALLBACK}`);
    expect(promptArg).toContain(`TestImpl: ${REVIEW_TEST_IMPL_FALLBACK}`);
    expect(optionsArg).toEqual({ maxTurns: 30, logDir: (phase as any).reviewDir });

    const reviewFile = path.join((phase as any).reviewDir, 'result.md');
    expect(fs.existsSync(reviewFile)).toBe(true);
    expect(fs.readFileSync(reviewFile, 'utf-8')).toBe('LGTM');

    expect(githubClient.postReviewResult).toHaveBeenCalledWith(
      Number(ISSUE_NUMBER),
      'test_preparation',
      'PASS',
      'LGTM',
      [],
      metadataManager,
    );

    expect(result.success).toBe(true);
    expect(result.output).toBe('PASS');
  });

  test('UT-PHASE-006: revise() が出力ファイル不在時に失敗する', async () => {
    const phase = createPhase();

    const result = await phase.revise('fix');

    expect(result.success).toBe(false);
    expect(result.error).toContain('test-preparation.md が存在しません');
  });

  test('UT-PHASE-007: revise() がレビュー指摘を反映して更新される', async () => {
    const phase = createPhase();
    const outputFile = path.join((phase as any).outputDir, 'test-preparation.md');
    fs.ensureDirSync(path.dirname(outputFile));
    fs.writeFileSync(outputFile, '# テスト準備 v1', 'utf-8');

    jest.spyOn(phase as any, 'getPhaseOutputFile').mockReturnValue(null);
    jest.spyOn(phase as any, 'getAgentFileReference').mockReturnValue('@test-prep');
    jest.spyOn(phase as any, 'loadPrompt').mockReturnValue(
      'Prep: {test_preparation_document_path}\n' +
        'Impl: {implementation_document_path}\n' +
        'TestImpl: {test_implementation_document_path}\n' +
        'Feedback: {review_feedback}\n' +
        'Issue: {issue_number}'
    );

    const executeSpy = jest
      .spyOn(phase as any, 'executeWithAgent')
      .mockImplementation(async () => {
        fs.writeFileSync(outputFile, '# テスト準備 v2', 'utf-8');
        return [] as any;
      });

    const result = await phase.revise('Python 3.11 が必要です');

    const [[promptArg, optionsArg]] = executeSpy.mock.calls;
    expect(promptArg).toContain('Prep: @test-prep');
    expect(promptArg).toContain(`Impl: ${REVISE_IMPL_FALLBACK}`);
    expect(promptArg).toContain(`TestImpl: ${REVISE_TEST_IMPL_FALLBACK}`);
    expect(promptArg).toContain('Feedback: Python 3.11 が必要です');
    expect(promptArg).toContain(`Issue: ${ISSUE_NUMBER}`);
    expect(optionsArg).toEqual({ maxTurns: 80, logDir: (phase as any).reviseDir });

    expect(result.success).toBe(true);
    expect(result.output).toBe(outputFile);
  });
});
