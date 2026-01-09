import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import {
  CommentResolutionMetadata,
  CommentMetadata,
  CommentResolutionStatus,
  CommentResolution,
  ReviewComment,
  PRInfo,
  RepositoryInfo,
  ResolutionSummary,
  AnalyzerErrorType,
} from '../../types/pr-comment.js';

/**
 * PRコメント対応メタデータ管理クラス
 */
export class PRCommentMetadataManager {
  private readonly metadataPath: string;
  private metadata: CommentResolutionMetadata | null = null;

  constructor(workingDir: string, prNumber: number) {
    this.metadataPath = path.join(
      workingDir,
      '.ai-workflow',
      `pr-${prNumber}`,
      'comment-resolution-metadata.json',
    );
  }

  /**
   * メタデータを初期化
   */
  public async initialize(
    prInfo: PRInfo,
    repoInfo: RepositoryInfo,
    comments: ReviewComment[],
    issueNumber?: number,
  ): Promise<void> {
    const now = new Date().toISOString();

    const commentsMap: Record<string, CommentMetadata> = {};
    for (const comment of comments) {
      const prNumber = prInfo.number;
      commentsMap[String(comment.id)] = {
        comment: { ...comment, pr_number: comment.pr_number ?? prNumber },
        status: 'pending',
        started_at: null,
        completed_at: null,
        retry_count: 0,
        resolution: null,
        reply_comment_id: null,
        resolved_at: null,
        error: null,
      };
    }

    this.metadata = {
      version: '1.0.0',
      pr: prInfo,
      repository: repoInfo,
      issue_number: issueNumber,
      comments: commentsMap,
      summary: this.calculateSummary(commentsMap),
      cost_tracking: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
      created_at: now,
      updated_at: now,
      analyze_completed_at: null,
      execute_completed_at: null,
      response_plan_path: null,
      execution_result_path: null,
      analyzer_agent: null,
      analyzer_error: null,
      analyzer_error_type: null,
    };

    await this.save();
  }

