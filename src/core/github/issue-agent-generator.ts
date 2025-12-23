/**
 * IssueAgentGenerator - エージェントベースFOLLOW-UP Issue生成クラス
 *
 * ファイルベース出力方式により、Codex/Claude Agentを使用して
 * 詳細なFOLLOW-UP Issue本文を生成します。
 *
 * @module issue-agent-generator
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import { DEFAULT_CODEX_MODEL, resolveCodexModel } from '../codex-agent-client.js';
import type { CodexAgentClient } from '../codex-agent-client.js';
import type { ClaudeAgentClient } from '../claude-agent-client.js';
import type { RemainingTask, IssueContext } from '../../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * FOLLOW-UP Issue生成コンテキスト
 */
export interface FollowUpContext {
  remainingTasks: RemainingTask[];
  issueContext: IssueContext;
  issueNumber: number;
  evaluationReportPath: string;
}

/**
 * 生成されたIssue
 */
export interface GeneratedIssue {
  title: string;
  body: string;
  success: boolean;
  error?: string;
}

export class IssueAgentGenerator {
  private readonly codexClient: CodexAgentClient | null;
  private readonly claudeClient: ClaudeAgentClient | null;

  /**
   * コンストラクタ
   *
   * @param codexClient - Codexエージェントクライアント（nullの場合は使用不可）
   * @param claudeClient - Claudeエージェントクライアント（nullの場合は使用不可）
   */
  constructor(
    codexClient: CodexAgentClient | null,
    claudeClient: ClaudeAgentClient | null,
  ) {
    this.codexClient = codexClient;
    this.claudeClient = claudeClient;
  }

  /**
   * FOLLOW-UP Issueを生成
   *
   * @param context - FOLLOW-UP Issue生成コンテキスト
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param model - 使用モデル（未指定時は DEFAULT_CODEX_MODEL を使用）
   * @returns 生成されたIssue
   */
  public async generate(
    context: FollowUpContext,
    agent: 'auto' | 'codex' | 'claude',
    model?: string,
  ): Promise<GeneratedIssue> {
    logger.info(`Generating follow-up issue for #${context.issueNumber} with agent mode`);

    // 1. プロンプトテンプレートを読み込み
    const promptPath = path.resolve(
      __dirname,
      '../../prompts/followup/generate-followup-issue.txt',
    );
    if (!fs.existsSync(promptPath)) {
      return {
        success: false,
        title: '',
        body: '',
        error: `Prompt template not found: ${promptPath}`,
      };
    }

    const template = fs.readFileSync(promptPath, 'utf-8');

    // 2. 出力ファイルパスを生成
    const outputFilePath = this.generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    // 3. プロンプト変数を置換
    const prompt = this.buildPrompt(template, context, outputFilePath);

    // 4. エージェントを選択
    let selectedAgent = agent;

    if (agent === 'codex' || agent === 'auto') {
      if (!this.codexClient) {
        if (agent === 'codex') {
          return {
            success: false,
            title: '',
            body: '',
            error: 'Codex agent is not available.',
          };
        }
        logger.warn('Codex not available, falling back to Claude.');
        selectedAgent = 'claude';
      } else {
        try {
          logger.info('Using Codex agent for follow-up issue generation.');
          const resolvedModel = model ? resolveCodexModel(model) : DEFAULT_CODEX_MODEL;
          logger.debug(`Using model for Codex agent: ${resolvedModel}`);
          await this.codexClient.executeTask({ prompt, model: resolvedModel });
        } catch (error) {
          if (agent === 'codex') {
            return {
              success: false,
              title: '',
              body: '',
              error: `Codex failed: ${getErrorMessage(error)}`,
            };
          }
          logger.warn(`Codex failed, falling back to Claude.`);
          selectedAgent = 'claude';
        }
      }
    }

    if (selectedAgent === 'claude') {
      if (!this.claudeClient) {
        return {
          success: false,
          title: '',
          body: '',
          error: 'Claude agent is not available.',
        };
      }
      logger.info('Using Claude agent for follow-up issue generation.');
      await this.claudeClient.executeTask({ prompt });
    }

    // 5. 出力ファイルからIssue本文を読み込み
    const issueBody = this.readOutputFile(outputFilePath, context);

    // 6. 一時ファイルをクリーンアップ
    this.cleanupOutputFile(outputFilePath);

    // 7. タイトル生成（残タスクのキーワードから自動生成）
    const title = this.generateTitle(context.issueNumber, context.remainingTasks);

    return {
      success: true,
      title,
      body: issueBody,
    };
  }

  /**
   * 出力ファイルパスを生成
   *
   * @returns 一時ディレクトリ内のユニークなファイルパス
   */
  private generateOutputFilePath(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return path.join(os.tmpdir(), `followup-issue-${timestamp}-${random}.md`);
  }

  /**
   * プロンプトを構築
   *
   * @param template - プロンプトテンプレート
   * @param context - FOLLOW-UP Issue生成コンテキスト
   * @param outputFilePath - 出力ファイルパス
   * @returns 変数置換済みプロンプト
   */
  private buildPrompt(
    template: string,
    context: FollowUpContext,
    outputFilePath: string,
  ): string {
    return template
      .replaceAll('{remaining_tasks_json}', JSON.stringify(context.remainingTasks, null, 2))
      .replaceAll('{issue_context_json}', JSON.stringify(context.issueContext, null, 2))
      .replaceAll('{evaluation_report_path}', `@${context.evaluationReportPath}`)
      .replaceAll('{output_file_path}', outputFilePath)
      .replaceAll('{issue_number}', String(context.issueNumber));
  }

