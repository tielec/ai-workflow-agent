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

    // 改行コードを正規化（\r\n -> \n）
    const normalizedOutput = rawOutput.replace(/\r\n/g, '\n');

    // 複数のJSONブロックをすべて抽出（エージェントが複数のバグを別々に出力する場合）
    const allCandidates: BugCandidate[] = [];

    // パターン1: ```json ... ``` 形式（複数マッチ対応、改行の柔軟性向上）
    const jsonMatches = normalizedOutput.matchAll(/```json\s*\n([\s\S]*?)\n\s*```/g);
    for (const match of jsonMatches) {
      const parsed = this.tryParseJson(match[1].trim(), 'JSON block');
      if (parsed) {
        allCandidates.push(...parsed);
      }
    }

    // パターン2: ``` ... ``` 形式（jsonキーワードなし、複数マッチ対応）
    if (allCandidates.length === 0) {
      const codeBlockMatches = normalizedOutput.matchAll(/```\s*\n([\s\S]*?)\n\s*```/g);
      for (const match of codeBlockMatches) {
        const parsed = this.tryParseJson(match[1].trim(), 'code block');
        if (parsed) {
          allCandidates.push(...parsed);
        }
      }
    }

    // パターン3: {"bugs": [...]} 形式を直接抽出
    if (allCandidates.length === 0) {
      const bugsArrayMatch = normalizedOutput.match(/\{\s*"bugs"\s*:\s*\[[\s\S]*?\]\s*\}/);
      if (bugsArrayMatch) {
        const parsed = this.tryParseJson(bugsArrayMatch[0], 'bugs array');
        if (parsed) {
          allCandidates.push(...parsed);
        }
      }
    }

    // パターン4: { で始まり } で終わるJSONオブジェクトを抽出（コードブロックなし）
    if (allCandidates.length === 0) {
      const jsonObjectMatches = normalizedOutput.matchAll(/(\{[\s\S]*?"title"[\s\S]*?"file"[\s\S]*?\})/g);
      for (const match of jsonObjectMatches) {
        const parsed = this.tryParseJson(match[1], 'inline JSON');
        if (parsed) {
          allCandidates.push(...parsed);
        }
      }
    }

    // パターン5: 直接JSON（出力全体がJSON）
    if (allCandidates.length === 0) {
      const parsed = this.tryParseJson(normalizedOutput.trim(), 'raw output');
      if (parsed) {
        allCandidates.push(...parsed);
      }
    }

    if (allCandidates.length === 0) {
      logger.warn('Failed to parse agent output as JSON. Returning empty array.');
      logger.debug(`Raw output (first 1000 chars): ${normalizedOutput.substring(0, 1000)}`);
    } else {
      logger.debug(`Successfully parsed ${allCandidates.length} candidates from agent output.`);
    }

    return allCandidates;
  }

  /**
   * JSONをパースしてBugCandidate配列に変換
   *
   * @param jsonStr - JSON文字列
   * @param source - ログ用のソース説明
   * @returns BugCandidate配列、またはパース失敗時はnull
   */
  private tryParseJson(jsonStr: string, source: string): BugCandidate[] | null {
    try {
      const parsed = JSON.parse(jsonStr);

      // パターンA: { "bugs": [...] } 形式
      if (parsed.bugs && Array.isArray(parsed.bugs)) {
        logger.debug(`Parsed ${parsed.bugs.length} bugs from ${source} (bugs array format).`);
        return parsed.bugs as BugCandidate[];
      }

      // パターンB: [...] 配列形式
      if (Array.isArray(parsed)) {
        logger.debug(`Parsed ${parsed.length} bugs from ${source} (array format).`);
        return parsed as BugCandidate[];
      }

      // パターンC: 単一オブジェクト形式（{ "title": ..., "file": ... }）
      if (parsed.title && parsed.file) {
        logger.debug(`Parsed 1 bug from ${source} (single object format).`);
        return [parsed as BugCandidate];
      }

      logger.debug(`${source}: JSON parsed but no valid bug structure found.`);
      return null;
    } catch (error) {
      logger.debug(`${source}: Failed to parse JSON - ${getErrorMessage(error)}`);
      return null;
    }
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
