import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import {
  CommentMetadata,
  CommentResolution,
  AgentAnalysisResult,
  ResolutionType,
  ConfidenceLevel,
} from '../../types/pr-comment.js';
import { CodexAgentClient } from '../codex-agent-client.js';
import { ClaudeAgentClient } from '../claude-agent-client.js';
import { parseCodexEvent, determineCodexEventType } from '../helpers/agent-event-parser.js';

export interface AnalysisContext {
  repoPath: string;
  fileContent?: string;
  prDescription?: string;
}

export interface AnalysisResult {
  success: boolean;
  resolution?: CommentResolution;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

/**
 * レビューコメント分析エンジン
 */
export class ReviewCommentAnalyzer {
  private readonly promptTemplatePath: string;
  private readonly outputDir: string;

  constructor(promptsDir: string, outputDir: string) {
    this.promptTemplatePath = path.join(promptsDir, 'pr-comment', 'analyze.txt');
    this.outputDir = outputDir;
  }

  /**
   * コメントを分析
   */
  public async analyze(
    commentMeta: CommentMetadata,
    context: AnalysisContext,
    agent: CodexAgentClient | ClaudeAgentClient | null,
  ): Promise<AnalysisResult> {
    const outputFile = path.join(this.outputDir, `analysis-${commentMeta.comment.id}.json`);

    try {
      const prompt = await this.buildPrompt(commentMeta, context, outputFile);
      await fsp.mkdir(this.outputDir, { recursive: true });

      let rawContent: string | null = null;

      if (agent) {
        rawContent = await this.runAgent(agent, prompt, context.repoPath);
      }

      // フォールバック: エージェント未設定または結果が得られない場合は簡易推論
      if (!rawContent || rawContent.trim().length === 0) {
        const fallback = this.buildFallbackResolution(commentMeta);
        await fsp.writeFile(outputFile, JSON.stringify(fallback, null, 2), 'utf-8');
        this.validateResult(fallback);
        return { success: true, resolution: this.toResolution(fallback) };
      }

      await fsp.writeFile(outputFile, rawContent, 'utf-8');

      try {
        const resolution = await this.parseResult(outputFile);
        return { success: true, resolution };
      } catch (error) {
        logger.warn(`Failed to parse agent output, using fallback: ${getErrorMessage(error)}`);
        const fallback = this.buildFallbackResolution(commentMeta);
        await fsp.writeFile(outputFile, JSON.stringify(fallback, null, 2), 'utf-8');
        this.validateResult(fallback);
        return { success: true, resolution: this.toResolution(fallback) };
      }
    } catch (error) {
      return {
        success: false,
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * プロンプトを構築
   */
  private async buildPrompt(
    commentMeta: CommentMetadata,
    context: AnalysisContext,
    outputFile: string,
  ): Promise<string> {
    const template = await fsp.readFile(this.promptTemplatePath, 'utf-8');
    const comment = commentMeta.comment;

    let fileContext = '';
    if (context.fileContent) {
      fileContext = context.fileContent;
    } else if (comment.path) {
      try {
        const filePath = path.join(context.repoPath, comment.path);
        fileContext = await fsp.readFile(filePath, 'utf-8');
      } catch {
        fileContext = '(File not found)';
      }
    }

    const lineNumber = comment.line ?? comment.end_line ?? 'N/A';

    return template
      .replace('{comment_id}', String(comment.id))
      .replace('{comment_body}', comment.body)
      .replace('{comment_path}', comment.path)
      .replace('{comment_line}', String(lineNumber))
      .replace('{comment_user}', comment.user)
      .replace('{diff_hunk}', comment.diff_hunk || '(No diff context)')
      .replace('{file_content}', fileContext)
      .replace('{pr_description}', context.prDescription || '(No description)')
      .replace('{output_file_path}', outputFile);
  }

  /**
   * エージェントを実行し結果文字列を返す
   */
  private async runAgent(
    agent: CodexAgentClient | ClaudeAgentClient,
    prompt: string,
    repoPath: string,
  ): Promise<string | null> {
    try {
      logger.debug(`Running agent for PR comment analysis...`);
      const messages = await agent.executeTask({
        prompt,
        maxTurns: 1,
        verbose: true,
        workingDirectory: repoPath,
      });
      logger.debug(`Agent execution completed, processing response...`);

      if (agent instanceof CodexAgentClient) {
        return this.extractFromCodexMessages(messages);
      }

      return this.extractFromClaudeMessages(messages);
    } catch (error) {
      logger.warn(`Agent execution failed: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * Codexエージェントのメッセージからテキストを抽出
   */
  private extractFromCodexMessages(messages: string[]): string {
    const parts: string[] = [];

    for (const raw of messages) {
      const parsed = parseCodexEvent(raw);
      if (!parsed) {
        continue;
      }

      const type = determineCodexEventType(parsed);
      if (type === 'assistant' && parsed.message?.content) {
        for (const block of parsed.message.content) {
          const text = typeof block.text === 'string' ? block.text : null;
          if (text) {
            parts.push(text);
          }
        }
      }

      if (type === 'result' && typeof parsed.result === 'string') {
        parts.push(parsed.result);
      }
    }

    return parts.join('\n').trim();
  }

  /**
   * Claudeエージェントのメッセージからテキストを抽出
   */
  private extractFromClaudeMessages(messages: string[]): string {
    const parts: string[] = [];

    for (const raw of messages) {
      let message: { type?: string; result?: unknown; message?: { content?: Array<{ type?: string; text?: string }> } } | null =
        null;
      try {
        message = JSON.parse(raw);
      } catch {
        continue;
      }

      if (message?.type === 'result' && typeof message.result === 'string') {
        parts.push(message.result);
      }

      if (message?.type === 'assistant' && Array.isArray(message.message?.content)) {
        for (const block of message.message.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            parts.push(block.text);
          }
        }
      }
    }

    return parts.join('\n').trim();
  }

  /**
   * 結果をパース
   */
  private async parseResult(outputFile: string): Promise<CommentResolution> {
    const content = await fsp.readFile(outputFile, 'utf-8');

    let jsonStr = content.trim();
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr) as AgentAnalysisResult;
    this.validateResult(parsed);

    return this.toResolution(parsed);
  }

  private toResolution(result: AgentAnalysisResult): CommentResolution {
    return {
      type: result.type,
      confidence: result.confidence,
      changes: result.changes,
      reply: result.reply,
      skip_reason: result.skip_reason,
      analysis_notes: result.analysis_notes,
    };
  }

  /**
   * 結果をバリデーション
   */
  private validateResult(result: AgentAnalysisResult): void {
    const validTypes: ResolutionType[] = ['code_change', 'reply', 'discussion', 'skip'];
    if (!validTypes.includes(result.type)) {
      throw new Error(`Invalid resolution type: ${result.type}`);
    }

    const validConfidences: ConfidenceLevel[] = ['high', 'medium', 'low'];
    if (!validConfidences.includes(result.confidence)) {
      throw new Error(`Invalid confidence level: ${result.confidence}`);
    }

    if (!result.reply || result.reply.trim() === '') {
      throw new Error('Reply is required');
    }

    if (result.type === 'code_change') {
      if (!result.changes || result.changes.length === 0) {
        throw new Error('Changes are required for code_change type');
      }

      if (result.confidence === 'low') {
        logger.warn('Low confidence code_change detected, converting to discussion');
        result.type = 'discussion';
        result.changes = undefined;
      }
    }
  }

  /**
   * コメント分類（プリフィルタ用）
   */
  public classifyComment(body: string): 'code_change' | 'question' | 'discussion' {
    const lowerBody = body.toLowerCase();

    const codeChangePatterns = [
      /fix/i,
      /change/i,
      /update/i,
      /modify/i,
      /replace/i,
      /remove/i,
      /add/i,
      /should be/i,
      /typo/i,
      /bug/i,
      /error/i,
      /wrong/i,
      /incorrect/i,
    ];

    const questionPatterns = [
      /\?$/,
      /why/i,
      /what/i,
      /how/i,
      /could you/i,
      /can you/i,
      /please explain/i,
    ];

    for (const pattern of codeChangePatterns) {
      if (pattern.test(lowerBody)) {
        return 'code_change';
      }
    }

    for (const pattern of questionPatterns) {
      if (pattern.test(lowerBody)) {
        return 'question';
      }
    }

    return 'discussion';
  }

  /**
   * エージェントが利用できない場合の簡易解決策
   */
  private buildFallbackResolution(commentMeta: CommentMetadata): AgentAnalysisResult {
    const classification = this.classifyComment(commentMeta.comment.body);

    if (classification === 'code_change') {
      return {
        type: 'discussion',
        confidence: 'low',
        reply:
          'Thanks for the feedback. This item requires manual review. I will follow up after checking the code locally.',
      };
    }

    if (classification === 'question') {
      return {
        type: 'reply',
        confidence: 'medium',
        reply: 'Thanks for the question. We will provide more context shortly.',
      };
    }

    return {
      type: 'discussion',
      confidence: 'low',
      reply: 'Thank you for raising this point. I will review and get back with details.',
    };
  }
}
