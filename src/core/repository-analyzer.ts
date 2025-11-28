/**
 * RepositoryAnalyzer - リポジトリ探索エンジン
 *
 * エージェント（Codex/Claude）を使用してリポジトリのコードベースを探索し、
 * バグ候補を検出します。
 *
 * @module repository-analyzer
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { BugCandidate } from '../types/auto-issue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * RepositoryAnalyzer クラス
 *
 * エージェントベースのコード解析により、リポジトリ内のバグ候補を検出します。
 */
export class RepositoryAnalyzer {
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
   * リポジトリを解析してバグ候補を検出
   *
   * @param repoPath - リポジトリパス
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @returns バグ候補のリスト
   * @throws エージェントが利用不可の場合、またはエージェント実行失敗時
   */
  public async analyze(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
  ): Promise<BugCandidate[]> {
    logger.info(`Analyzing repository: ${repoPath}`);

    // 1. プロンプトテンプレートを読み込み
    const promptPath = path.resolve(__dirname, '../prompts/auto-issue/detect-bugs.txt');
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt template not found: ${promptPath}`);
    }

    const template = fs.readFileSync(promptPath, 'utf-8');

    // 2. プロンプト変数を置換
    const prompt = template.replace('{repository_path}', repoPath);

    // 3. エージェントを選択（auto の場合は Codex → Claude フォールバック）
    let rawOutput: string;
    let selectedAgent = agent;

    if (agent === 'codex' || agent === 'auto') {
      if (!this.codexClient) {
        if (agent === 'codex') {
          throw new Error('Codex agent is not available.');
        }
        // auto モードで Codex が利用不可の場合、Claude にフォールバック
        logger.warn('Codex not available, falling back to Claude.');
        selectedAgent = 'claude';
      } else {
        try {
          logger.info('Using Codex agent for bug detection.');
          const events = await this.codexClient.executeTask({ prompt });
          rawOutput = events.join('\n');
        } catch (error) {
          if (agent === 'codex') {
            throw error;
          }
          // auto モードで Codex 失敗の場合、Claude にフォールバック
          logger.warn(`Codex failed (${getErrorMessage(error)}), falling back to Claude.`);
          selectedAgent = 'claude';
        }
      }
    }

    if (selectedAgent === 'claude') {
      if (!this.claudeClient) {
        throw new Error('Claude agent is not available.');
      }
      logger.info('Using Claude agent for bug detection.');
      const events = await this.claudeClient.executeTask({ prompt });
      rawOutput = events.join('\n');
    }

    // 4. エージェント出力をパース
    const candidates = this.parseAgentOutput(rawOutput!);

    // 5. バリデーション
    const validCandidates = candidates.filter((c) => this.validateBugCandidate(c));

    logger.info(
      `Parsed ${candidates.length} candidates, ${validCandidates.length} valid after validation.`,
    );

    return validCandidates;
  }

  /**
   * エージェント出力をパース
   *
   * @param rawOutput - エージェントの生出力（JSON/Markdown）
   * @returns パース済みバグ候補のリスト
   */
  private parseAgentOutput(rawOutput: string): BugCandidate[] {
    // JSON形式の出力を期待
    // エージェントプロンプトで「JSON形式で出力」を指示しているため、
    // rawOutput から JSON ブロックを抽出してパース

    // パターン1: ```json ... ``` 形式
    const jsonMatch = rawOutput.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.bugs && Array.isArray(parsed.bugs)) {
          logger.debug(`Successfully parsed ${parsed.bugs.length} bugs from JSON block.`);
          return parsed.bugs as BugCandidate[];
        }
      } catch (error) {
        logger.warn(`Failed to parse JSON output: ${getErrorMessage(error)}`);
      }
    }

    // パターン2: ``` ... ``` 形式（jsonキーワードなし）
    const codeBlockMatch = rawOutput.match(/```\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        if (parsed.bugs && Array.isArray(parsed.bugs)) {
          logger.debug(`Successfully parsed ${parsed.bugs.length} bugs from code block.`);
          return parsed.bugs as BugCandidate[];
        }
      } catch (error) {
        logger.debug(`Code block is not valid JSON: ${getErrorMessage(error)}`);
      }
    }

    // パターン3: 直接JSON（コードブロックなし）
    try {
      const parsed = JSON.parse(rawOutput);
      if (parsed.bugs && Array.isArray(parsed.bugs)) {
        logger.debug(`Successfully parsed ${parsed.bugs.length} bugs from raw JSON.`);
        return parsed.bugs as BugCandidate[];
      }
    } catch (error) {
      logger.debug(`Raw output is not valid JSON: ${getErrorMessage(error)}`);
    }

    // フォールバック: パース失敗
    logger.warn('Failed to parse agent output as JSON. Returning empty array.');
    return [];
  }

  /**
   * バグ候補のバリデーション
   *
   * @param candidate - バグ候補
   * @returns バリデーション結果（true: 有効、false: 無効）
   */
  private validateBugCandidate(candidate: BugCandidate): boolean {
    // 必須フィールドの存在確認
    if (!candidate || typeof candidate !== 'object') {
      logger.debug('Invalid candidate: not an object');
      return false;
    }

    // タイトル検証（10〜100文字）
    if (!candidate.title || typeof candidate.title !== 'string') {
      logger.debug('Invalid candidate: missing or invalid title');
      return false;
    }
    if (candidate.title.length < 10 || candidate.title.length > 100) {
      logger.debug(
        `Invalid candidate: title length ${candidate.title.length} is out of range (10-100)`,
      );
      return false;
    }

    // ファイルパス検証（TypeScript または Python のみ、Phase 1限定）
    if (!candidate.file || typeof candidate.file !== 'string') {
      logger.debug('Invalid candidate: missing or invalid file');
      return false;
    }
    const isTypeScript = candidate.file.endsWith('.ts') || candidate.file.endsWith('.tsx');
    const isPython = candidate.file.endsWith('.py');
    if (!isTypeScript && !isPython) {
      logger.debug(
        `Invalid candidate: file "${candidate.file}" is not TypeScript or Python (Phase 1 limitation)`,
      );
      return false;
    }

    // 行番号検証（正の整数）
    if (typeof candidate.line !== 'number' || candidate.line < 1) {
      logger.debug(`Invalid candidate: invalid line number ${candidate.line}`);
      return false;
    }

    // 深刻度検証
    if (!['high', 'medium', 'low'].includes(candidate.severity)) {
      logger.debug(`Invalid candidate: invalid severity "${candidate.severity}"`);
      return false;
    }

    // 説明検証（最低50文字）
    if (!candidate.description || typeof candidate.description !== 'string') {
      logger.debug('Invalid candidate: missing or invalid description');
      return false;
    }
    if (candidate.description.length < 50) {
      logger.debug(
        `Invalid candidate: description length ${candidate.description.length} is too short (min 50)`,
      );
      return false;
    }

    // 修正案検証（最低20文字）
    if (!candidate.suggestedFix || typeof candidate.suggestedFix !== 'string') {
      logger.debug('Invalid candidate: missing or invalid suggestedFix');
      return false;
    }
    if (candidate.suggestedFix.length < 20) {
      logger.debug(
        `Invalid candidate: suggestedFix length ${candidate.suggestedFix.length} is too short (min 20)`,
      );
      return false;
    }

    // カテゴリ検証（Phase 1では 'bug' 固定）
    if (candidate.category !== 'bug') {
      logger.debug(`Invalid candidate: invalid category "${candidate.category}" (must be "bug")`);
      return false;
    }

    return true;
  }
}
