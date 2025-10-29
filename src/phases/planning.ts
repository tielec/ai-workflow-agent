import path from 'node:path';
import { logger } from '../utils/logger.js';
import fs from 'fs-extra';
import { BasePhase, type PhaseInitializationParams } from './base-phase.js';
import { PhaseExecutionResult } from '../types.js';

export class PlanningPhase extends BasePhase {
  constructor(params: PhaseInitializationParams) {
    super({ ...params, phaseName: 'planning' });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    const issueInfo = await this.getIssueInfo();

    // Issue #47: executePhaseTemplate() を使用してコード削減
    const result = await this.executePhaseTemplate('planning.md', {
      issue_info: this.formatIssueInfo(issueInfo),
      issue_number: issueInfo.number.toString(),
    }, { maxTurns: 50 });

    // 特殊ロジック: 設計決定の抽出（Planning Phase 特有のロジック）
    if (result.success && result.output) {
      const content = fs.readFileSync(result.output, 'utf-8');
      const decisions = await this.contentParser.extractDesignDecisions(content);
      if (Object.keys(decisions).length) {
        for (const [key, value] of Object.entries(decisions)) {
          this.metadata.setDesignDecision(key, value);
        }
      }
    }

    // Phase outputはPRに含まれるため、Issue投稿は不要（Review resultのみ投稿）
    // await this.postOutput(content, '企画フェーズ成果');

    return result;
  }

  protected async review(): Promise<PhaseExecutionResult> {
    const issueInfo = await this.getIssueInfo();
    const planningFile = path.join(this.outputDir, 'planning.md');

    if (!fs.existsSync(planningFile)) {
      return {
        success: false,
        error: 'planning.md が存在しません。',
      };
    }

    const reviewTemplate = this.loadPrompt('review');
    const prompt = reviewTemplate
      .replace('{issue_number}', issueInfo.number.toString())
      .replace('{issue_info}', this.formatIssueInfo(issueInfo))
      .replace('{planning_document_path}', `@${path.relative(this.workingDir, planningFile)}`);

    const messages = await this.executeWithAgent(prompt, { maxTurns: 50, logDir: this.reviewDir });
    const parsed = await this.contentParser.parseReviewResult(messages);

    await this.github.postReviewResult(
      issueInfo.number,
      this.phaseName,
      parsed.result,
      parsed.feedback,
      parsed.suggestions,
    );

    const reviewFile = path.join(this.reviewDir, 'result.md');
    fs.writeFileSync(reviewFile, parsed.feedback, 'utf-8');

    return {
      success: parsed.result !== 'FAIL',
      output: parsed.result,
    };
  }

}
