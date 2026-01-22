import { Octokit } from '@octokit/rest';
import { logger } from '../../utils/logger.js';
import { RequestError } from '@octokit/request-error';
import { getErrorMessage } from '../../utils/error-utils.js';
import {
  RemainingTask,
  IssueContext,
  IssueGenerationOptions,
  IssueAIGenerationResult,
} from '../../types.js';
import {
  IssueAIGenerator,
  IssueAIUnavailableError,
  IssueAIValidationError,
} from './issue-ai-generator.js';
import {
  IssueAgentGenerator,
  type FollowUpContext,
  type GeneratedIssue,
} from './issue-agent-generator.js';

export interface IssueInfo {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
  url: string;
  created_at: string;
  updated_at: string;
}

export interface ListIssuesOptions {
  labels?: string[];
  since?: string;
  perPage?: number;
}

export interface CommentDict {
  id: number;
  user: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface IssueCreationResult {
  success: boolean;
  issue_url: string | null;
  issue_number: number | null;
  error?: string | null;
}

export interface GenericResult {
  success: boolean;
  error?: string | null;
}

const DEFAULT_ISSUE_GENERATION_OPTIONS: IssueGenerationOptions = {
  enabled: false,
  provider: 'auto',
  temperature: 0.2,
  maxOutputTokens: 1500,
  timeoutMs: 25000,
  maxRetries: 3,
  maxTasks: 5,
  appendMetadata: false,
};

/**
 * IssueClient handles all Issue-related operations with GitHub API.
 * Responsibilities:
 * - Issue retrieval (getIssue, getIssueInfo)
 * - Issue comments retrieval (getIssueComments, getIssueCommentsDict)
 * - Comment posting (postComment)
 * - Issue closing (closeIssueWithReason)
 * - Follow-up issue creation (createIssueFromEvaluation)
 */
export class IssueClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;
  private readonly issueAIGenerator: IssueAIGenerator | null;
  private readonly issueAgentGenerator: IssueAgentGenerator | null;

  constructor(
    octokit: Octokit,
    owner: string,
    repo: string,
    issueAIGenerator: IssueAIGenerator | null = null,
    issueAgentGenerator: IssueAgentGenerator | null = null,
  ) {
    this.octokit = octokit;
    this.owner = owner;
    this.repo = repo;
    this.issueAIGenerator = issueAIGenerator;
    this.issueAgentGenerator = issueAgentGenerator;
  }