  /**
   * 出力ファイルからIssue本文を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @param context - FOLLOW-UP Issue生成コンテキスト（フォールバック用）
   * @returns Markdown形式のIssue本文
   */
  private readOutputFile(filePath: string, context: FollowUpContext): string {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Using fallback template.`);
      return this.createFallbackBody(context);
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      // 内容が空の場合はフォールバック
      if (!content) {
        logger.warn('Output file is empty. Using fallback template.');
        return this.createFallbackBody(context);
      }

      // 最低限の検証: 必須セクションが含まれているか
      if (!this.isValidIssueContent(content)) {
        logger.warn('Output file does not contain required sections. Using fallback template.');
        return this.createFallbackBody(context);
      }

      logger.info('Successfully read follow-up issue body from output file.');
      return content;
    } catch (error) {
      logger.error(`Failed to read output file: ${getErrorMessage(error)}`);
      return this.createFallbackBody(context);
    }
  }

  /**
   * Issue本文の妥当性検証
   *
   * @param content - Issue本文
   * @returns 妥当な場合はtrue
   */
  private isValidIssueContent(content: string): boolean {
    // 必須セクションの存在チェック
    const requiredSections = ['## 背景', '## 目的', '## 実行内容', '## 受け入れ基準', '## 参考情報'];
    for (const section of requiredSections) {
      if (!content.includes(section)) {
        logger.warn(`Missing required section: ${section}`);
        return false;
      }
    }

    // 最小文字数チェック（100文字以上）
    if (content.length < 100) {
      logger.warn(`Content too short: ${content.length} chars`);
      return false;
    }

    return true;
  }

  /**
   * フォールバック用のIssue本文を生成
   *
   * @param context - FOLLOW-UP Issue生成コンテキスト
   * @returns Markdown形式のIssue本文
   */
  private createFallbackBody(context: FollowUpContext): string {
    const lines: string[] = [];

    // 背景
    lines.push('## 背景', '');
    lines.push(context.issueContext.summary, '');

    if (context.issueContext.blockerStatus) {
      lines.push('### 元 Issue のステータス', '');
      lines.push(context.issueContext.blockerStatus, '');
    }

    if (context.issueContext.deferredReason) {
      lines.push('### なぜこれらのタスクが残ったか', '');
      lines.push(context.issueContext.deferredReason, '');
    }

    // 目的
    lines.push('## 目的', '');
    lines.push(`Issue #${context.issueNumber} で特定された残タスクを完了し、プロジェクトを最終化する。`, '');

    // 実行内容
    lines.push('## 実行内容', '');
    for (let i = 0; i < context.remainingTasks.length; i++) {
      const task = context.remainingTasks[i];
      const taskNumber = i + 1;

      lines.push(`### Task ${taskNumber}: ${task.task}`, '');

      if (task.targetFiles && task.targetFiles.length > 0) {
        lines.push('**対象ファイル**:', '');
        task.targetFiles.forEach((file) => lines.push(`- \`${file}\``));
        lines.push('');
      }

      if (task.steps && task.steps.length > 0) {
        lines.push('**必要な作業**:', '');
        task.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
        lines.push('');
      }

      lines.push(`**優先度**: ${task.priority ?? '中'}`, '');
      lines.push(`**見積もり**: ${task.estimatedHours ?? '未定'}`, '');
      lines.push('---', '');
    }

    // 受け入れ基準
    lines.push('## 受け入れ基準', '');
    for (const task of context.remainingTasks) {
      if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
        task.acceptanceCriteria.forEach((ac) => lines.push(`- [ ] ${ac}`));
      }
    }
    lines.push('');

    // 参考情報
    lines.push('## 参考情報', '');
    lines.push(`- 元Issue: #${context.issueNumber}`);
    lines.push(`- Evaluation Report: \`${context.evaluationReportPath}\``);
    lines.push('', '---', '*このIssueは自動生成されました（フォールバックテンプレート使用）*');

    return lines.join('\n');
  }

  /**
   * 一時出力ファイルをクリーンアップ
   *
   * @param filePath - 出力ファイルパス
   */
  private cleanupOutputFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
        logger.debug(`Cleaned up output file: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup output file: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Issueタイトルを生成
   *
   * @param issueNumber - 元Issue番号
   * @param remainingTasks - 残タスクのリスト
   * @returns Issueタイトル（80文字以内）
   */
  private generateTitle(issueNumber: number, remainingTasks: RemainingTask[]): string {
    // キーワード抽出（最大3個）
    const keywords: string[] = [];

    for (const task of remainingTasks.slice(0, 3)) {
      const taskText = String(task.task ?? '');
      if (!taskText.trim()) {
        continue;
      }

      // 括弧前まで、または最初の20文字を抽出
      let keyword = taskText.split('（')[0].split('(')[0].trim();
      if (keyword.length > 20) {
        keyword = keyword.substring(0, 20);
      }

      if (keyword) {
        keywords.push(keyword);
      }
    }

    // キーワードが抽出できた場合
    if (keywords.length > 0) {
      const keywordsStr = keywords.join('・');
      const title = `[FOLLOW-UP] #${issueNumber}: ${keywordsStr}`;

      // 80文字制限
      if (title.length > 80) {
        return title.substring(0, 77) + '...';
      }

      return title;
    }

    // フォールバック
    return `[FOLLOW-UP] Issue #${issueNumber} - 残タスク`;
  }
}
