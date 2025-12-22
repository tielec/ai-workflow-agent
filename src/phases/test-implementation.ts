import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

export class TestImplementationPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'test_implementation' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);

    // オプショナルコンテキストを構築（Issue #398, #396）
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

    const scenarioContext = this.buildOptionalContext(
      'test_scenario',
      'test-scenario.md',
      'テストシナリオは利用できません。実装時に適切なテスト考慮を行ってください。',
      issueNumber,
    );

    const implementationContext = this.buildOptionalContext(
      'implementation',
      'implementation.md',
      '実装ログは利用できません。設計書とテストシナリオに基づいて実装してください。',
      issueNumber,
    );

    // test_strategy と test_code_strategy もオプショナル（Issue #405）
    const testStrategy = this.metadata.data.design_decisions.test_strategy ??
      'テスト戦略は設定されていません。設計書とテストシナリオから適切なテスト戦略を決定してください。';
    const testCodeStrategy = this.metadata.data.design_decisions.test_code_strategy ??
      'テストコード方針は設定されていません。プロジェクトの規約とテスト戦略から適切なテストコード方針を決定してください。';

    // Issue #47: executePhaseTemplate() を使用してコード削減
    return this.executePhaseTemplate('test-implementation.md', {
      planning_document_path: this.getPlanningDocumentReference(issueNumber),
      requirements_context: requirementsContext,
      design_context: designContext,
      test_scenario_context: scenarioContext,
      implementation_context: implementationContext,
      test_strategy: testStrategy,
      test_code_strategy: testCodeStrategy,
      issue_number: String(issueNumber),
    }, { maxTurns: 80 });

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const testImplementationFile = path.join(this.outputDir, 'test-implementation.md');

    if (!fs.existsSync(testImplementationFile)) {
      return {
        success: false,
        error: 'test-implementation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const planningReference = this.getPlanningDocumentReference(issueNumber);
    const designFile = this.getPhaseOutputFile('design', 'design.md', issueNumber);
    const scenarioFile = this.getPhaseOutputFile('test_scenario', 'test-scenario.md', issueNumber);
    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);

    const testImplementationReference = this.getAgentFileReference(testImplementationFile);
    if (!testImplementationReference) {
      return {
        success: false,
        error: 'Agent が test-implementation.md を参照できません。',
      };
    }

    // design, scenario, implementation はオプショナル（Issue #405）
    let designReference: string;
    if (designFile) {
      const ref = this.getAgentFileReference(designFile);
      designReference = ref ?? '設計ドキュメントは利用できません。テストコード実装内容から設計を推測してレビューしてください。';
    } else {
      designReference = '設計ドキュメントは利用できません。テストコード実装内容から設計を推測してレビューしてください。';
    }

    let scenarioReference: string;
    if (scenarioFile) {
      const ref = this.getAgentFileReference(scenarioFile);
      scenarioReference = ref ?? 'テストシナリオは利用できません。テストコード実装内容から適切なテスト観点でレビューしてください。';
    } else {
      scenarioReference = 'テストシナリオは利用できません。テストコード実装内容から適切なテスト観点でレビューしてください。';
    }

    let implementationReference: string;
    if (implementationFile) {
      const ref = this.getAgentFileReference(implementationFile);
      implementationReference = ref ?? '実装ログは利用できません。テストコード実装内容から実装を推測してレビューしてください。';
    } else {
      implementationReference = '実装ログは利用できません。テストコード実装内容から実装を推測してレビューしてください。';
    }

    const testStrategy = this.metadata.data.design_decisions.test_strategy ??
      'テスト戦略は設定されていません。テストコード実装内容から適切なテスト観点でレビューしてください。';
    const testCodeStrategy = this.metadata.data.design_decisions.test_code_strategy ??
      'テストコード方針は設定されていません。プロジェクトの規約に基づいてレビューしてください。';

    const reviewPrompt = this.loadPrompt('review')
      .replace('{planning_document_path}', planningReference)
      .replace('{test_implementation_document_path}', testImplementationReference)
      .replace('{design_document_path}', designReference)
      .replace('{test_scenario_document_path}', scenarioReference)
      .replace('{implementation_document_path}', implementationReference)
      .replace('{test_strategy}', testStrategy)
      .replace('{test_code_strategy}', testCodeStrategy);

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
    const testImplementationFile = path.join(this.outputDir, 'test-implementation.md');

    if (!fs.existsSync(testImplementationFile)) {
      return {
        success: false,
        error: 'test-implementation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const designFile = this.getPhaseOutputFile('design', 'design.md', issueNumber);
    const scenarioFile = this.getPhaseOutputFile('test_scenario', 'test-scenario.md', issueNumber);
    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);

    const testImplementationReference = this.getAgentFileReference(testImplementationFile);
    if (!testImplementationReference) {
      return {
        success: false,
        error: 'Agent が test-implementation.md を参照できません。',
      };
    }

    // design, scenario, implementation はオプショナル（Issue #405）
    let designReference: string;
    if (designFile) {
      const ref = this.getAgentFileReference(designFile);
      designReference = ref ?? '設計ドキュメントは利用できません。テストコード実装内容から設計を推測してください。';
    } else {
      designReference = '設計ドキュメントは利用できません。テストコード実装内容から設計を推測してください。';
    }

    let scenarioReference: string;
    if (scenarioFile) {
      const ref = this.getAgentFileReference(scenarioFile);
      scenarioReference = ref ?? 'テストシナリオは利用できません。テストコード実装内容から適切なテスト観点で修正してください。';
    } else {
      scenarioReference = 'テストシナリオは利用できません。テストコード実装内容から適切なテスト観点で修正してください。';
    }

    let implementationReference: string;
    if (implementationFile) {
      const ref = this.getAgentFileReference(implementationFile);
      implementationReference = ref ?? '実装ログは利用できません。テストコード実装内容から実装を推測してください。';
    } else {
      implementationReference = '実装ログは利用できません。テストコード実装内容から実装を推測してください。';
    }

    const testStrategy = this.metadata.data.design_decisions.test_strategy ??
      'テスト戦略は設定されていません。テストコード実装内容から適切なテスト戦略を決定してください。';
    const testCodeStrategy = this.metadata.data.design_decisions.test_code_strategy ??
      'テストコード方針は設定されていません。プロジェクトの規約とテスト戦略から適切なテストコード方針を決定してください。';

    const revisePrompt = this.loadPrompt('revise')
      .replace('{test_implementation_document_path}', testImplementationReference)
      .replace('{design_document_path}', designReference)
      .replace('{test_scenario_document_path}', scenarioReference)
      .replace('{implementation_document_path}', implementationReference)
      .replace('{test_strategy}', testStrategy)
      .replace('{test_code_strategy}', testCodeStrategy)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_number}', String(issueNumber));

    await this.executeWithAgent(revisePrompt, { maxTurns: 80, logDir: this.reviseDir });

    if (!fs.existsSync(testImplementationFile)) {
      return {
        success: false,
        error: '改訂後の test-implementation.md を確認できませんでした。',
      };
    }

    return {
      success: true,
      output: testImplementationFile,
    };
  }
}
