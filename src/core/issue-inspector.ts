/**
 * IssueInspector - Issue検品クラス
 *
 * エージェント（Codex/Claude）を使用してIssueを分析し、
 * クローズの可否を判定する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { IssueClient } from './github/issue-client.js';
import type {
  Issue,
  IssueComment,
  InspectionResult,
  InspectionOptions,
  PromptVariables,
} from '../types/auto-close-issue.js';

/**
 * エージェント実行インターフェース
 */
interface AgentExecutor {
  executeTask(options: {
    prompt: string;
    systemPrompt?: string | null;
    maxTurns?: number;
    workingDirectory?: string;
    verbose?: boolean;
  }): Promise<string[]>;
}

/**
 * Issue詳細情報型（簡易版）
 */
interface IssueDetails {
  issue: Issue;
  comments: IssueComment[];
}

/**
 * IssueInspectorクラス
 */
export class IssueInspector {
  private agentExecutor: AgentExecutor;
  private issueClient: IssueClient;
  private owner: string;
  private repo: string;

  constructor(
    agentExecutor: CodexAgentClient | ClaudeAgentClient,
    issueClient: IssueClient,
    owner: string,
    repo: string,
  ) {
    this.agentExecutor = agentExecutor as AgentExecutor;
    this.issueClient = issueClient;
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Issueを検品し、クローズの可否を判定する
   *
   * @param issue - 検品対象のIssue
   * @param options - 検品オプション
   * @returns 検品結果（スキップ時はnull）
   */
  public async inspectIssue(
    issue: Issue,
    options: InspectionOptions,
  ): Promise<InspectionResult | null> {
    try {
      // 1. 事前チェック（安全フィルタ）
      if (!this.passesSafetyPreChecks(issue, options)) {
        logger.info(`Issue #${issue.number} skipped by safety pre-checks`);
        return null;
      }

      // 2. Issue詳細情報取得
      const details = await this.getIssueDetails(issue.number);

      // 3. プロンプト変数構築
      const variables = this.buildPromptVariables(issue, details);

      // 4. プロンプトテンプレート読み込み
      const template = this.loadPromptTemplate();

      // 5. 変数置換
      const prompt = this.fillTemplate(template, variables);

      // 6. エージェント実行
      logger.debug(`Executing agent for issue #${issue.number}`);
      const messages = await this.agentExecutor.executeTask({
        prompt,
        maxTurns: 3,
        verbose: false,
      });

      // 7. 出力パース（最後のメッセージを取得）
      const output = this.extractOutputFromMessages(messages);
      const result = this.parseInspectionResult(output);

      // 8. 安全フィルタ適用
      if (!this.filterBySafetyChecks(issue, result, options)) {
        logger.info(
          `Issue #${issue.number} filtered by safety checks (recommendation: ${result.recommendation}, confidence: ${result.confidence})`,
        );
        return null;
      }

      // 9. 結果返却
      return result;
    } catch (error) {
      logger.error(`Failed to inspect issue #${issue.number}: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * エージェントメッセージから最終出力を抽出する
   *
   * @param messages - エージェント実行結果のメッセージ配列
   * @returns 最終出力文字列
   */
  private extractOutputFromMessages(messages: string[]): string {
    if (messages.length === 0) {
      throw new Error('No output from agent');
    }

    // 最後のメッセージからテキスト出力を抽出
    // CodexAgentClientとClaudeAgentClientは両方ともJSON形式でイベントを返す
    for (let i = messages.length - 1; i >= 0; i--) {
      try {
        const message = JSON.parse(messages[i]);

        // Claude Agent SDKのメッセージ形式
        if (message.type === 'text' && message.text) {
          return message.text;
        }

        // Codex CLIのメッセージ形式
        if (message.output && typeof message.output === 'string') {
          return message.output;
        }

        // その他の形式
        if (typeof message === 'string') {
          return message;
        }
      } catch {
        // JSON以外の文字列の場合はそのまま返す
        return messages[i];
      }
    }

    // フォールバック: 全メッセージを結合
    return messages.join('\n');
  }

  /**
   * 事前の安全フィルタチェック
   *
   * @param issue - 対象Issue
   * @param options - 検品オプション
   * @returns フィルタ通過（true）またはスキップ（false）
   */
  private passesSafetyPreChecks(issue: Issue, options: InspectionOptions): boolean {
    // ラベルフィルタ
    const issueLabels = issue.labels.map((l) => l.name.toLowerCase());
    const excludeLabels = options.excludeLabels.map((l) => l.toLowerCase());

    for (const excludeLabel of excludeLabels) {
      if (issueLabels.includes(excludeLabel)) {
        logger.debug(`Issue #${issue.number} has excluded label: ${excludeLabel}`);
        return false;
      }
    }

    // 最近更新除外（7日以内）
    const daysSinceUpdate = this.calculateDaysSince(issue.updated_at);
    if (daysSinceUpdate < 7) {
      logger.debug(
        `Issue #${issue.number} updated recently (${daysSinceUpdate} days ago), skipping`,
      );
      return false;
    }

    return true;
  }

  /**
   * 安全フィルタを適用する
   *
   * @param issue - 対象Issue
   * @param result - エージェント判定結果
   * @param options - 検品オプション
   * @returns フィルタ通過（true）またはスキップ（false）
   */
  private filterBySafetyChecks(
    issue: Issue,
    result: InspectionResult,
    options: InspectionOptions,
  ): boolean {
    // recommendation チェック
    if (result.recommendation !== 'close') {
      return false;
    }

    // confidence閾値チェック
    if (result.confidence < options.confidenceThreshold) {
      return false;
    }

    return true;
  }

  /**
   * エージェント出力（JSON文字列）をパースする
   *
   * @param output - エージェントの生出力
   * @returns パース済みの検品結果
   */
  private parseInspectionResult(output: string): InspectionResult {
    try {
      // JSONブロックの抽出を試みる
      const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/) || output.match(/{[\s\S]*}/);
      const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : output;

      const parsed = JSON.parse(jsonString);

      // 必須フィールド検証
      if (!parsed.recommendation) {
        throw new Error('Missing required field: recommendation');
      }
      if (parsed.confidence === undefined || parsed.confidence === null) {
        throw new Error('Missing required field: confidence');
      }
      if (!parsed.reasoning) {
        throw new Error('Missing required field: reasoning');
      }

      // recommendation値検証
      const validRecommendations = ['close', 'keep', 'needs_discussion'];
      if (!validRecommendations.includes(parsed.recommendation)) {
        throw new Error(`Invalid recommendation value: ${parsed.recommendation}`);
      }

      // confidence範囲検証
      if (parsed.confidence < 0.0 || parsed.confidence > 1.0) {
        throw new Error('Confidence must be between 0.0 and 1.0');
      }

      return {
        issue_number: parsed.issue_number,
        recommendation: parsed.recommendation,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        close_comment: parsed.close_comment || '',
        suggested_actions: parsed.suggested_actions || [],
      };
    } catch (error) {
      throw new Error(`Failed to parse inspection result: ${getErrorMessage(error)}`);
    }
  }

