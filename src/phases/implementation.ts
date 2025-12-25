import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

export class ImplementationPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'implementation' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);

    // オプショナルコンテキストを構築（Issue #396）
    const requirementsContext = this.buildOptionalContext(
      'requirements',
      'requirements.md',
      '要件定義書は利用できません。Planning情報とIssue情報から要件を推測してください。',
      issueNumber,
    );

    const designContext = this.buildOptionalContext(
      'design',
      'design.md',
      '設計書は利用できません。Issue情報とPlanning情報に基づいて適切な設計判断を行ってください。',
      issueNumber,
    );

    const testScenarioContext = this.buildOptionalContext(
      'test_scenario',
      'test-scenario.md',
      'テストシナリオは利用できません。実装時に適切なテスト考慮を行ってください。',
      issueNumber,
    );

    const designDecisions =
      this.metadata.data.design_decisions ??
      {
        implementation_strategy: null,
        test_strategy: null,
        test_code_strategy: null,
      };
    if (!this.metadata.data.design_decisions) {
      this.metadata.data.design_decisions = designDecisions;
    }

    const implementationStrategy =
      designDecisions.implementation_strategy ??
      '実装方針は利用できません。Issue情報とPlanning情報に基づいて適切な実装アプローチを決定してください。';

    // Issue #47: executePhaseTemplate() を使用してコード削減
    // Issue #113: enableFallback: true を追加
    return this.executePhaseTemplate('implementation.md', {
      planning_document_path: this.getPlanningDocumentReference(issueNumber),
      requirements_context: requirementsContext,
      design_context: designContext,
      test_scenario_context: testScenarioContext,
      implementation_strategy: implementationStrategy,
      issue_number: String(issueNumber),
    }, {
      maxTurns: 100,
      enableFallback: true  // Issue #113: フォールバック機構を有効化
    });

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const implementationFile = path.join(this.outputDir, 'implementation.md');

    if (!fs.existsSync(implementationFile)) {
      return {
        success: false,
        error: 'implementation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const planningReference = this.getPlanningDocumentReference(issueNumber);
    const designFile = this.getPhaseOutputFile('design', 'design.md', issueNumber);
    const scenarioFile = this.getPhaseOutputFile('test_scenario', 'test-scenario.md', issueNumber);

    const implementationReference = this.getAgentFileReference(implementationFile);
    if (!implementationReference) {
      return {
        success: false,
        error: 'Agent が implementation.md を参照できません。',
      };
    }

    // design と test_scenario はオプショナル（Issue #405）
    let designReference: string;
    let scenarioReference: string;

    if (designFile) {
      const ref = this.getAgentFileReference(designFile);
      designReference = ref ?? '設計書は利用できません。実装内容から設計を推測してレビューしてください。';
    } else {
      designReference = '設計書は利用できません。実装内容から設計を推測してレビューしてください。';
    }

    if (scenarioFile) {
      const ref = this.getAgentFileReference(scenarioFile);
      scenarioReference = ref ?? 'テストシナリオは利用できません。実装内容から適切なテスト観点でレビューしてください。';
    } else {
      scenarioReference = 'テストシナリオは利用できません。実装内容から適切なテスト観点でレビューしてください。';
    }

    const implementationStrategy =
      this.metadata.data.design_decisions.implementation_strategy ??
      '実装方針は利用できません。実装内容とPlanning情報から推測してください。';

    const reviewPrompt = this.loadPrompt('review')
      .replace('{planning_document_path}', planningReference)
      .replace('{implementation_document_path}', implementationReference)
      .replace('{design_document_path}', designReference)
      .replace('{test_scenario_document_path}', scenarioReference)
      .replace('{implementation_strategy}', implementationStrategy);

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 30, logDir: this.reviewDir });
    const reviewResult = await this.contentParser.parseReviewResult(messages);

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, reviewResult.feedback, 'utf-8');

    await this.github.postReviewResult(
      issueNumber,
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
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const implementationFile = path.join(this.outputDir, 'implementation.md');

    if (!fs.existsSync(implementationFile)) {
      return {
        success: false,
        error: 'implementation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const designFile = this.getPhaseOutputFile('design', 'design.md', issueNumber);
    const scenarioFile = this.getPhaseOutputFile('test_scenario', 'test-scenario.md', issueNumber);

    const implementationReference = this.getAgentFileReference(implementationFile);
    if (!implementationReference) {
      return {
        success: false,
        error: 'Agent が implementation.md を参照できません。',
      };
    }

    // design と test_scenario はオプショナル（Issue #405）
    let designReference: string;
    let scenarioReference: string;

    if (designFile) {
      const ref = this.getAgentFileReference(designFile);
      designReference = ref ?? '設計書は利用できません。実装内容から設計を推測してください。';
    } else {
      designReference = '設計書は利用できません。実装内容から設計を推測してください。';
    }

    if (scenarioFile) {
      const ref = this.getAgentFileReference(scenarioFile);
      scenarioReference = ref ?? 'テストシナリオは利用できません。実装内容から適切なテスト観点で修正してください。';
    } else {
      scenarioReference = 'テストシナリオは利用できません。実装内容から適切なテスト観点で修正してください。';
    }

    const implementationStrategy =
      this.metadata.data.design_decisions.implementation_strategy ??
      '実装方針は利用できません。実装内容とPlanning情報から推測してください。';

    // Issue #113: 前回のログスニペットを取得
    const agentLogPath = path.join(this.executeDir, 'agent_log.md');
    let previousLogSnippet = '';
    if (fs.existsSync(agentLogPath)) {
      const agentLog = fs.readFileSync(agentLogPath, 'utf-8');
      previousLogSnippet = agentLog.substring(0, 2000);  // 最初の2000文字
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{implementation_document_path}', implementationReference)
      .replace('{design_document_path}', designReference)
      .replace('{test_scenario_document_path}', scenarioReference)
      .replace('{implementation_strategy}', implementationStrategy)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_number}', String(issueNumber))
      .replace('{previous_log_snippet}', previousLogSnippet || '（ログなし）');  // Issue #113

    logger.info(`Phase ${this.phaseName}: Starting revise with previous log snippet`);
    await this.executeWithAgent(revisePrompt, { maxTurns: 100, logDir: this.reviseDir });

    if (!fs.existsSync(implementationFile)) {
      return {
        success: false,
        error: '改訂後の implementation.md を確認できませんでした。',
      };
    }

    return {
      success: true,
      output: implementationFile,
    };
  }
}