  /**
   * メタデータを読み込み
   */
  public async load(): Promise<CommentResolutionMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    const content = await fsp.readFile(this.metadataPath, 'utf-8');
    this.metadata = JSON.parse(content) as CommentResolutionMetadata;
    return this.metadata;
  }

  /**
   * メタデータが存在するか確認
   */
  public async exists(): Promise<boolean> {
    try {
      await fsp.access(this.metadataPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * メタデータを保存
   */
  public async save(): Promise<void> {
    if (!this.metadata) {
      throw new Error('Metadata not initialized');
    }

    this.metadata.updated_at = new Date().toISOString();
    this.metadata.summary = this.calculateSummary(this.metadata.comments);

    const dir = path.dirname(this.metadataPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2), 'utf-8');
  }

  /**
   * 新規コメントをメタデータへ追加
   *
   * @param comments - 追加するレビューコメント
   * @returns 追加されたコメント数
   */
  public async addComments(comments: ReviewComment[]): Promise<number> {
    await this.ensureLoaded();

    const prNumber = this.metadata!.pr.number;
    let addedCount = 0;

    for (const comment of comments) {
      const commentId = String(comment.id);

      if (this.metadata!.comments[commentId]) {
        logger.debug(`Comment ${commentId} already exists, skipping.`);
        continue;
      }

      this.metadata!.comments[commentId] = {
        comment: { ...comment, pr_number: comment.pr_number ?? prNumber },
        status: 'pending',
        started_at: null,
        completed_at: null,
        retry_count: 0,
        resolution: null,
        reply_comment_id: null,
        resolved_at: null,
        error: null,
      };
      addedCount += 1;
    }

    if (addedCount > 0) {
      await this.save();
    }

    return addedCount;
  }

  /**
   * コメントステータスを更新
   */
  public async updateCommentStatus(
    commentId: string,
    status: CommentResolutionStatus,
    resolution?: CommentResolution,
    error?: string,
  ): Promise<void> {
    await this.ensureLoaded();

    const comment = this.metadata!.comments[commentId];
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    const now = new Date().toISOString();

    if (status === 'in_progress' && comment.status === 'pending') {
      comment.started_at = now;
    }

    if (status === 'completed' || status === 'skipped' || status === 'failed') {
      comment.completed_at = now;
    }

    comment.status = status;

    if (resolution) {
      comment.resolution = resolution;
    }

    if (error) {
      comment.error = error;
    }

    await this.save();
  }

  /**
   * リトライカウントをインクリメント
   */
  public async incrementRetryCount(commentId: string): Promise<number> {
    await this.ensureLoaded();

    const comment = this.metadata!.comments[commentId];
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.retry_count += 1;
    await this.save();

    return comment.retry_count;
  }

  /**
   * 返信コメントIDを記録
   */
  public async setReplyCommentId(commentId: string, replyId: number): Promise<void> {
    await this.ensureLoaded();

    const comment = this.metadata!.comments[commentId];
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.reply_comment_id = replyId;
    await this.save();
  }

  /**
   * 解決日時を記録
   */
  public async setResolved(commentId: string): Promise<void> {
    await this.ensureLoaded();

    const comment = this.metadata!.comments[commentId];
    if (!comment) {
      throw new Error(`Comment ${commentId} not found`);
    }

    comment.resolved_at = new Date().toISOString();
    await this.save();
  }

  /**
   * コスト追跡を更新
   */
  public async updateCostTracking(
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
  ): Promise<void> {
    await this.ensureLoaded();

    this.metadata!.cost_tracking.total_input_tokens += inputTokens;
    this.metadata!.cost_tracking.total_output_tokens += outputTokens;
    this.metadata!.cost_tracking.total_cost_usd += costUsd;

    await this.save();
  }

  /**
   * 未処理コメントを取得
   *
   * @remarks
   * 返信済みコメント（reply_comment_id が設定済み）はステータスに関わらず除外する。
   */
  public async getPendingComments(): Promise<CommentMetadata[]> {
    await this.ensureLoaded();

    return Object.values(this.metadata!.comments).filter(
      (c) => (c.status === 'pending' || c.status === 'in_progress') && !c.reply_comment_id,
    );
  }

  /**
   * 完了コメントを取得
   */
  public async getCompletedComments(): Promise<CommentMetadata[]> {
    await this.ensureLoaded();

    return Object.values(this.metadata!.comments).filter((c) => c.status === 'completed');
  }

  /**
   * サマリーを取得
   */
  public async getSummary(): Promise<ResolutionSummary> {
    await this.ensureLoaded();
    return this.metadata!.summary;
  }

  /**
   * コメントメタデータを取得
   */
  public async getMetadata(): Promise<CommentResolutionMetadata> {
    await this.ensureLoaded();
    return this.metadata!;
  }

  /**
   * base_commit を設定
   *
   * init コマンド実行時に現在のHEADコミットハッシュを記録する。
   * @param baseCommit - ベースコミットハッシュ
   * @throws Error - メタデータが初期化されていない場合
   */
  public async setBaseCommit(baseCommit: string): Promise<void> {
    if (!this.metadata) {
      throw new Error('Metadata not initialized. Call initialize() first.');
    }

    this.metadata.base_commit = baseCommit;
    await this.save();
  }

  /**
   * base_commit を取得
   *
   * 旧バージョンのメタデータ（base_commit なし）では undefined を返す。
   */
  public getBaseCommit(): string | undefined {
    return this.metadata?.base_commit;
  }

  /**
   * analyze完了タイムスタンプを設定
   */
  public async setAnalyzeCompletedAt(timestamp: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.analyze_completed_at = timestamp;
    await this.save();
  }

  /**
   * execute完了タイムスタンプを設定
   */
  public async setExecuteCompletedAt(timestamp: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.execute_completed_at = timestamp;
    await this.save();
  }

  /**
   * response-plan.mdのパスを保存
   */
  public async setResponsePlanPath(planPath: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.response_plan_path = planPath;
    await this.save();
  }

  /**
   * execution-result.mdのパスを保存
   */
  public async setExecutionResultPath(resultPath: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.execution_result_path = resultPath;
    await this.save();
  }

  /**
   * analyzeに使用したエージェントを記録
   */
  public async setAnalyzerAgent(agent: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.analyzer_agent = agent;
    await this.save();
  }

  /**
   * analyzerのエラー情報を記録
   */
  public async setAnalyzerError(error: string, errorType: AnalyzerErrorType): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.analyzer_error = error;
    this.metadata!.analyzer_error_type = errorType;
    this.metadata!.analyzer_agent = this.metadata!.analyzer_agent ?? 'fallback';
    await this.save();
  }

  /**
   * analyzerのエラー情報を取得
   */
  public async getAnalyzerError(): Promise<{
    error?: string | null;
    errorType?: AnalyzerErrorType | null;
  }> {
    await this.ensureLoaded();
    return {
      error: this.metadata!.analyzer_error,
      errorType: this.metadata!.analyzer_error_type,
    };
  }

  /**
   * analyzerのエラー情報をクリア
   */
  public async clearAnalyzerError(): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.analyzer_error = null;
    this.metadata!.analyzer_error_type = null;
    await this.save();
  }

  /**
   * メタデータファイルパスを取得
   */
  public getMetadataPath(): string {
    return this.metadataPath;
  }

  /**
   * メタデータファイルを削除（クリーンアップ用）
   */
  public async cleanup(): Promise<void> {
    const dir = path.dirname(this.metadataPath);
    await fsp.rm(dir, { recursive: true, force: true });
  }

  /**
   * サマリーを計算
   */
  private calculateSummary(comments: Record<string, CommentMetadata>): ResolutionSummary {
    const values = Object.values(comments);

    const byStatus = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
    };

    const byType = {
      code_change: 0,
      reply: 0,
      discussion: 0,
      skip: 0,
    };

    for (const c of values) {
      byStatus[c.status]++;

      if (c.status === 'completed' && c.resolution) {
        byType[c.resolution.type]++;
      }
    }

    return {
      total: values.length,
      by_status: byStatus,
      by_type: byType,
    };
  }

  /**
   * メタデータがロードされていることを確認
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.metadata) {
      await this.load();
    }
  }
}
