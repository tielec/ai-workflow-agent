import { logger } from '../utils/logger.js';
import process from 'node:process';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { EvaluationDecisionResult, PhaseName, RemainingTask } from '../types.js';
import { config } from './config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { ClaudeAgentClient } from './claude-agent-client.js';
import { CodexAgentClient } from './codex-agent-client.js';
import { detectCodexCliAuth, isValidCodexApiKey } from './helpers/codex-credentials.js';
import { PromptLoader } from './prompt-loader.js';

interface ReviewParseResult {
  result: string;
  feedback: string;
  suggestions: string[];
}

/**
 * 実行モードの定義
 * - 'openai': OpenAI API を使用（OPENAI_API_KEY が必要）
 * - 'claude': Anthropic API を使用（ANTHROPIC_API_KEY が必要）
 * - 'agent': エージェント SDK を使用（Codex または Claude）
 *   - CODEX_API_KEY → Codex Agent
 *   - CLAUDE_CODE_OAUTH_TOKEN / CLAUDE_CODE_API_KEY → Claude Agent
 * - 'auto': 利用可能な API を自動選択
 *   優先順: codex-agent → claude-agent → openai-api → anthropic-api
 */
export type ContentParserMode = 'openai' | 'claude' | 'agent' | 'auto';

/**
 * 内部で使用する実効モード
 */
type EffectiveMode = 'openai' | 'claude' | 'claude-agent' | 'codex-agent';

export class ContentParser {
  private readonly openaiClient: OpenAI | null;
  private readonly anthropicClient: Anthropic | null;
  private readonly claudeAgentClient: ClaudeAgentClient | null;
  private readonly codexAgentClient: CodexAgentClient | null;
  private readonly mode: ContentParserMode;
  private readonly openaiModel: string;
  private readonly anthropicModel: string;

