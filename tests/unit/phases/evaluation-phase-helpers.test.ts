import { describe, test, expect, beforeEach, afterAll, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { EvaluationPhase } from '../../../src/phases/evaluation.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';

const TEST_ROOT = path.join(process.cwd(), 'tests', 'temp', 'evaluation-phase-helpers');
const WORKFLOW_DIR = path.join(TEST_ROOT, '.ai-workflow', 'issue-7');
const METADATA_PATH = path.join(WORKFLOW_DIR, 'metadata.json');
const TARGET_REPO_PATH = path.join(TEST_ROOT, 'repo');

class TestGithubClient {}

describe('EvaluationPhase helper behaviors', () => {
  let metadataManager: MetadataManager;
  let evaluationPhase: EvaluationPhase;

  beforeEach(async () => {
    await fs.remove(TEST_ROOT);
    await fs.ensureDir(WORKFLOW_DIR);
    await fs.ensureDir(TARGET_REPO_PATH);

    const metadata = {
      version: '0.2.0',
      issue_number: '7',
      issue_title: 'Helper Coverage',
      issue_url: 'https://example.com/issues/7',
      workflow_dir: WORKFLOW_DIR,
      repository: 'owner/repo',
      branch_name: 'ai-workflow/issue-7',
      target_repository: {
        repo: 'repo',
        github_name: 'owner/repo',
        path: TARGET_REPO_PATH,
      },
      language: 'ja',
      phases: {
        planning: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        requirements: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        design: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        test_scenario: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        implementation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        test_implementation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        test_preparation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        testing: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        documentation: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        report: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
        evaluation: { status: 'in_progress', started_at: '', completed_at: '', retry_count: 0 },
      },
      design_decisions: {},
      costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
    };

    await fs.writeJSON(METADATA_PATH, metadata, { spaces: 2 });
    metadataManager = new MetadataManager(METADATA_PATH);

    evaluationPhase = new EvaluationPhase({
      workingDir: TEST_ROOT,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient: new TestGithubClient() as any,
      skipDependencyCheck: true,
      ignoreDependencies: true,
    });
  });

  afterAll(async () => {
    await fs.remove(TEST_ROOT);
  });

  test('エージェントログから評価セクションを抽出できる', () => {
    const log = [
      '# 評価レポート',
      '内容',
      'DECISION: PASS',
      '## 詳細',
      '- item',
    ].join('\n');

    const result = (evaluationPhase as any).extractEvaluationFromLog(log);
    expect(result).toContain('評価レポート');
    expect(result).toContain('DECISION: PASS');
  });

  test('ヘッダーがなくてもDECISIONを含むブロックを抽出できる', () => {
    const log = [
      'random',
      '## Evaluation',
      'something',
      'DECISION: ABORT',
      'more lines',
    ].join('\n');

    const result = (evaluationPhase as any).extractEvaluationFromLog(log);
    expect(result).toContain('DECISION: ABORT');
  });

  test('妥当性チェックで短すぎるコンテンツは無効になる', () => {
    const valid = [
      '# Evaluation Report',
      'DECISION: PASS_WITH_ISSUES',
      '## Section',
      '### Detail',
      '## Another Section',
      'detail'.repeat(30),
    ].join('\n');

    expect((evaluationPhase as any).isValidEvaluationContent(valid)).toBe(true);
    expect((evaluationPhase as any).isValidEvaluationContent('too short')).toBe(false);
    expect((evaluationPhase as any).isValidEvaluationContent('# Header only')).toBe(false);
  });

  test('エージェントログが存在しない場合はエラーを返す', async () => {
    const evaluationFile = path.join(evaluationPhase.outputDir, 'evaluation_report.md');

    const result = await (evaluationPhase as any).handleMissingEvaluationFile(
      evaluationFile,
      'prompt',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('agent_log');
  });

  test('エージェントログから抽出してevaluation_report.mdを保存する', async () => {
    const evaluationFile = path.join(evaluationPhase.outputDir, 'evaluation_report.md');
    await fs.ensureDir(evaluationPhase.executeDir);
    const logPath = path.join(evaluationPhase.executeDir, 'agent_log.md');
    const content = [
      '# Evaluation Report',
      'DECISION: PASS',
      '## Findings',
      '## Summary',
      'Details of evaluation'.repeat(10),
    ].join('\n');
    await fs.writeFile(logPath, content);

    const result = await (evaluationPhase as any).handleMissingEvaluationFile(
      evaluationFile,
      'prompt',
    );

    expect(result.success).toBe(true);
    expect(fs.existsSync(evaluationFile)).toBe(true);
    expect(await fs.readFile(evaluationFile, 'utf-8')).toContain('DECISION: PASS');
  });

  test('抽出コンテンツが不十分ならreviseを呼び出す', async () => {
    const evaluationFile = path.join(evaluationPhase.outputDir, 'evaluation_report.md');
    await fs.ensureDir(evaluationPhase.executeDir);
    const logPath = path.join(evaluationPhase.executeDir, 'agent_log.md');
    await fs.writeFile(logPath, 'DECISION: PASS');

    const reviseSpy = jest
      .spyOn(evaluationPhase as any, 'revise')
      .mockResolvedValue({ success: true, output: evaluationFile });

    const result = await (evaluationPhase as any).handleMissingEvaluationFile(
      evaluationFile,
      'prompt',
    );

    expect(reviseSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });
});
