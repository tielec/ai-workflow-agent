import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

type IssueInfo = {
  number: number;
  title: string;
  state: string;
  url: string;
  labels: string[];
  body: string;
};

export class TestScenarioPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'test_scenario' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;

    // requirements と design はオプショナル（Issue #405, #396）
    const requirementsReference = this.buildOptionalContext(
      'requirements',
      'requirements.md',
      '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。',
      issueInfo.number,
    );

    const designReference = this.buildOptionalContext(
      'design',
      'design.md',
      '設計ドキュメントは利用できません。Planning情報から設計を推測してください。',
      issueInfo.number,
    );

    // test_strategy もオプショナル（Issue #405）
    const testStrategy = this.metadata.data.design_decisions.test_strategy ??
      'テスト戦略は設定されていません。要件と設計から適切なテスト戦略を決定してください。';

    // Issue #47: executePhaseTemplate() を使用してコード削減
    // Issue #113: enableFallback: true を追加
    return this.executePhaseTemplate('test-scenario.md', {
      planning_document_path: this.getPlanningDocumentReference(issueInfo.number),
      requirements_document_path: requirementsReference,
      design_document_path: designReference,
      test_strategy: testStrategy,
      issue_info: this.formatIssueInfo(issueInfo),
      issue_number: String(issueInfo.number),
    }, {
      maxTurns: 60,
      enableFallback: true  // Issue #113: フォールバック機構を有効化
    });

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;
    const scenarioFile = path.join(this.outputDir, 'test-scenario.md');

    if (!fs.existsSync(scenarioFile)) {
      return {
        success: false,
        error: 'test-scenario.md が存在しません。execute() を先に実行してください。',
      };
    }

    const requirementsFile = this.getPhaseOutputFile('requirements', 'requirements.md', issueInfo.number);
    const designFile = this.getPhaseOutputFile('design', 'design.md', issueInfo.number);

    const scenarioReference = this.getAgentFileReference(scenarioFile);
    if (!scenarioReference) {
      return {
        success: false,
        error: 'Agent が test-scenario.md を参照できません。',
      };
    }

    // requirements と design はオプショナル（Issue #405）
    let requirementsReference: string;
    if (requirementsFile) {
      const ref = this.getAgentFileReference(requirementsFile);
      requirementsReference = ref ?? '要件定義書は利用できません。テストシナリオから要件を推測してレビューしてください。';
    } else {
      requirementsReference = '要件定義書は利用できません。テストシナリオから要件を推測してレビューしてください。';
    }

    let designReference: string;
    if (designFile) {
      const ref = this.getAgentFileReference(designFile);
      designReference = ref ?? '設計ドキュメントは利用できません。テストシナリオから設計を推測してレビューしてください。';
    } else {
      designReference = '設計ドキュメントは利用できません。テストシナリオから設計を推測してレビューしてください。';
    }

    const testStrategy = this.metadata.data.design_decisions.test_strategy ??
      'テスト戦略は設定されていません。テストシナリオ内容から適切なテスト観点でレビューしてください。';

    const reviewPrompt = this.loadPrompt('review')
      .replace('{test_scenario_document_path}', scenarioReference)
      .replace('{design_document_path}', designReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{test_strategy}', testStrategy);

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 30, logDir: this.reviewDir });
    const reviewResult = await this.contentParser.parseReviewResult(messages);

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, reviewResult.feedback, 'utf-8');

    await this.github.postReviewResult(
      issueInfo.number,
      this.phaseName,
      reviewResult.result,
      reviewResult.feedback,
      reviewResult.suggestions,
    );

    return {
      success: reviewResult.result !== 'FAIL',
      output: reviewResult.result,
      error: reviewResult.result === 'FAIL' ? reviewResult.feedback : undefined,
    };
  }

  public async revise(reviewFeedback: string): Promise<PhaseExecutionResult> {
    const issueInfo = (await this.getIssueInfo()) as IssueInfo;
    const scenarioFile = path.join(this.outputDir, 'test-scenario.md');

    if (!fs.existsSync(scenarioFile)) {
      return {
        success: false,
        error: 'test-scenario.md が存在しません。execute() を先に実行してください。',
      };
    }

    const requirementsFile = this.getPhaseOutputFile('requirements', 'requirements.md', issueInfo.number);
    const designFile = this.getPhaseOutputFile('design', 'design.md', issueInfo.number);

    const scenarioReference = this.getAgentFileReference(scenarioFile);
    if (!scenarioReference) {
      return {
        success: false,
        error: 'Agent が test-scenario.md を参照できません。',
      };
    }

    // requirements と design はオプショナル（Issue #405）
    let requirementsReference: string;
    if (requirementsFile) {
      const ref = this.getAgentFileReference(requirementsFile);
      requirementsReference = ref ?? '要件定義書は利用できません。テストシナリオから要件を推測してください。';
    } else {
      requirementsReference = '要件定義書は利用できません。テストシナリオから要件を推測してください。';
    }

    let designReference: string;
    if (designFile) {
      const ref = this.getAgentFileReference(designFile);
      designReference = ref ?? '設計ドキュメントは利用できません。テストシナリオから設計を推測してください。';
    } else {
      designReference = '設計ドキュメントは利用できません。テストシナリオから設計を推測してください。';
    }

    const testStrategy = this.metadata.data.design_decisions.test_strategy ??
      'テスト戦略は設定されていません。テストシナリオ内容から適切なテスト戦略を決定してください。';

    // Issue #113: 前回のログスニペットを取得
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');
    let previousLogSnippet = '';
    if (fs.existsSync(agentLogPath)) {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
      previousLogSnippet = agentLog.substring(0, 2000);  // 最初の2000文字
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{test_scenario_document_path}', scenarioReference)
      .replace('{design_document_path}', designReference)
      .replace('{requirements_document_path}', requirementsReference)
      .replace('{test_strategy}', testStrategy)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_number}', String(issueInfo.number))
      .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）');  // Issue #113

    logger.info(`Phase ${this.phaseName}: Starting revise with previous log snippet`);
    await this.executeWithAgent(revisePrompt, { maxTurns: 60, logDir: this.reviseDir });

    if (!fs.existsSync(scenarioFile)) {
      return {
        success: false,
        error: '改訂後の test-scenario.md を確認できませんでした。',
      };
    }

    return {
      success: true,
      output: scenarioFile,
    };
  }
}