  /**
   * Retrieves issue details from GitHub API.
   */
  public async getIssue(issueNumber: number) {
    const { data } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  /**
   * Retrieves simplified issue information.
   */
  public async getIssueInfo(issueNumber: number): Promise<IssueInfo> {
    const issue = await this.getIssue(issueNumber);
    return this.mapIssueInfo(issue);
  }

  /**
   * Retrieves all comments for an issue.
   */
  public async getIssueComments(issueNumber: number) {
    const { data } = await this.octokit.issues.listComments({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
    });
    return data;
  }

  /**
   * Retrieves issue comments in dictionary format.
   */
  public async getIssueCommentsDict(issueNumber: number): Promise<CommentDict[]> {
    const comments = await this.getIssueComments(issueNumber);
    return comments.map((comment) => ({
      id: comment.id,
      user: comment.user?.login ?? 'unknown',
      body: comment.body ?? '',
      created_at: comment.created_at ?? '',
      updated_at: comment.updated_at ?? '',
    }));
  }

  /**
   * Posts a comment to an issue.
   */
  public async postComment(issueNumber: number, body: string) {
    const { data } = await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body,
    });
    return data;
  }

  /**
   * Closes an issue with a reason comment.
   */
  public async closeIssueWithReason(issueNumber: number, reason: string): Promise<GenericResult> {
    try {
      await this.postComment(
        issueNumber,
        [
          '## ⚠️ ワークフロー中止',
          '',
          'プロジェクト評価の結果、致命的な問題が発見されたため、ワークフローを中止します。',
          '',
          '### 中止理由',
          '',
          reason,
          '',
          '### 推奨アクション',
          '',
          '- アーキテクチャの再設計',
          '- スコープの見直し',
          '- 技術選定の再検討',
          '',
          '---',
          '*AI Workflow Phase 9 (Evaluation) - ABORT*',
        ].join('\n'),
      );

      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed',
      });

      logger.info(`Closed issue #${issueNumber}`);

      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to close issue: ${this.encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  /**
   * オープンIssueを一覧取得する（Pull Requestを除外）
   */
  public async listOpenIssues(options?: ListIssuesOptions): Promise<IssueInfo[]> {
    try {
      const perPage = options?.perPage ?? 100;
      const issues = await this.octokit.paginate(this.octokit.issues.listForRepo, {
        owner: this.owner,
        repo: this.repo,
        state: 'open',
        per_page: perPage,
        labels: options?.labels?.length ? options.labels.join(',') : undefined,
        since: options?.since,
      });

      const filtered = issues.filter((issue) => !('pull_request' in issue));
      return filtered.map((issue) => this.mapIssueInfo(issue));
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to list open issues: ${this.encodeWarning(message)}`);
      throw error;
    }
  }

  /**
   * Issueをクローズする（必要に応じて理由コメントを投稿）
   */
  public async closeIssue(issueNumber: number, comment?: string): Promise<GenericResult> {
    try {
      if (comment) {
        await this.postComment(issueNumber, comment);
      }

      await this.octokit.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        state: 'closed',
      });

      logger.info(`Closed issue #${issueNumber}`);
      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(`Failed to close issue #${issueNumber}: ${this.encodeWarning(message)}`);
      return { success: false, error: message };
    }
  }

  /**
   * Issueにラベルを追加する
   */
  public async addLabels(issueNumber: number, labels: string[]): Promise<GenericResult> {
    if (!labels || labels.length === 0) {
      return { success: true, error: null };
    }

    try {
      await this.octokit.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels,
      });
      logger.info(`Added labels to issue #${issueNumber}: ${labels.join(', ')}`);
      return { success: true, error: null };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);
      logger.error(
        `Failed to add labels to issue #${issueNumber}: ${this.encodeWarning(message)}`,
      );
      return { success: false, error: message };
    }
  }

  /**
   * 残タスクから主要なキーワードを抽出する
   *
   * @param tasks - 残タスクのリスト
   * @param maxCount - 抽出する最大キーワード数
   * @returns キーワードの配列
   */
  private extractKeywords(tasks: RemainingTask[], maxCount: number): string[] {
    const keywords: string[] = [];

    for (const task of tasks.slice(0, maxCount)) {
      const taskText = String(task.task ?? '');

      if (!taskText.trim()) {
        continue; // 空のタスクはスキップ
      }

      // 括弧前まで、または最初の20文字を抽出
      let keyword = taskText.split('（')[0].split('(')[0].trim();

      // 20文字制限
      if (keyword.length > 20) {
        keyword = keyword.substring(0, 20);
      }

      if (keyword) {
        keywords.push(keyword);
      }
    }

    return keywords;
  }

  private mapIssueInfo(issue: {
    number: number;
    title?: string | null;
    body?: string | null;
    state?: string | null;
    labels?: Array<string | { name?: string | null }> | null;
    html_url?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  }): IssueInfo {
    return {
      number: issue.number,
      title: issue.title ?? '',
      body: issue.body ?? '',
      state: issue.state ?? 'open',
      labels: (issue.labels ?? []).map((label) =>
        typeof label === 'string' ? label : label?.name ?? '',
      ),
      url: issue.html_url ?? '',
      created_at: issue.created_at ?? new Date().toISOString(),
      updated_at: issue.updated_at ?? new Date().toISOString(),
    };
  }

  /**
   * フォローアップ Issue のタイトルを生成する
   *
   * @param issueNumber - 元 Issue 番号
   * @param remainingTasks - 残タスクのリスト
   * @returns Issue タイトル（80文字以内）
   */
  private generateFollowUpTitle(issueNumber: number, remainingTasks: RemainingTask[]): string {
    // キーワード抽出（最大3個）
    const keywords = this.extractKeywords(remainingTasks, 3);

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

    // フォールバック: キーワードが抽出できない場合は従来形式
    return `[FOLLOW-UP] Issue #${issueNumber} - 残タスク`;
  }

  /**
   * 残タスクの詳細情報をフォーマットする
   *
   * @param task - 残タスク
   * @param taskNumber - タスク番号（1始まり）
   * @returns フォーマットされた行の配列
   */
  private formatTaskDetails(task: RemainingTask, taskNumber: number): string[] {
    const lines: string[] = [];

    // タスク見出し
    lines.push(`### Task ${taskNumber}: ${task.task}`, '');

    // 対象ファイル（存在する場合のみ）
    if (task.targetFiles && task.targetFiles.length > 0) {
      lines.push('**対象ファイル**:', '');
      task.targetFiles.forEach((file) => lines.push(`- \`${file}\``));
      lines.push('');
    }

    // 必要な作業（存在する場合のみ）
    if (task.steps && task.steps.length > 0) {
      lines.push('**必要な作業**:', '');
      task.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
      lines.push('');
    }

    // Acceptance Criteria（存在する場合のみ）
    if (task.acceptanceCriteria && task.acceptanceCriteria.length > 0) {
      lines.push('**Acceptance Criteria**:', '');
      task.acceptanceCriteria.forEach((ac) => lines.push(`- [ ] ${ac}`));
      lines.push('');
    }

    // Phase
    lines.push(`**Phase**: ${task.phase ?? 'unknown'}`, '');

    // 優先度 + 根拠
    const priority = task.priority ?? '中';
    const priorityLine = task.priorityReason
      ? `**優先度**: ${priority} - ${task.priorityReason}`
      : `**優先度**: ${priority}`;
    lines.push(priorityLine, '');

    // 見積もり工数
    lines.push(`**見積もり**: ${task.estimatedHours ?? '未定'}`, '');

    // 依存タスク（存在する場合のみ）
    if (task.dependencies && task.dependencies.length > 0) {
      lines.push('**依存タスク**:', '');
      task.dependencies.forEach((dep) => lines.push(`- ${dep}`));
      lines.push('');
    }

    lines.push('---'); // タスク間の区切り線

    return lines;
  }

  /**
   * Creates a follow-up issue from evaluation remaining tasks.
   *
   * @param issueNumber - 元 Issue 番号
   * @param remainingTasks - 残タスクのリスト
   * @param evaluationReportPath - Evaluation レポートのパス
   * @param issueContext - Issue コンテキスト（背景情報、オプショナル）
   * @param options - フォローアップ Issue 生成オプション
   * @returns Issue 作成結果
   */
  public async createIssueFromEvaluation(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string,
    issueContext?: IssueContext,
    options?: IssueGenerationOptions,
  ): Promise<IssueCreationResult> {
    try {
      logger.info(
        `Creating follow-up issue for #${issueNumber} with ${remainingTasks.length} remaining tasks`,
      );

      const generationOptions = this.resolveIssueGenerationOptions(options);

      // ===== 新規: エージェントモード分岐 =====
      if (generationOptions.provider === 'agent') {
        const agentResult = await this.tryGenerateWithAgent(
          issueNumber,
          remainingTasks,
          evaluationReportPath,
          issueContext,
          generationOptions.model,
        );

        if (agentResult.success) {
          const title = agentResult.title;
          const body = agentResult.body;

          const { data } = await this.octokit.issues.create({
            owner: this.owner,
            repo: this.repo,
            title,
            body,
            labels: ['enhancement', 'ai-workflow-follow-up'],
          });

          logger.info(`Follow-up issue created: #${data.number} - ${title}`);

          return {
            success: true,
            issue_url: data.html_url ?? null,
            issue_number: data.number ?? null,
            error: null,
          };
        } else {
          // エージェント失敗時のフォールバック: 既存のLLM生成へ
          logger.warn(
            `Agent generation failed: ${agentResult.error}. Falling back to LLM generation.`,
          );
          // providerを'auto'に変更してLLM APIへフォールバック
          generationOptions.provider = 'auto';
        }
      }
      // ===== 既存: LLMモード =====

      const aiResult = await this.tryGenerateWithLLM(
        issueNumber,
        remainingTasks,
        issueContext,
        generationOptions,
      );

      const title = aiResult?.title ?? this.generateFollowUpTitle(issueNumber, remainingTasks);
      let body = aiResult
        ? aiResult.body
        : this.buildLegacyBody(issueNumber, remainingTasks, evaluationReportPath, issueContext);

      if (aiResult) {
        body = this.appendReferenceSection(body, issueNumber, evaluationReportPath);
        body = this.appendMetadata(body, aiResult.metadata, generationOptions);
      }

      const { data } = await this.octokit.issues.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        labels: ['enhancement', 'ai-workflow-follow-up'],
      });

      logger.info(`Follow-up issue created: #${data.number} - ${title}`);

      return {
        success: true,
        issue_url: data.html_url ?? null,
        issue_number: data.number ?? null,
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof RequestError
          ? `GitHub API error: ${error.status} - ${error.message}`
          : getErrorMessage(error);

      logger.error(`Failed to create follow-up issue: ${this.encodeWarning(message)}`);

      return {
        success: false,
        issue_url: null,
        issue_number: null,
        error: message,
      };
    }
  }

  private resolveIssueGenerationOptions(options?: IssueGenerationOptions): IssueGenerationOptions {
    const merged: IssueGenerationOptions = { ...DEFAULT_ISSUE_GENERATION_OPTIONS };

    if (!options) {
      return merged;
    }

    for (const key of Object.keys(options) as (keyof IssueGenerationOptions)[]) {
      const value = options[key];
      if (value !== undefined) {
        (merged as Record<keyof IssueGenerationOptions, unknown>)[key] = value;
      }
    }

    return merged;
  }

  private async tryGenerateWithLLM(
    issueNumber: number,
    tasks: RemainingTask[],
    issueContext: IssueContext | undefined,
    options: IssueGenerationOptions,
  ): Promise<IssueAIGenerationResult | null> {
    if (!options.enabled) {
      return null;
    }

    if (!this.issueAIGenerator) {
      logger.warn('FOLLOWUP_LLM_FALLBACK', {
        reason: 'issue_ai_generator_not_configured',
        fallback: 'legacy_template',
      });
      return null;
    }

    if (!this.issueAIGenerator.isAvailable(options)) {
      logger.warn('FOLLOWUP_LLM_FALLBACK', {
        reason: 'provider_unavailable',
        fallback: 'legacy_template',
      });
      return null;
    }

    try {
      const result = await this.issueAIGenerator.generate(tasks, issueContext, issueNumber, options);
      logger.debug('FOLLOWUP_LLM_SUCCESS', {
        provider: result.metadata.provider,
        model: result.metadata.model,
        durationMs: result.metadata.durationMs,
        retryCount: result.metadata.retryCount,
      });
      return result;
    } catch (error) {
      const reason = this.describeAiError(error);
      logger.warn('FOLLOWUP_LLM_FALLBACK', {
        reason,
        fallback: 'legacy_template',
      });
      return null;
    }
  }

  private describeAiError(error: unknown): string {
    if (error instanceof IssueAIValidationError) {
      return `validation_error: ${error.message}`;
    }
    if (error instanceof IssueAIUnavailableError) {
      return `unavailable: ${error.message}`;
    }
    return getErrorMessage(error);
  }

  private buildLegacyBody(
    issueNumber: number,
    remainingTasks: RemainingTask[],
    evaluationReportPath: string,
    issueContext?: IssueContext,
  ): string {
    const lines: string[] = [];

    if (issueContext) {
      lines.push('## 背景', '');
      lines.push(issueContext.summary, '');

      if (issueContext.blockerStatus) {
        lines.push('### 元 Issue のステータス', '');
        lines.push(issueContext.blockerStatus, '');
      }

      if (issueContext.deferredReason) {
        lines.push('### なぜこれらのタスクが残ったか', '');
        lines.push(issueContext.deferredReason, '');
      }
    } else {
      lines.push('## 背景', '');
      lines.push(`AI Workflow Issue #${issueNumber} の評価フェーズで残タスクが見つかりました。`, '');
    }

    lines.push('## 残タスク詳細', '');

    for (let i = 0; i < remainingTasks.length; i++) {
      const task = remainingTasks[i];
      const taskNumber = i + 1;

      lines.push(...this.formatTaskDetails(task, taskNumber));
      lines.push('');
    }

    lines.push('## 参考', '');
    lines.push(`- 元Issue: #${issueNumber}`);
    lines.push(`- Evaluation Report: \`${evaluationReportPath}\``);
    lines.push('', '---', '*自動生成: AI Workflow Phase 9 (Evaluation)*');

    return lines.join('\n');
  }

  private appendReferenceSection(
    body: string,
    issueNumber: number,
    evaluationReportPath: string,
  ): string {
    const trimmed = body.trimEnd();
    const hasReferenceHeading = /##\s*(参考|関連リソース)/.test(trimmed);
    const hasEvaluationLink = trimmed.includes('Evaluation Report');

    if (hasReferenceHeading && hasEvaluationLink) {
      return trimmed;
    }

    const output: string[] = [trimmed, '', '## 関連リソース', ''];
    output.push(`- 元Issue: #${issueNumber}`);
    output.push(`- Evaluation Report: \`${evaluationReportPath}\``);

    if (!trimmed.includes('---')) {
      output.push('');
      output.push('---');
    }

    if (!trimmed.includes('*自動生成: AI Workflow Phase 9 (Evaluation)*')) {
      output.push('*自動生成: AI Workflow Phase 9 (Evaluation)*');
    }

    return output.join('\n');
  }

  private appendMetadata(
    body: string,
    metadata: IssueAIGenerationResult['metadata'],
    options: IssueGenerationOptions,
  ): string {
    if (!options.appendMetadata) {
      return body.trimEnd();
    }

    const lines = [
      body.trimEnd(),
      '',
      '## 生成メタデータ',
      '',
      `- モデル: ${metadata.model} (${metadata.provider})`,
      `- 所要時間: ${metadata.durationMs}ms / 再試行: ${metadata.retryCount}`,
      `- トークン: in ${metadata.inputTokens ?? '-'} / out ${metadata.outputTokens ?? '-'}`,
      `- 省略したタスク数: ${metadata.omittedTasks ?? 0}`,
    ];

    return lines.join('\n');
  }

  /**
   * エージェントベースFOLLOW-UP Issue生成を試行
   *
   * @param issueNumber - 元Issue番号
   * @param tasks - 残タスクのリスト
   * @param evaluationReportPath - Evaluation Reportのパス
   * @param issueContext - Issueコンテキスト
   * @param model - 使用モデル（オプショナル）
   * @returns 生成されたIssue
   */
  private async tryGenerateWithAgent(
    issueNumber: number,
    tasks: RemainingTask[],
    evaluationReportPath: string,
    issueContext: IssueContext | undefined,
    model?: string,
  ): Promise<GeneratedIssue> {
    if (!this.issueAgentGenerator) {
      logger.warn('IssueAgentGenerator is not configured. Skipping agent generation.');
      return {
        success: false,
        title: '',
        body: '',
        error: 'IssueAgentGenerator not configured',
      };
    }

    const context: FollowUpContext = {
      remainingTasks: tasks,
      issueContext: issueContext ?? {
        summary: `この Issue は、Issue #${issueNumber} の Evaluation フェーズで特定された残タスクをまとめたものです。`,
        blockerStatus: 'すべてのブロッカーは解決済み',
        deferredReason: 'タスク優先度の判断により後回し',
      },
      issueNumber,
      evaluationReportPath,
    };

    try {
      const agent = 'auto'; // デフォルトはauto（Codex優先）
      const result = await this.issueAgentGenerator.generate(context, agent, model);

      if (result.success) {
        logger.info('Agent-based follow-up issue generation succeeded.');
        return result;
      } else {
        logger.warn(`Agent generation failed: ${result.error}`);
        return result;
      }
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Agent generation error: ${message}`);
      return {
        success: false,
        title: '',
        body: '',
        error: message,
      };
    }
  }

  /**
   * Helper method to encode warning messages for safe logging.
   */
  private encodeWarning(message: string): string {
    return Buffer.from(message, 'utf-8').toString();
  }
}