  constructor(options: { apiKey?: string; anthropicApiKey?: string; model?: string; anthropicModel?: string; mode?: ContentParserMode } = {}) {
    this.mode = options.mode ?? 'auto';

    // OpenAI クライアントの初期化
    const openaiApiKey = options.apiKey ?? config.getOpenAiApiKey();
    if (openaiApiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
    } else {
      this.openaiClient = null;
    }
    this.openaiModel = options.model ?? 'gpt-4o-mini';

    // Anthropic クライアントの初期化
    const anthropicApiKey = options.anthropicApiKey ?? config.getAnthropicApiKey();
    if (anthropicApiKey) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicApiKey });
    } else {
      this.anthropicClient = null;
    }
    this.anthropicModel = options.anthropicModel ?? 'claude-3-5-sonnet-20241022';

    // Claude Agent クライアントの初期化
    const claudeToken = config.getClaudeCodeToken();
    if (claudeToken) {
      try {
        this.claudeAgentClient = new ClaudeAgentClient();
      } catch {
        this.claudeAgentClient = null;
      }
    } else {
      this.claudeAgentClient = null;
    }

    // Codex Agent クライアントの初期化
    const codexApiKey = config.getCodexApiKey();
    const { authFilePath: codexAuthFile } = detectCodexCliAuth();
    const hasCodexCredentials = isValidCodexApiKey(codexApiKey) || codexAuthFile !== null;
    if (hasCodexCredentials) {
      if (isValidCodexApiKey(codexApiKey)) {
        const trimmed = codexApiKey.trim();
        process.env.CODEX_API_KEY = trimmed;
        if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_API_KEY.trim()) {
          process.env.OPENAI_API_KEY = trimmed;
        }
      } else if (codexAuthFile) {
        logger.info(`CODEX_AUTH_JSON detected at ${codexAuthFile} for ContentParser.`);
      }
      try {
        this.codexAgentClient = new CodexAgentClient({ model: 'gpt-4o' });
      } catch {
        this.codexAgentClient = null;
      }
    } else {
      this.codexAgentClient = null;
    }

    // モードに応じた検証
    if (this.mode === 'openai' && !this.openaiClient) {
      throw new Error(
        [
          'OpenAI API key is required for openai mode.',
          'Set the OPENAI_API_KEY environment variable or pass apiKey via constructor.',
          'You can create an API key from https://platform.openai.com/api-keys',
        ].join('\n'),
      );
    }

    if (this.mode === 'claude' && !this.anthropicClient) {
      throw new Error(
        [
          'Anthropic API key is required for claude mode.',
          'Set the ANTHROPIC_API_KEY environment variable or pass anthropicApiKey via constructor.',
          'You can create an API key from https://console.anthropic.com/',
        ].join('\n'),
      );
    }

    if (this.mode === 'agent' && !this.claudeAgentClient && !this.codexAgentClient) {
      throw new Error(
        [
          'Agent credentials are required for agent mode.',
          'Set one of the following environment variables:',
          '- CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY (for Claude Agent)',
          '- CODEX_API_KEY or CODEX_AUTH_JSON (for Codex Agent)',
        ].join('\n'),
      );
    }

    if (this.mode === 'auto' && !this.claudeAgentClient && !this.codexAgentClient && !this.openaiClient && !this.anthropicClient) {
      throw new Error(
        [
          'No API key configured for ContentParser.',
          'Set one of the following environment variables:',
          '- CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY (for Claude Agent)',
          '- CODEX_API_KEY or CODEX_AUTH_JSON (for Codex Agent)',
          '- OPENAI_API_KEY (for OpenAI API)',
          '- ANTHROPIC_API_KEY (for Anthropic API)',
        ].join('\n'),
      );
    }

    // 使用するモードをログ出力
    const effectiveMode = this.getEffectiveMode();
    logger.debug(`ContentParser initialized with mode: ${effectiveMode}`);
  }

  /**
   * 実際に使用されるモードを取得
   * 優先順: codex-agent → claude-agent → openai → claude
   * （フェーズ実行の auto モードと同じ優先順）
   */
  private getEffectiveMode(): EffectiveMode {
    if (this.mode === 'openai') {
      return 'openai';
    }
    if (this.mode === 'claude') {
      return 'claude';
    }
    if (this.mode === 'agent') {
      // agent モード: Codex Agent を優先、なければ Claude Agent
      if (this.codexAgentClient) {
        return 'codex-agent';
      }
      return 'claude-agent';
    }
    // auto モード: codex-agent → claude-agent → openai → claude の優先順
    if (this.codexAgentClient) {
      return 'codex-agent';
    }
    if (this.claudeAgentClient) {
      return 'claude-agent';
    }
    if (this.openaiClient) {
      return 'openai';
    }
    return 'claude';
  }

  /**
   * LLM API を呼び出す共通メソッド
   */
  private async callLlm(prompt: string, maxTokens: number): Promise<string> {
    const effectiveMode = this.getEffectiveMode();

    if (effectiveMode === 'claude-agent' && this.claudeAgentClient) {
      return this.callClaudeAgentLlm(prompt);
    }

    if (effectiveMode === 'codex-agent' && this.codexAgentClient) {
      return this.callCodexAgentLlm(prompt);
    }

    if (effectiveMode === 'openai' && this.openaiClient) {
      const response = await this.openaiClient.chat.completions.create({
        model: this.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: 0,
      });
      return response.choices?.[0]?.message?.content ?? '{}';
    }

    if (effectiveMode === 'claude' && this.anthropicClient) {
      const response = await this.anthropicClient.messages.create({
        model: this.anthropicModel,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      // TextBlock からテキストを抽出
      const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
      return textBlock ? textBlock.text : '{}';
    }

    throw new Error('No LLM client available');
  }

  /**
   * Claude Agent SDK を使用して LLM を呼び出す
   * テキスト解析専用のため、maxTurns=1 で単一応答を取得
   */
  private async callClaudeAgentLlm(prompt: string): Promise<string> {
    if (!this.claudeAgentClient) {
      throw new Error('Claude Agent client is not initialized');
    }

    const messages = await this.claudeAgentClient.executeTask({
      prompt,
      maxTurns: 1,
      verbose: false,
    });

    // エージェントの応答からテキストを抽出
    return this.extractTextFromAgentMessages(messages);
  }

  /**
   * Codex Agent を使用して LLM を呼び出す
   * テキスト解析専用のため、maxTurns=1 で単一応答を取得
   */
  private async callCodexAgentLlm(prompt: string): Promise<string> {
    if (!this.codexAgentClient) {
      throw new Error('Codex Agent client is not initialized');
    }

    const messages = await this.codexAgentClient.executeTask({
      prompt,
      maxTurns: 1,
      verbose: false,
    });

    // エージェントの応答からテキストを抽出
    return this.extractTextFromCodexMessages(messages);
  }

  /**
   * Claude Agent メッセージからテキストを抽出
   */
  private extractTextFromAgentMessages(messages: string[]): string {
    const textBlocks: string[] = [];

    for (const rawMessage of messages) {
      try {
        const message = JSON.parse(rawMessage);

        // result メッセージからテキストを抽出
        if (message.type === 'result' && message.result) {
          textBlocks.push(message.result);
        }

        // assistant メッセージからテキストを抽出
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              textBlocks.push(block.text);
            }
          }
        }
      } catch {
        // JSON パースエラーは無視
      }
    }

    const result = textBlocks.join('\n').trim();
    return result || '{}';
  }

  /**
   * Codex Agent メッセージからテキストを抽出
   */
  private extractTextFromCodexMessages(messages: string[]): string {
    const textBlocks: string[] = [];

    for (const rawMessage of messages) {
      try {
        const message = JSON.parse(rawMessage);

        // agent_message からテキストを抽出
        if (message.type === 'item.completed' && message.item) {
          const item = message.item as Record<string, unknown>;
          const itemType = typeof item.type === 'string' ? item.type : '';
          if (itemType === 'agent_message') {
            const text = typeof item.text === 'string' ? item.text : '';
            if (text.trim()) {
              textBlocks.push(text);
            }
          }
        }

        // response.completed からテキストを抽出
        if (message.type === 'response.completed' && message.response?.output) {
          const output = message.response.output as unknown[];
          for (const item of output) {
            if (typeof item === 'object' && item !== null) {
              const obj = item as Record<string, unknown>;
              if (obj.type === 'message' && typeof obj.content === 'string') {
                textBlocks.push(obj.content);
              }
            }
          }
        }
      } catch {
        // JSON パースエラーは無視
      }
    }

    const result = textBlocks.join('\n').trim();
    return result || '{}';
  }

  private loadPrompt(promptName: string): string {
    return PromptLoader.loadPrompt('content_parser', promptName);
  }

  public async extractDesignDecisions(documentContent: string): Promise<Record<string, string>> {
    const template = this.loadPrompt('extract_design_decisions');
    const prompt = template.replace('{document_content}', documentContent);

    try {
      const content = await this.callLlm(prompt, 1024);
      const parsed = JSON.parse(content) as Record<string, string | null | undefined>;
      const result: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string' && value.trim().length > 0) {
          result[key] = value;
        }
      }
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to extract design decisions: ${message}`);
      return {};
    }
  }

  public async parseReviewResult(messages: string[]): Promise<ReviewParseResult> {
    const textBlocks: string[] = [];

    for (const rawMessage of messages) {
      try {
        const message = JSON.parse(rawMessage);

        // Extract text from assistant messages
        if (message.type === 'assistant' && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === 'text' && block.text) {
              textBlocks.push(block.text);
            }
          }
        }

        // Extract text from result messages
        if (message.type === 'result' && message.result) {
          textBlocks.push(message.result);
        }

        // Extract text from Codex agent_message items
        if (message.type === 'item.completed' && message.item) {
          const item = message.item as Record<string, unknown>;
          const itemType = typeof item.type === 'string' ? item.type : '';
          if (itemType === 'agent_message') {
            const text = typeof item.text === 'string' ? item.text : '';
            if (text.trim()) {
              textBlocks.push(text);
            }
          }
        }
      } catch (parseError) {
        // Not JSON, try legacy Python-style parsing
        const message = rawMessage ?? '';
        const resultRegex = /result="([^"]*)"/;

        const resultMatch = message.includes('ResultMessage')
          ? message.match(resultRegex)
          : null;
        if (resultMatch) {
          const normalized = this.normalizeEscapedText(resultMatch[1]);
          textBlocks.push(normalized);
          continue;
        }

        if (message.includes('AssistantMessage') && message.includes('TextBlock(text=')) {
          const start = message.indexOf('TextBlock(text=') + 'TextBlock(text='.length;
          const end = message.indexOf("')", start);
          if (end === -1) {
            continue;
          }

          const extracted = this.normalizeEscapedText(message.slice(start, end));
          if (this.shouldKeepAssistantText(extracted)) {
            textBlocks.push(extracted);
          }
        }
      }
    }

    const fullText = textBlocks.join('\n').trim();
    if (!fullText) {
      return {
        result: 'FAIL',
        feedback: 'レビュー結果を解析できませんでした。',
        suggestions: ['レビュー用のプロンプトや実行ログを確認してください。'],
      };
    }

    const template = this.loadPrompt('parse_review_result');
    const prompt = template.replace('{full_text}', fullText);

    try {
      const content = await this.callLlm(prompt, 256);

      // Step 1: JSON抽出前処理（NEW）
      const jsonString = this.extractJsonFromResponse(content);
      if (!jsonString) {
        throw new Error('No JSON found in response');
      }

      // Step 2: JSON.parse()
      const parsed = JSON.parse(jsonString) as { result?: string };
      const result = (parsed.result ?? 'FAIL').toUpperCase();

      return {
        result,
        feedback: fullText,
        suggestions: [],
      };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to parse review result via LLM: ${message}`);

      // Step 3: フォールバック判定（改善）
      const inferred = this.inferDecisionFromText(fullText);

      return {
        result: inferred,
        feedback: fullText,
        suggestions: [],
      };
    }
  }

  /**
   * LLMレスポンスからJSON部分のみを抽出
   *
   * @param content - LLMレスポンス全文
   * @returns JSON文字列（抽出成功時）、null（抽出失敗時）
   *
   * @example
   * // Input: '{"result": "FAIL"} \n理由: タスク分割が不十分...'
   * // Output: '{"result": "FAIL"}'
   */
  private extractJsonFromResponse(content: string): string | null {
    // 正規表現: 最初の { から最後の } までを抽出（非貪欲マッチ）
    const jsonMatch = content.match(/\{[\s\S]*?\}/);

    if (!jsonMatch) {
      logger.debug('No JSON pattern found in response');
      return null;
    }

    const jsonString = jsonMatch[0].trim();
    logger.debug(`Extracted JSON: ${jsonString}`);

    return jsonString;
  }

  /**
   * マーカーパターンによるフォールバック判定
   *
   * @param text - LLMレスポンス全文
   * @returns 判定結果（'PASS' | 'FAIL' | 'PASS_WITH_SUGGESTIONS'）
   *
   * @example
   * // Input: '最終判定: FAIL\n理由: タスク分割が不十分...'
   * // Output: 'FAIL'
   *
   * // Input: '再度レビューを実施し、PASS判定が可能になります'
   * // Output: 'FAIL' (デフォルト)
   */
  private inferDecisionFromText(text: string): string {
    // マーカーパターン（優先順位付き）
    const patterns = [
      /最終判定[:：]\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i,
      /判定結果[:：]\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i,
      /判定[:：]\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i,
      /\*\*結果[:：]?\*\*\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i,
      /DECISION[:：]\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i,
      /Determination[:：]\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i, // Issue #584: design, test_scenario, test_implementation, testing, documentation
      /Judgment[:：]\s*(PASS|FAIL|PASS_WITH_SUGGESTIONS)/i, // Issue #584: implementation, report
    ];

    // パターンを順番にマッチング（最初にマッチしたものを返す）
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const decision = match[1].toUpperCase();
        logger.info(`Fallback decision inferred: ${decision} (pattern: ${pattern.source})`);
        return decision;
      }
    }

    // いずれもマッチしない場合はデフォルトでFAIL（安全側に倒す）
    logger.info('No marker pattern matched. Defaulting to FAIL.');
    return 'FAIL';
  }

  private normalizeEscapedText(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }

  private shouldKeepAssistantText(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed) {
      return false;
    }

    const skipPatterns = [
      /^\s*'\s+in\s+message:/i,
      /^\s*\d+行/,
      /^I'll\s+conduct/i,
      /^Let me\s+/i,
      /^Now\s+let\s+me/i,
      /^Based on\s+my\s+.*review.*,\s*let me\s+provide/i,
    ];

    if (skipPatterns.some((pattern) => pattern.test(trimmed))) {
      return false;
    }

    if (trimmed.length < 50 && !trimmed.includes('**結果:')) {
      return false;
    }

    return true;
  }

  /**
   * Parse evaluation report and extract decision, remaining tasks, failed phase, and abort reason
   * Uses LLM to extract structured information from natural language
   */
  public async parseEvaluationDecision(content: string): Promise<EvaluationDecisionResult> {
    const template = this.loadPrompt('parse_evaluation_decision');
    const prompt = template.replace('{evaluation_content}', content);

    try {
      const responseContent = await this.callLlm(prompt, 2048);
      const parsed = JSON.parse(responseContent) as {
        decision?: string;
        failedPhase?: string | null;
        abortReason?: string | null;
        remainingTasks?: RemainingTask[] | null;
      };

      const decision = (parsed.decision ?? 'PASS').toUpperCase();
      logger.info(`Extracted decision: ${decision}`);

      // Validate decision
      const validDecisions = ['PASS', 'PASS_WITH_ISSUES', 'ABORT'];
      const isValidFailPhase = decision.startsWith('FAIL_PHASE_');

      if (!validDecisions.includes(decision) && !isValidFailPhase) {
        return {
          success: false,
          decision,
          error: `無効な判定タイプ: ${decision}`,
        };
      }

      // Build result
      const result: EvaluationDecisionResult = {
        success: true,
        decision,
      };

      // Map failedPhase if FAIL_PHASE_*
      if (isValidFailPhase && parsed.failedPhase) {
        const mappedPhase = this.mapPhaseKey(parsed.failedPhase);
        if (!mappedPhase) {
          return {
            success: false,
            decision,
            error: `無効なフェーズ名: ${parsed.failedPhase}`,
          };
        }
        result.failedPhase = mappedPhase;
      }

      // Include abort reason if ABORT
      if (decision === 'ABORT' && parsed.abortReason) {
        result.abortReason = parsed.abortReason;
      }

      // Include remaining tasks if PASS_WITH_ISSUES
      if (decision === 'PASS_WITH_ISSUES' && parsed.remainingTasks) {
        result.remainingTasks = parsed.remainingTasks;
      }

      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to parse evaluation decision via LLM: ${message}`);

      // Fallback: Try simple pattern matching
      return this.parseEvaluationDecisionFallback(content);
    }
  }

  /**
   * Fallback pattern matching for evaluation decision when LLM parsing fails
   */
  private parseEvaluationDecisionFallback(content: string): EvaluationDecisionResult {
    logger.warn('Using fallback pattern matching for evaluation decision.');

    try {
      const decision = this.extractDecisionToken(content);
      const result: EvaluationDecisionResult = {
        success: true,
        decision,
      };

      if (decision.startsWith('FAIL_PHASE')) {
        const failedPhase = this.extractFailedPhase(content, decision);
        if (failedPhase) {
          result.failedPhase = failedPhase;
        }
      }

      if (decision === 'PASS_WITH_ISSUES') {
        const remainingTasks = this.extractRemainingTasks(content);
        if (remainingTasks.length > 0) {
          result.remainingTasks = remainingTasks;
        }
      }

      if (decision === 'ABORT') {
        const abortReason = this.extractAbortReason(content);
        if (abortReason) {
          result.abortReason = abortReason;
        }
      }

      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      return {
        success: false,
        error: `判定解析中にエラー: ${message}`,
      };
    }
  }

  private extractDecisionToken(content: string): string {
    const primaryMatch = content.match(/DECISION:\s*([A-Z0-9_]+)/i);
    if (primaryMatch?.[1]) {
      const decision = primaryMatch[1].trim().toUpperCase();
      logger.info(`Fallback extracted decision: ${decision}`);
      return decision;
    }

    const patterns = [
      /\*\*総合評価\*\*.*?\*\*([A-Z_]+)\*\*/i,
      /(?:判定|決定|結果)[:：]\s*\**([A-Z_]+)\**/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        const decision = match[1].trim().toUpperCase();
        logger.info(`Fallback extracted decision: ${decision}`);
        return decision;
      }
    }

    logger.warn('No decision pattern matched in fallback. Defaulting to PASS.');
    return 'PASS';
  }

  private extractFailedPhase(content: string, decision: string): PhaseName | null {
    const token = decision.replace(/^FAIL_PHASE_/, '');
    const mappedFromDecision = this.mapPhaseKey(token);
    if (mappedFromDecision) {
      return mappedFromDecision;
    }

    const failPhasePatterns = [
      /FAILED_PHASE:\s*([a-z_]+)/i,
      /(?:Rework|Re-?run|Fix)\s+Phase\s*(\d+)/i,
      /Phase\s*(\d+)\s*\([^)]+\)\s*(?:needs?|requires?)\s+(?:rework|fix)/i,
      /DECISION:\s*FAIL_PHASE_([a-z_]+)/i,
      /DECISION:\s*FAIL_PHASE_(\d+)/i,
    ];

    for (const pattern of failPhasePatterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        const mapped = this.mapPhaseKey(match[1].trim());
        if (mapped) {
          logger.info(`Fallback extracted failed phase: ${mapped}`);
          return mapped;
        }
      }
    }

    logger.warn('FAIL_PHASE detected but phase name could not be extracted.');
    return null;
  }

  private extractRemainingTasks(content: string): RemainingTask[] {
    const lines = content.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => /REMAINING_TASKS/i.test(line));
    if (startIndex === -1) {
      return [];
    }

    const tasks: RemainingTask[] = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed) {
        if (tasks.length > 0) {
          break;
        }
        continue;
      }

      if (/^[A-Z][A-Z0-9 _-]*:/.test(trimmed) && !trimmed.startsWith('-')) {
        break;
      }

      if (trimmed.startsWith('-')) {
        const taskText = trimmed.replace(/^-\s*(\[[xX ]\]\s*)?/, '').trim();
        if (taskText) {
          tasks.push({
            task: taskText,
            phase: 'general',
            priority: 'Medium',
          });
        }
      }
    }

    return tasks;
  }

  private extractAbortReason(content: string): string | null {
    const lines = content.split(/\r?\n/);
    const startIndex = lines.findIndex((line) => /ABORT_REASON/i.test(line));
    if (startIndex === -1) {
      return null;
    }

    const reasonLines: string[] = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      if (!trimmed && reasonLines.length > 0) {
        break;
      }

      if (/^[A-Z][A-Z0-9 _-]*:/.test(trimmed) && reasonLines.length > 0) {
        break;
      }

      if (trimmed) {
        reasonLines.push(trimmed);
      }
    }

    const reason = reasonLines.join('\n').trim();
    return reason.length > 0 ? reason : null;
  }

  private mapPhaseKey(phaseKey: string): PhaseName | null {
    const normalized = phaseKey.toLowerCase().replace(/[-_]/g, '');
    const mapping: Record<string, PhaseName> = {
      planning: 'planning',
      '0': 'planning',
      requirements: 'requirements',
      '1': 'requirements',
      design: 'design',
      '2': 'design',
      testscenario: 'test_scenario',
      '3': 'test_scenario',
      implementation: 'implementation',
      '4': 'implementation',
      testimplementation: 'test_implementation',
      '5': 'test_implementation',
      testing: 'testing',
      '6': 'testing',
      documentation: 'documentation',
      '7': 'documentation',
      report: 'report',
      '8': 'report',
    };

    return mapping[normalized] ?? null;
  }
}