  /**
   * プロンプト変数を構築する
   *
   * @param issue - 対象Issue
   * @param details - Issue詳細情報
   * @returns プロンプト変数オブジェクト
   */
  private buildPromptVariables(issue: Issue, details: IssueDetails): PromptVariables {
    const issue_info = this.formatIssueInfo(issue);
    const related_info = this.formatRelatedInfo(details);
    const codebase_info = this.formatCodebaseInfo(issue);

    return {
      issue_info,
      related_info,
      codebase_info,
    };
  }

  /**
   * Issue情報をフォーマットする
   */
  private formatIssueInfo(issue: Issue): string {
    const lines: string[] = [];

    lines.push('### Issue基本情報');
    lines.push('');
    lines.push(`- **Issue番号**: #${issue.number}`);
    lines.push(`- **タイトル**: ${issue.title}`);
    lines.push(`- **ラベル**: ${issue.labels.map((l) => l.name).join(', ') || 'なし'}`);
    lines.push(
      `- **作成日**: ${new Date(issue.created_at).toLocaleDateString('ja-JP')} (${this.calculateDaysSince(issue.created_at)}日前)`,
    );
    lines.push(
      `- **最終更新**: ${new Date(issue.updated_at).toLocaleDateString('ja-JP')} (${this.calculateDaysSince(issue.updated_at)}日前)`,
    );
    lines.push('');
    lines.push('### Issue本文');
    lines.push('');
    lines.push(issue.body || '(本文なし)');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 関連情報（コメント履歴）をフォーマットする
   */
  private formatRelatedInfo(details: IssueDetails): string {
    const lines: string[] = [];

    lines.push('### コメント履歴');
    lines.push('');

    if (details.comments.length === 0) {
      lines.push('(コメントなし)');
    } else {
      for (const comment of details.comments) {
        const date = new Date(comment.created_at).toLocaleDateString('ja-JP');
        lines.push(`- **${date} by ${comment.author}**: ${comment.body.substring(0, 200)}${comment.body.length > 200 ? '...' : ''}`);
      }
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * コードベース情報をフォーマットする（Phase 1では簡易実装）
   */
  private formatCodebaseInfo(issue: Issue): string {
    // Phase 1: MVP範囲外（簡易メッセージのみ）
    return '(コードベース分析はPhase 2で実装予定)';
  }

  /**
   * プロンプトテンプレートを読み込む
   */
  private loadPromptTemplate(): string {
    const templatePath = path.join(
      process.cwd(),
      'dist',
      'prompts',
      'auto-close',
      'inspect-issue.txt',
    );

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Prompt template not found: ${templatePath}`);
    }

    return fs.readFileSync(templatePath, 'utf-8');
  }

  /**
   * テンプレートの変数を置換する
   */
  private fillTemplate(template: string, variables: PromptVariables): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{${key}}`, value);
    }

    return result;
  }

  /**
   * Issue詳細情報を取得する
   *
   * @param issueNumber - Issue番号
   * @returns Issue詳細（コメント履歴含む）
   */
  private async getIssueDetails(issueNumber: number): Promise<IssueDetails> {
    const issue = await this.issueClient.getIssue(issueNumber);
    const comments = await this.issueClient.getIssueCommentsDict(issueNumber);

    return {
      issue: {
        number: issue.number,
        title: issue.title ?? '',
        body: issue.body ?? '',
        labels: (issue.labels ?? []).map((label) => ({
          name: typeof label === 'string' ? label : label.name ?? '',
        })),
        created_at: issue.created_at ?? new Date().toISOString(),
        updated_at: issue.updated_at ?? new Date().toISOString(),
        state: (issue.state as 'open' | 'closed') ?? 'open',
      },
      comments: comments.map((c) => ({
        id: c.id,
        author: c.user,
        created_at: c.created_at,
        body: c.body,
      })),
    };
  }

  /**
   * 日数計算ヘルパー
   */
  private calculateDaysSince(dateString: string): number {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}
