import * as fs from 'node:fs';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

export class TestPreparationPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'test_preparation' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);

    const testImplementationContext = this.buildOptionalContext(
      'test_implementation',
      'test-implementation.md',
      'テストコード実装ログは利用できません。実装コードとリポジトリ構成から環境準備を行ってください。',
      issueNumber,
    );

    const implementationContext = this.buildOptionalContext(
      'implementation',
      'implementation.md',
      '実装ログは利用できません。リポジトリの実装内容を直接確認して環境準備を行ってください。',
      issueNumber,
    );

    return this.executePhaseTemplate('test-preparation.md', {
      planning_document_path: this.getPlanningDocumentReference(issueNumber),
      test_implementation_context: testImplementationContext,
      implementation_context: implementationContext,
      issue_number: String(issueNumber),
    }, { maxTurns: 80, enableFallback: true });
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const testPreparationFile = path.join(this.outputDir, 'test-preparation.md');

    if (!fs.existsSync(testPreparationFile)) {
      return {
        success: false,
        error: 'test-preparation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const planningReference = this.getPlanningDocumentReference(issueNumber);
    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);
    const testImplementationFile = this.getPhaseOutputFile(
      'test_implementation',
      'test-implementation.md',
      issueNumber,
    );

    const testPreparationReference = this.getAgentFileReference(testPreparationFile);
    if (!testPreparationReference) {
      return {
        success: false,
        error: 'Agent が test-preparation.md を参照できません。',
      };
    }

    let implementationReference: string;
    if (implementationFile) {
      const ref = this.getAgentFileReference(implementationFile);
      implementationReference = ref ?? '実装ログは利用できません。テスト準備内容から実装を推測してレビューしてください。';
    } else {
      implementationReference = '実装ログは利用できません。テスト準備内容から実装を推測してレビューしてください。';
    }

    let testImplementationReference: string;
    if (testImplementationFile) {
      const ref = this.getAgentFileReference(testImplementationFile);
      testImplementationReference = ref ?? 'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測してレビューしてください。';
    } else {
      testImplementationReference = 'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測してレビューしてください。';
    }

    const reviewPrompt = this.loadPrompt('review')
      .replace('{planning_document_path}', planningReference)
      .replace('{test_preparation_document_path}', testPreparationReference)
      .replace('{implementation_document_path}', implementationReference)
      .replace('{test_implementation_document_path}', testImplementationReference);

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
      this.metadata,
    );

    return {
      success: reviewResult.result !== 'FAIL',
      output: reviewResult.result,
      error: reviewResult.result === 'FAIL' ? reviewResult.feedback : undefined,
    };
  }

  public async revise(reviewFeedback: string): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const testPreparationFile = path.join(this.outputDir, 'test-preparation.md');

    if (!fs.existsSync(testPreparationFile)) {
      return {
        success: false,
        error: 'test-preparation.md が存在しません。execute() を先に実行してください。',
      };
    }

    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);
    const testImplementationFile = this.getPhaseOutputFile(
      'test_implementation',
      'test-implementation.md',
      issueNumber,
    );

    const testPreparationReference = this.getAgentFileReference(testPreparationFile);
    if (!testPreparationReference) {
      return {
        success: false,
        error: 'Agent が test-preparation.md を参照できません。',
      };
    }

    let implementationReference: string;
    if (implementationFile) {
      const ref = this.getAgentFileReference(implementationFile);
      implementationReference = ref ?? '実装ログは利用できません。テスト準備内容から実装を推測して修正してください。';
    } else {
      implementationReference = '実装ログは利用できません。テスト準備内容から実装を推測して修正してください。';
    }

    let testImplementationReference: string;
    if (testImplementationFile) {
      const ref = this.getAgentFileReference(testImplementationFile);
      testImplementationReference = ref ?? 'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測して修正してください。';
    } else {
      testImplementationReference = 'テストコード実装ログは利用できません。テスト準備内容からテスト方針を推測して修正してください。';
    }

    const oldContent = fs.readFileSync(testPreparationFile, 'utf-8');

    const revisePrompt = this.loadPrompt('revise')
      .replace('{test_preparation_document_path}', testPreparationReference)
      .replace('{implementation_document_path}', implementationReference)
      .replace('{test_implementation_document_path}', testImplementationReference)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_number}', String(issueNumber));

    await this.executeWithAgent(revisePrompt, { maxTurns: 80, logDir: this.reviseDir });

    if (!fs.existsSync(testPreparationFile)) {
      return {
        success: false,
        error: '改訂後の test-preparation.md を確認できませんでした。',
      };
    }

    const newContent = fs.readFileSync(testPreparationFile, 'utf-8');

    if (newContent === oldContent) {
      return {
        success: false,
        error: 'test-preparation.md が更新されていません。レビュー指摘を反映してください。',
      };
    }

    return {
      success: true,
      output: testPreparationFile,
    };
  }
}
