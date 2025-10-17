import fs from 'fs-extra';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

type PhaseOutputInfo = {
  path: string;
  exists: boolean;
};

type PhaseOutputMap = Record<string, PhaseOutputInfo>;

export class DocumentationPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'documentation' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const planningReference = this.getPlanningDocumentReference(issueNumber);

    // オプショナルコンテキストを構築（Issue #398）
    const implementationContext = this.buildOptionalContext(
      'implementation',
      'implementation.md',
      '実装ログは利用できません。リポジトリの実装内容を直接確認してください。',
      issueNumber,
    );

    const testingContext = this.buildOptionalContext(
      'testing',
      'test-result.md',
      'テスト結果は利用できません。実装内容に基づいてドキュメントを更新してください。',
      issueNumber,
    );

    // 参考情報（オプショナル）
    const requirementsContext = this.buildOptionalContext('requirements', 'requirements.md', '', issueNumber);
    const designContext = this.buildOptionalContext('design', 'design.md', '', issueNumber);
    const scenarioContext = this.buildOptionalContext('test_scenario', 'test-scenario.md', '', issueNumber);
    const testImplementationContext = this.buildOptionalContext(
      'test_implementation',
      'test-implementation.md',
      '',
      issueNumber,
    );

    const executePrompt = this.loadPrompt('execute')
      .replace('{planning_document_path}', planningReference)
      .replace('{implementation_context}', implementationContext)
      .replace('{testing_context}', testingContext)
      .replace('{requirements_context}', requirementsContext)
      .replace('{design_context}', designContext)
      .replace('{test_scenario_context}', scenarioContext)
      .replace('{test_implementation_context}', testImplementationContext)
      .replace('{issue_number}', String(issueNumber));

    await this.executeWithAgent(executePrompt, { maxTurns: 50 });

    const documentationFile = path.join(this.outputDir, 'documentation-update-log.md');
    if (!fs.existsSync(documentationFile)) {
      return {
        success: false,
        error: `documentation-update-log.md が見つかりません: ${documentationFile}`,
      };
    }

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
    // try {
    //   const content = fs.readFileSync(documentationFile, 'utf-8');
    //   await this.postOutput(content, 'ドキュメント更新ログ');
    // } catch (error) {
    //   const message = (error as Error).message ?? String(error);
    //   console.warn(`[WARNING] GitHub へのドキュメント更新ログ投稿に失敗しました: ${message}`);
    // }

    return {
      success: true,
      output: documentationFile,
    };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const documentationFile = path.join(this.outputDir, 'documentation-update-log.md');

    if (!fs.existsSync(documentationFile)) {
      return {
        success: false,
        error: 'documentation-update-log.md が存在しません。execute() を先に実行してください。',
      };
    }

    const reviewPrompt = this.buildPrompt('review', issueNumber, documentationFile);

    const messages = await this.executeWithAgent(reviewPrompt, { maxTurns: 50, logDir: this.reviewDir });
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
    const documentationFile = path.join(this.outputDir, 'documentation-update-log.md');

    if (!fs.existsSync(documentationFile)) {
      return {
        success: false,
        error: 'documentation-update-log.md が存在しません。execute() を先に実行してください。',
      };
    }

    const revisePrompt = this.buildPrompt('revise', issueNumber, documentationFile).replace(
      '{review_feedback}',
      reviewFeedback,
    );

    await this.executeWithAgent(revisePrompt, { maxTurns: 50, logDir: this.reviseDir });

    if (!fs.existsSync(documentationFile)) {
      return {
        success: false,
        error: '改訂後の documentation-update-log.md を確認できませんでした。',
      };
    }

    return {
      success: true,
      output: documentationFile,
    };
  }

  private buildPrompt(
    promptType: 'review' | 'revise',
    issueNumber: number,
    documentationPath: string,
  ): string {
    const planningReference = this.getPlanningDocumentReference(issueNumber);
    const documentationReference = this.getAgentFileReference(documentationPath);

    if (!documentationReference) {
      throw new Error(`Failed to compute reference path for ${documentationPath}`);
    }

    // オプショナルコンテキストを構築（Issue #398）
    const implementationContext = this.buildOptionalContext(
      'implementation',
      'implementation.md',
      '',
      issueNumber,
    );
    const testingContext = this.buildOptionalContext('testing', 'test-result.md', '', issueNumber);
    const requirementsContext = this.buildOptionalContext('requirements', 'requirements.md', '', issueNumber);
    const designContext = this.buildOptionalContext('design', 'design.md', '', issueNumber);
    const scenarioContext = this.buildOptionalContext('test_scenario', 'test-scenario.md', '', issueNumber);
    const testImplementationContext = this.buildOptionalContext(
      'test_implementation',
      'test-implementation.md',
      '',
      issueNumber,
    );

    return this.loadPrompt(promptType)
      .replace('{planning_document_path}', planningReference)
      .replace('{documentation_update_log_path}', documentationReference)
      .replace('{implementation_context}', implementationContext)
      .replace('{testing_context}', testingContext)
      .replace('{requirements_context}', requirementsContext)
      .replace('{design_context}', designContext)
      .replace('{test_scenario_context}', scenarioContext)
      .replace('{test_implementation_context}', testImplementationContext)
      .replace('{issue_number}', String(issueNumber));
  }
}
