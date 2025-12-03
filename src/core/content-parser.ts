import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAI } from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { EvaluationDecisionResult, PhaseName, RemainingTask } from '../types.js';
import { config } from './config.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { ClaudeAgentClient } from './claude-agent-client.js';
import { CodexAgentClient } from './codex-agent-client.js';

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
  private readonly promptDir: string;

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
    if (codexApiKey) {
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
          '- CODEX_API_KEY (for Codex Agent)',
        ].join('\n'),
      );
    }

    if (this.mode === 'auto' && !this.claudeAgentClient && !this.codexAgentClient && !this.openaiClient && !this.anthropicClient) {
      throw new Error(
        [
          'No API key configured for ContentParser.',
          'Set one of the following environment variables:',
          '- CLAUDE_CODE_OAUTH_TOKEN or CLAUDE_CODE_API_KEY (for Claude Agent)',
          '- CODEX_API_KEY (for Codex Agent)',
          '- OPENAI_API_KEY (for OpenAI API)',
          '- ANTHROPIC_API_KEY (for Anthropic API)',
        ].join('\n'),
      );
    }

    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    this.promptDir = path.resolve(moduleDir, '..', 'prompts', 'content_parser');

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
    const promptPath = path.join(this.promptDir, `${promptName}.txt`);
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    return fs.readFileSync(promptPath, 'utf-8');
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
      const parsed = JSON.parse(content) as { result?: string };
      const result = (parsed.result ?? 'FAIL').toUpperCase();

      return {
        result,
        feedback: fullText,
        suggestions: [],
      };
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to parse review result via LLM: ${message}`);

      const upper = fullText.toUpperCase();
      let inferred = 'FAIL';
      if (upper.includes('PASS_WITH_SUGGESTIONS')) {
        inferred = 'PASS_WITH_SUGGESTIONS';
      } else if (upper.includes('PASS')) {
        inferred = 'PASS';
      }

      return {
        result: inferred,
        feedback: fullText,
        suggestions: [],
      };
    }
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
      const patterns = [
        /DECISION:\s*([A-Z_]+)/i,
        /\*\*総合評価\*\*.*?\*\*([A-Z_]+)\*\*/i,
        /(?:判定|決定|結果)[:：]\s*\**([A-Z_]+)\**/i,
      ];

      let match: RegExpMatchArray | null = null;
      for (const pattern of patterns) {
        match = content.match(pattern);
        if (match) break;
      }

      if (!match) {
        logger.warn('No decision pattern matched in fallback. Defaulting to PASS.');
        return { success: true, decision: 'PASS' };
      }

      const decision = match[1].trim().toUpperCase();
      logger.info(`Fallback extracted decision: ${decision}`);

      return { success: true, decision };
    } catch (error) {
      const message = getErrorMessage(error);
      return {
        success: false,
        error: `判定解析中にエラー: ${message}`,
      };
    }
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
