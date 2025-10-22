import fs from 'fs-extra';
import path from 'node:path';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

export class TestingPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'testing' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const planningReference = this.getPlanningDocumentReference(issueNumber);

    // オプショナルコンテキストを構築（Issue #398）
    const testImplementationContext = this.buildOptionalContext(
      'test_implementation',
      'test-implementation.md',
      'テストコード実装ログは利用できません。実装コードを直接確認してテストを実行してください。',
      issueNumber,
    );

    const implementationContext = this.buildOptionalContext(
      'implementation',
      'implementation.md',
      '実装ログは利用できません。リポジトリの実装コードを直接確認してください。',
      issueNumber,
    );

    const scenarioContext = this.buildOptionalContext(
      'test_scenario',
      'test-scenario.md',
      'テストシナリオは利用できません。実装内容に基づいて適切なテストを実施してください。',
      issueNumber,
    );

    const testResultFile = path.join(this.outputDir, 'test-result.md');
    const oldMtime = fs.existsSync(testResultFile) ? fs.statSync(testResultFile).mtimeMs : null;
    const oldSize = fs.existsSync(testResultFile) ? fs.statSync(testResultFile).size : null;

    const executePrompt = this.loadPrompt('execute')
      .replace('{planning_document_path}', planningReference)
      .replace('{test_implementation_context}', testImplementationContext)
      .replace('{implementation_context}', implementationContext)
      .replace('{test_scenario_context}', scenarioContext)
      .replace('{issue_number}', String(issueNumber));

    await this.executeWithAgent(executePrompt, { maxTurns: 50 });

    if (!fs.existsSync(testResultFile)) {
      return {
        success: false,
        error: `test-result.md が見つかりません: ${testResultFile}`,
      };
    }

    // ファイルが既に存在していた場合のみ、更新をチェック（mtime & size）
    const newMtime = fs.statSync(testResultFile).mtimeMs;
    const newSize = fs.statSync(testResultFile).size;

    if (oldMtime !== null && oldSize !== null && newMtime === oldMtime && newSize === oldSize) {
      return {
        success: false,
        error: 'test-result.md が更新されていません。出力内容を確認してください。',
      };
    }

    return {
      success: true,
      output: testResultFile,
    };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueNumber = parseInt(this.metadata.data.issue_number, 10);
    const testResultFile = path.join(this.outputDir, 'test-result.md');

    if (!fs.existsSync(testResultFile)) {
      return {
        success: false,
        error: 'test-result.md が存在しません。execute() を先に実行してください。',
      };
    }

    const testImplementationFile = this.getPhaseOutputFile(
      'test_implementation',
      'test-implementation.md',
      issueNumber,
    );
    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);
    const scenarioFile = this.getPhaseOutputFile('test_scenario', 'test-scenario.md', issueNumber);

    const testResultRef = this.getAgentFileReference(testResultFile);
    if (!testResultRef) {
      return {
        success: false,
        error: 'Agent が test-result.md を参照できません。',
      };
    }

    // test_implementation, implementation, scenario はオプショナル（Issue #405）
    let testImplementationRef: string;
    if (testImplementationFile) {
      const ref = this.getAgentFileReference(testImplementationFile);
      testImplementationRef = ref ?? 'テストコード実装ログは利用できません。テスト結果から実装を推測してレビューしてください。';
    } else {
      testImplementationRef = 'テストコード実装ログは利用できません。テスト結果から実装を推測してレビューしてください。';
    }

    let implementationRef: string;
    if (implementationFile) {
      const ref = this.getAgentFileReference(implementationFile);
      implementationRef = ref ?? '実装ログは利用できません。テスト結果から実装を推測してレビューしてください。';
    } else {
      implementationRef = '実装ログは利用できません。テスト結果から実装を推測してレビューしてください。';
    }

    let scenarioRef: string;
    if (scenarioFile) {
      const ref = this.getAgentFileReference(scenarioFile);
      scenarioRef = ref ?? 'テストシナリオは利用できません。テスト結果から適切なテスト観点でレビューしてください。';
    } else {
      scenarioRef = 'テストシナリオは利用できません。テスト結果から適切なテスト観点でレビューしてください。';
    }

    const reviewPrompt = this.loadPrompt('review')
      .replace('{test_result_document_path}', testResultRef)
      .replace('{test_implementation_document_path}', testImplementationRef)
      .replace('{implementation_document_path}', implementationRef)
      .replace('{test_scenario_document_path}', scenarioRef);

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
    const testResultFile = path.join(this.outputDir, 'test-result.md');

    if (!fs.existsSync(testResultFile)) {
      return {
        success: false,
        error: 'test-result.md が存在しません。execute() を先に実行してください。',
      };
    }

    const testImplementationFile = this.getPhaseOutputFile(
      'test_implementation',
      'test-implementation.md',
      issueNumber,
    );
    const implementationFile = this.getPhaseOutputFile('implementation', 'implementation.md', issueNumber);
    const scenarioFile = this.getPhaseOutputFile('test_scenario', 'test-scenario.md', issueNumber);

    const testResultRef = this.getAgentFileReference(testResultFile);
    if (!testResultRef) {
      return {
        success: false,
        error: 'Agent が test-result.md を参照できません。',
      };
    }

    // test_implementation, implementation, scenario はオプショナル（Issue #405）
    let testImplementationRef: string;
    if (testImplementationFile) {
      const ref = this.getAgentFileReference(testImplementationFile);
      testImplementationRef = ref ?? 'テストコード実装ログは利用できません。テスト結果から実装を推測してください。';
    } else {
      testImplementationRef = 'テストコード実装ログは利用できません。テスト結果から実装を推測してください。';
    }

    let implementationRef: string;
    if (implementationFile) {
      const ref = this.getAgentFileReference(implementationFile);
      implementationRef = ref ?? '実装ログは利用できません。テスト結果から実装を推測してください。';
    } else {
      implementationRef = '実装ログは利用できません。テスト結果から実装を推測してください。';
    }

    let scenarioRef: string;
    if (scenarioFile) {
      const ref = this.getAgentFileReference(scenarioFile);
      scenarioRef = ref ?? 'テストシナリオは利用できません。テスト結果から適切なテスト観点で修正してください。';
    } else {
      scenarioRef = 'テストシナリオは利用できません。テスト結果から適切なテスト観点で修正してください。';
    }

    const revisePrompt = this.loadPrompt('revise')
      .replace('{test_result_document_path}', testResultRef)
      .replace('{test_implementation_document_path}', testImplementationRef)
      .replace('{implementation_document_path}', implementationRef)
      .replace('{test_scenario_document_path}', scenarioRef)
      .replace('{review_feedback}', reviewFeedback)
      .replace('{issue_number}', String(issueNumber));

    // revise() ではファイルは必ず存在する（execute() 完了後に呼ばれる）
    const oldMtime = fs.statSync(testResultFile).mtimeMs;
    const oldSize = fs.statSync(testResultFile).size;

    await this.executeWithAgent(revisePrompt, { maxTurns: 50, logDir: this.reviseDir });

    if (!fs.existsSync(testResultFile)) {
      return {
        success: false,
        error: '改訂後の test-result.md を確認できませんでした。',
      };
    }

    const newMtime = fs.statSync(testResultFile).mtimeMs;
    const newSize = fs.statSync(testResultFile).size;

    if (newMtime === oldMtime && newSize === oldSize) {
      return {
        success: false,
        error: 'test-result.md が更新されていません。再度実行内容を確認してください。',
      };
    }

    return {
      success: true,
      output: testResultFile,
    };
  }
}
