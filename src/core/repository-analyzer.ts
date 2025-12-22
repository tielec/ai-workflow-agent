/**
 * RepositoryAnalyzer - リポジトリ探索エンジン
 *
 * エージェント（Codex/Claude）を使用してリポジトリのコードベースを探索し、
 * バグ候補を検出します。
 *
 * @module repository-analyzer
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type {
  BugCandidate,
  RefactorCandidate,
  EnhancementProposal,
} from '../types/auto-issue.js';
import { parseCodexEvent } from './helpers/agent-event-parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 除外ディレクトリパターン
 *
 * これらのディレクトリは依存関係、生成ファイル、バージョン管理メタデータを含むため、
 * バグ検出対象から除外します。
 */
const EXCLUDED_DIRECTORIES = [
  'node_modules/',
  'vendor/',
  '.git/',
  'dist/',
  'build/',
  'out/',
  'target/',
  '__pycache__/',
  '.venv/',
  'venv/',
  '.pytest_cache/',
  '.mypy_cache/',
  'coverage/',
  '.next/',
  '.nuxt/',
];

/**
 * 除外ファイルパターン
 *
 * これらのパターンに一致するファイルは生成ファイル、ロックファイル、
 * バイナリファイルであるため、バグ検出対象から除外します。
 */
const EXCLUDED_FILE_PATTERNS = {
  // 生成ファイル
  generated: [
    '*.min.js',
    '*.bundle.js',
    '*.generated.*',
    '*.g.go', // Go generated files
    '*.pb.go', // Protocol Buffer generated files
    '*.gen.ts', // TypeScript generated files
  ],

  // ロックファイル
  lockFiles: [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Gemfile.lock',
    'poetry.lock',
    'Pipfile.lock',
    'go.sum',
    'Cargo.lock',
    'composer.lock',
  ],

  // バイナリファイル拡張子
  binary: [
    '.exe',
    '.dll',
    '.so',
    '.dylib',
    '.a',
    '.lib', // 実行ファイル/ライブラリ
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.svg',
    '.webp', // 画像
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx', // ドキュメント
    '.zip',
    '.tar',
    '.gz',
    '.bz2',
    '.7z',
    '.rar', // アーカイブ
    '.mp3',
    '.mp4',
    '.avi',
    '.mov',
    '.mkv', // メディア
    '.woff',
    '.woff2',
    '.ttf',
    '.eot', // フォント
  ],
};

/**
 * ワイルドカードパターンマッチング（簡易版）
 *
 * @param fileName - ファイル名
 * @param pattern - パターン（*.min.js, *.generated.* 等）
 * @returns マッチする場合は true
 */
function matchesWildcard(fileName: string, pattern: string): boolean {
  // '*' を正規表現の '.*' に置換（ReDoS対策として replaceAll を使用）
  const regexPattern = pattern.replaceAll('.', '\\.').replaceAll('*', '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(fileName);
}

/**
 * ファイルパスが除外ディレクトリに含まれるかチェック
 *
 * @param filePath - チェック対象のファイルパス
 * @returns 除外すべき場合は true
 */
function isExcludedDirectory(filePath: string): boolean {
  // パス正規化（セキュリティ対策）
  const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

  // 先頭の './' を削除し、トップレベルディレクトリも検出できるようにする
  const sanitizedPath = normalizedPath.replace(/^\.\//, '');

  // パストラバーサル攻撃防止（../ を含むパスを拒否）
  if (normalizedPath.includes('../')) {
    logger.warn(`Potentially malicious path detected: ${filePath}`);
    return true; // 疑わしいパスは除外
  }

  return EXCLUDED_DIRECTORIES.some((dir) => {
    const normalizedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
    const boundaryPattern = new RegExp(`(?:^|/)${normalizedDir}(?:/|$)`);
    return boundaryPattern.test(sanitizedPath);
  });
}

/**
 * ファイルパスが除外ファイルパターンに一致するかチェック
 *
 * @param filePath - チェック対象のファイルパス
 * @returns 除外すべき場合は true
 */
function isExcludedFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  const extension = path.extname(filePath);

  // 生成ファイルチェック
  if (
    EXCLUDED_FILE_PATTERNS.generated.some((pattern) =>
      pattern.includes('*') ? matchesWildcard(fileName, pattern) : fileName === pattern,
    )
  ) {
    return true;
  }

  // ロックファイルチェック
  if (EXCLUDED_FILE_PATTERNS.lockFiles.includes(fileName)) {
    return true;
  }

  // バイナリファイルチェック
  if (EXCLUDED_FILE_PATTERNS.binary.includes(extension)) {
    return true;
  }

  return false;
}

/**
 * 出力ファイルパスを生成
 *
 * @param prefix - ファイル名のプレフィックス（'bugs' | 'refactor' | 'enhancements'）
 * @returns 一時ディレクトリ内のユニークなファイルパス
 */
type OutputPrefix = 'bugs' | 'refactor' | 'enhancements';

interface RepositoryAnalyzerOptions {
  outputFileFactory?: (prefix: OutputPrefix) => string;
}

interface AnalyzeOptions {
  customInstruction?: string;
  creativeMode?: boolean;
}

function generateOutputFilePath(prefix: OutputPrefix = 'bugs'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(os.tmpdir(), `auto-issue-${prefix}-${timestamp}-${random}.json`);
}

/**
 * RepositoryAnalyzer クラス
 *
 * エージェントベースのコード解析により、リポジトリ内のバグ候補を検出します。
 */
export class RepositoryAnalyzer {
  private readonly codexClient: CodexAgentClient | null;
  private readonly claudeClient: ClaudeAgentClient | null;
  private readonly outputFileFactory?: (prefix: OutputPrefix) => string;

  /**
   * コンストラクタ
   *
   * @param codexClient - Codexエージェントクライアント（nullの場合は使用不可）
   * @param claudeClient - Claudeエージェントクライアント（nullの場合は使用不可）
   */
  constructor(
    codexClient: CodexAgentClient | null,
    claudeClient: ClaudeAgentClient | null,
    options: RepositoryAnalyzerOptions = {},
  ) {
    this.codexClient = codexClient;
    this.claudeClient = claudeClient;
    this.outputFileFactory = options.outputFileFactory;
  }

  /**
   * リポジトリを解析してバグ候補を検出
   *
   * @param repoPath - リポジトリパス
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param options - カスタム指示などのオプション
   * @returns バグ候補のリスト
   * @throws エージェントが利用不可の場合、またはエージェント実行失敗時
   */
  public async analyze(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<BugCandidate[]> {
    logger.info(`Analyzing repository: ${repoPath}`);

    // 1. プロンプトパスと出力ファイルパスを準備
    const promptPath = path.resolve(__dirname, '../prompts/auto-issue/detect-bugs.txt');
    const outputFilePath = this.outputFileFactory?.('bugs') ?? generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    try {
      // 2. 共通エージェント実行メソッド呼び出し
      await this.executeAgentWithFallback(promptPath, outputFilePath, repoPath, agent, options);

      // 3. 出力ファイルからJSONを読み込み
      const candidates = this.readOutputFile(outputFilePath);

      // 4. 共通バリデーションメソッド呼び出し
      const validCandidates = this.validateAnalysisResult(candidates, 'bug');

      return validCandidates;
    } finally {
      // 5. 一時ファイルをクリーンアップ（成功・失敗に関わらず）
      this.cleanupOutputFile(outputFilePath);
    }
  }

  /**
   * リポジトリを解析してリファクタリング候補を検出
   *
   * @param repoPath - リポジトリパス
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param options - カスタム指示などのオプション
   * @returns リファクタリング候補のリスト
   * @throws エージェントが利用不可の場合、またはエージェント実行失敗時
   */
  public async analyzeForRefactoring(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<RefactorCandidate[]> {
    logger.info(`Analyzing repository for refactoring: ${repoPath}`);

    // 1. プロンプトパスと出力ファイルパスを準備
    const promptPath = path.resolve(__dirname, '../prompts/auto-issue/detect-refactoring.txt');
    const outputFilePath = this.outputFileFactory?.('refactor') ?? generateOutputFilePath('refactor');
    logger.debug(`Output file path: ${outputFilePath}`);

    try {
      // 2. 共通エージェント実行メソッド呼び出し
      await this.executeAgentWithFallback(promptPath, outputFilePath, repoPath, agent, options);

      // 3. 出力ファイルからJSONを読み込み
      const candidates = this.readRefactorOutputFile(outputFilePath);

      // 4. 共通バリデーションメソッド呼び出し
      const validCandidates = this.validateAnalysisResult(candidates, 'refactor');

      return validCandidates;
    } finally {
      // 5. 一時ファイルをクリーンアップ（成功・失敗に関わらず）
      this.cleanupOutputFile(outputFilePath);
    }
  }

  /**
   * リポジトリを解析して機能拡張提案を生成
   *
   * @param repoPath - リポジトリパス
   * @param agent - 使用エージェント（'auto' | 'codex' | 'claude'）
   * @param options - オプション設定
   * @param options.creativeMode - 創造的モードを有効化（より実験的な提案を含める）
   * @param options.customInstruction - ユーザー指定のカスタム指示
   * @returns 機能拡張提案のリスト
   * @throws エージェントが利用不可の場合、またはエージェント実行失敗時
   */
  public async analyzeForEnhancements(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<EnhancementProposal[]> {
    logger.info(`Analyzing repository for enhancement proposals: ${repoPath}`);

    // 1. プロンプトパスと出力ファイルパスを準備
    const promptPath = path.resolve(__dirname, '../prompts/auto-issue/detect-enhancements.txt');
    const outputFilePath =
      this.outputFileFactory?.('enhancements') ?? generateOutputFilePath('enhancements');
    logger.debug(`Output file path: ${outputFilePath}`);

    try {
      // 2. 共通エージェント実行メソッド呼び出し（creative_mode変数を追加）
      await this.executeAgentWithFallback(
        promptPath,
        outputFilePath,
        repoPath,
        agent,
        options,
      );

      // 3. 出力ファイルからJSONを読み込み
      const proposals = this.readEnhancementOutputFile(outputFilePath);

      // 4. バリデーション
      const validProposals = proposals.filter((p) => this.validateEnhancementProposal(p));

      logger.info(
        `Parsed ${proposals.length} enhancement proposals, ${validProposals.length} valid after validation.`,
      );

      return validProposals;
    } finally {
      // 5. 一時ファイルをクリーンアップ（成功・失敗に関わらず）
      this.cleanupOutputFile(outputFilePath);
    }
  }

  /**
   * エージェント実行とフォールバックの共通処理
   *
   * プロンプトテンプレートの読み込み、変数置換、エージェント選択・実行を行います。
   * `agent='auto'` の場合、Codex → Claude のフォールバックを実行します。
   *
   * @param promptPath - プロンプトテンプレートファイルのパス（絶対パス）
   * @param outputFilePath - エージェントが結果を書き込むファイルのパス
   * @param repoPath - 解析対象のリポジトリパス
   * @param agent - 使用するエージェント（'auto' | 'codex' | 'claude'）
   * @param options - 追加オプション（creativeMode や customInstruction）
   * @throws エージェントが利用不可の場合、またはエージェント実行失敗時
   */
  private async executeAgentWithFallback(
    promptPath: string,
    outputFilePath: string,
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<void> {
    // 1. プロンプトテンプレート読み込み
    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt template not found: ${promptPath}`);
    }
    const template = fs.readFileSync(promptPath, 'utf-8');

    // 2. 変数置換
    let prompt = template
      .replace('{repository_path}', repoPath)
      .replace(/{output_file_path}/g, outputFilePath);

    // creative_mode変数の置換（enhancement用）
    if (options?.creativeMode !== undefined) {
      const creativeModeValue = options.creativeMode ? 'enabled' : 'disabled';
      // creative_mode のフラグ名を残したまま状態を明示する
      prompt = prompt.replace(/{creative_mode}/g, `creative_mode=${creativeModeValue}`);
    }

    prompt = this.injectCustomInstruction(prompt, options?.customInstruction);

    // 3. エージェント選択（auto の場合は Codex → Claude フォールバック）
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
          logger.info('Using Codex agent for analysis.');
          await this.codexClient.executeTask({ prompt });
          return; // 成功したら終了
        } catch (error) {
          if (agent === 'codex') {
            throw error; // codex強制モードではエラーをスロー
          }
          // auto モードで Codex 失敗の場合、Claude にフォールバック
          logger.warn(`Codex failed (${getErrorMessage(error)}), falling back to Claude.`);
          selectedAgent = 'claude';
        }
      }
    }

    // 4. Claude エージェント実行
    if (selectedAgent === 'claude') {
      if (!this.claudeClient) {
        throw new Error('Claude agent is not available.');
      }
      logger.info('Using Claude agent for analysis.');
      await this.claudeClient.executeTask({ prompt });
    }
  }

  /**
   * カスタム指示をプロンプトへ注入
   *
   * カスタム指示が指定されていない場合は、プレースホルダーを空文字で置換します。
   *
   * @param prompt - プロンプトテンプレート
   * @param customInstruction - カスタム指示
   * @returns 注入後のプロンプト
   */
  private injectCustomInstruction(prompt: string, customInstruction?: string): string {
    if (!prompt.includes('{custom_instruction}')) {
      return prompt;
    }

    if (!customInstruction) {
      return prompt.replace('{custom_instruction}', '');
    }

    const injected = `## 最優先: ユーザーからの特別指示

**以下のユーザー指示を最優先で実行してください。この指示は他のすべての検出ルールよりも優先されます。**

> ${customInstruction}

上記の指示に直接関連する項目のみを検出し、無関係な項目は出力しないでください。
`;

    logger.debug('Injecting custom instruction into prompt.');
    return prompt.replace('{custom_instruction}', `${injected}\n`);
  }

  /**
   * 解析結果のバリデーション（共通処理）
   *
   * candidateType に基づいて適切なバリデーションメソッドを選択し、
   * 有効な候補のみをフィルタリングします。
   *
   * @param candidates - バリデーション対象の候補リスト
   * @param candidateType - 候補のタイプ（'bug' | 'refactor'）
   * @returns 有効な候補のみをフィルタリングした配列
   */
  private validateAnalysisResult<T extends BugCandidate | RefactorCandidate>(
    candidates: T[],
    candidateType: 'bug' | 'refactor',
  ): T[] {
    // candidateType に基づいて適切なバリデータを選択
    const validCandidates = candidates.filter((c) => {
      if (candidateType === 'bug') {
        return this.validateBugCandidate(c as BugCandidate);
      } else {
        return this.validateRefactorCandidate(c as RefactorCandidate);
      }
    });

    logger.info(
      `Parsed ${candidates.length} ${candidateType} candidates, ${validCandidates.length} valid after validation.`,
    );

    return validCandidates;
  }

  /**
   * 出力ファイルからリファクタリング候補を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @returns リファクタリング候補のリスト
   */
  private readRefactorOutputFile(filePath: string): RefactorCandidate[] {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Agent may have failed to write the file.`);
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      const parsed = JSON.parse(content);

      // [...] 配列形式
      if (Array.isArray(parsed)) {
        logger.info(`Read ${parsed.length} refactoring candidates from output file.`);
        return parsed as RefactorCandidate[];
      }

      // { "candidates": [...] } 形式
      if (parsed.candidates && Array.isArray(parsed.candidates)) {
        logger.info(`Read ${parsed.candidates.length} refactoring candidates from output file.`);
        return parsed.candidates as RefactorCandidate[];
      }

      // 単一オブジェクト形式
      if (parsed.type && parsed.filePath) {
        logger.info('Read 1 refactoring candidate from output file.');
        return [parsed as RefactorCandidate];
      }

      logger.warn('Output file does not contain valid refactoring candidates structure.');
      return [];
    } catch (error) {
      logger.error(`Failed to read/parse refactoring output file: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * リポジトリコードを収集
   *
   * @param repoPath - リポジトリパス
   * @returns 収集したコードの文字列表現
   */
  private async collectRepositoryCode(repoPath: string): Promise<string> {
    const codeFiles: string[] = [];

    const collectFiles = async (dir: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(repoPath, fullPath);

        if (entry.isDirectory()) {
          // 除外ディレクトリをスキップ
          if (!isExcludedDirectory(relativePath)) {
            await collectFiles(fullPath);
          }
        } else if (entry.isFile()) {
          // 除外ファイルをスキップ
          if (!isExcludedFile(relativePath)) {
            // ソースコードファイルのみ収集（拡張子で判定）
            const ext = path.extname(entry.name);
            if (
              [
                '.ts',
                '.tsx',
                '.js',
                '.jsx',
                '.py',
                '.go',
                '.java',
                '.c',
                '.cpp',
                '.h',
                '.hpp',
                '.rs',
                '.rb',
                '.php',
              ].includes(ext)
            ) {
              try {
                const content = await fsp.readFile(fullPath, 'utf-8');
                codeFiles.push(`\n// File: ${relativePath}\n${content}`);
              } catch (error) {
                logger.warn(`Failed to read file ${relativePath}: ${getErrorMessage(error)}`);
              }
            }
          }
        }
      }
    };

    await collectFiles(repoPath);

    // ファイル数と総文字数をログ出力
    const totalChars = codeFiles.reduce((sum, f) => sum + f.length, 0);
    logger.info(
      `Collected ${codeFiles.length} source files (${totalChars.toLocaleString()} chars)`,
    );

    return codeFiles.join('\n\n');
  }

  /**
   * エージェントイベントからリファクタリング結果の本文を抽出
   *
   * Codex/Claudeのイベントログからアシスタントが返したJSONレスポンス部分を拾う。
   *
   * @param events - エージェントイベント配列
   * @param agent - 使用したエージェント
   * @returns 抽出したレスポンス文字列（見つからない場合は生ログ結合を返却）
   */
  private extractRefactoringOutput(events: string[], agent: 'auto' | 'codex' | 'claude'): string {
    const outputs: string[] = [];

    if (agent === 'codex' || agent === 'auto') {
      for (const rawEvent of events) {
        const payload = parseCodexEvent(rawEvent);
        if (!payload) {
          continue;
        }

        if (payload.type === 'assistant') {
          const contents = payload.message?.content ?? [];
          for (const block of contents) {
            if (block && typeof block === 'object' && block['type'] === 'text') {
              const text = typeof block['text'] === 'string' ? block['text'].trim() : '';
              if (text) {
                outputs.push(text);
              }
            }
          }
        }

        if (payload.type === 'result' && typeof payload.result === 'string' && payload.result.trim()) {
          outputs.push(payload.result.trim());
        }
      }
    }

    if (agent === 'claude') {
      for (const rawEvent of events) {
        try {
          const message = JSON.parse(rawEvent) as { type?: string; message?: { content?: Array<Record<string, unknown>> }; result?: string };
          if (message.type === 'assistant') {
            const contents = message.message?.content ?? [];
            for (const block of contents) {
              if (block && typeof block === 'object' && block['type'] === 'text') {
                const text = typeof block['text'] === 'string' ? block['text'].trim() : '';
                if (text) {
                  outputs.push(text);
                }
              }
            }
          }

          if (message.type === 'result' && typeof message.result === 'string' && message.result.trim()) {
            outputs.push(message.result.trim());
          }
        } catch (error) {
          logger.debug(`Failed to parse Claude event for refactoring output: ${getErrorMessage(error)}`);
        }
      }
    }

    if (outputs.length === 0 && events.length > 0) {
      logger.warn('Failed to extract refactoring output from agent events. Falling back to raw logs.');
      return events.join('\n');
    }

    return outputs.join('\n');
  }

  /**
   * エージェントのレスポンスからリファクタリング候補をパース
   *
   * @param response - エージェントのレスポンス
   * @returns リファクタリング候補のリスト
   */
  private parseRefactoringResponse(response: string): RefactorCandidate[] {
    try {
      // JSON コードブロックを抽出（```json ... ``` または ``` ... ```）
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : response.trim();

      logger.debug(`Parsing refactoring response (first 500 chars): ${jsonStr.substring(0, 500)}`);

      const parsed = JSON.parse(jsonStr);

      // 配列形式
      if (Array.isArray(parsed)) {
        logger.info(`Parsed ${parsed.length} refactoring candidates from agent response.`);
        return parsed as RefactorCandidate[];
      }

      // 単一オブジェクト形式
      if (parsed.type && parsed.filePath) {
        logger.info('Parsed 1 refactoring candidate from agent response.');
        return [parsed as RefactorCandidate];
      }

      logger.warn('Agent response does not contain valid refactoring candidates structure.');
      return [];
    } catch (error) {
      logger.error(`Failed to parse refactoring response: ${getErrorMessage(error)}`);
      logger.debug(`Raw response: ${response.substring(0, 1000)}`);
      return [];
    }
  }

  /**
   * 出力ファイルからバグ候補を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @returns バグ候補のリスト
   */
  private readOutputFile(filePath: string): BugCandidate[] {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Agent may have failed to write the file.`);
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      const parsed = JSON.parse(content);

      // { "bugs": [...] } 形式
      if (parsed.bugs && Array.isArray(parsed.bugs)) {
        logger.info(`Read ${parsed.bugs.length} bug candidates from output file.`);
        return parsed.bugs as BugCandidate[];
      }

      // [...] 配列形式
      if (Array.isArray(parsed)) {
        logger.info(`Read ${parsed.length} bug candidates from output file.`);
        return parsed as BugCandidate[];
      }

      // 単一オブジェクト形式
      if (parsed.title && parsed.file) {
        logger.info('Read 1 bug candidate from output file.');
        return [parsed as BugCandidate];
      }

      logger.warn('Output file does not contain valid bug candidates structure.');
      return [];
    } catch (error) {
      logger.error(`Failed to read/parse output file: ${getErrorMessage(error)}`);
      return [];
    }
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

    // ファイルパス検証
    if (!candidate.file || typeof candidate.file !== 'string') {
      logger.debug('Invalid candidate: missing or invalid file');
      return false;
    }

    // 除外ディレクトリチェック
    if (isExcludedDirectory(candidate.file)) {
      logger.debug(`Invalid candidate: file "${candidate.file}" is in excluded directory`);
      return false;
    }

    // 除外ファイルパターンチェック
    if (isExcludedFile(candidate.file)) {
      logger.debug(`Invalid candidate: file "${candidate.file}" matches excluded file pattern`);
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

  /**
   * リファクタリング候補のバリデーション
   *
   * @param candidate - リファクタリング候補
   * @returns バリデーション結果（true: 有効、false: 無効）
   */
  private validateRefactorCandidate(candidate: RefactorCandidate): boolean {
    // 必須フィールドの存在確認
    if (!candidate || typeof candidate !== 'object') {
      logger.debug('Invalid refactor candidate: not an object');
      return false;
    }

    // type 検証
    const validTypes = [
      'large-file',
      'large-function',
      'high-complexity',
      'duplication',
      'unused-code',
      'missing-docs',
    ];
    if (!validTypes.includes(candidate.type)) {
      logger.debug(`Invalid refactor candidate: invalid type "${candidate.type}"`);
      return false;
    }

    // filePath 検証
    if (!candidate.filePath || typeof candidate.filePath !== 'string') {
      logger.debug('Invalid refactor candidate: missing or invalid filePath');
      return false;
    }

    // 除外ディレクトリチェック
    if (isExcludedDirectory(candidate.filePath)) {
      logger.debug(
        `Invalid refactor candidate: filePath "${candidate.filePath}" is in excluded directory`,
      );
      return false;
    }

    // 除外ファイルパターンチェック
    if (isExcludedFile(candidate.filePath)) {
      logger.debug(
        `Invalid refactor candidate: filePath "${candidate.filePath}" matches excluded file pattern`,
      );
      return false;
    }

    // lineRange 検証（オプショナル）
    if (candidate.lineRange !== undefined) {
      if (
        typeof candidate.lineRange !== 'object' ||
        typeof candidate.lineRange.start !== 'number' ||
        typeof candidate.lineRange.end !== 'number'
      ) {
        logger.debug('Invalid refactor candidate: invalid lineRange structure');
        return false;
      }
      if (candidate.lineRange.start < 1 || candidate.lineRange.end < candidate.lineRange.start) {
        logger.debug(
          `Invalid refactor candidate: invalid lineRange values (start: ${candidate.lineRange.start}, end: ${candidate.lineRange.end})`,
        );
        return false;
      }
    }

    // description 検証（最小20文字）
    if (!candidate.description || typeof candidate.description !== 'string') {
      logger.debug('Invalid refactor candidate: missing or invalid description');
      return false;
    }
    if (candidate.description.length < 20) {
      logger.debug(
        `Invalid refactor candidate: description length ${candidate.description.length} is too short (min 20)`,
      );
      return false;
    }

    // suggestion 検証（最小20文字）
    if (!candidate.suggestion || typeof candidate.suggestion !== 'string') {
      logger.debug('Invalid refactor candidate: missing or invalid suggestion');
      return false;
    }
    if (candidate.suggestion.length < 20) {
      logger.debug(
        `Invalid refactor candidate: suggestion length ${candidate.suggestion.length} is too short (min 20)`,
      );
      return false;
    }

    // priority 検証
    if (!['low', 'medium', 'high'].includes(candidate.priority)) {
      logger.debug(`Invalid refactor candidate: invalid priority "${candidate.priority}"`);
      return false;
    }

    return true;
  }

  /**
   * 出力ファイルから機能拡張提案を読み込み
   *
   * @param filePath - 出力ファイルパス
   * @returns 機能拡張提案のリスト
   */
  private readEnhancementOutputFile(filePath: string): EnhancementProposal[] {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found: ${filePath}. Agent may have failed to write the file.`);
      return [];
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      logger.debug(`Output file content (first 500 chars): ${content.substring(0, 500)}`);

      const proposals = this.parseEnhancementProposals(content);
      if (proposals.length > 0) {
        logger.info(`Read ${proposals.length} enhancement proposals from output file.`);
        return proposals;
      }

      logger.warn('Output file does not contain valid enhancement proposals structure.');
      return [];
    } catch (error) {
      logger.error(`Failed to read/parse enhancement output file: ${getErrorMessage(error)}`);
      return [];
    }
  }

  /**
   * 機能拡張提案JSONをパース
   *
   * エージェント出力はJSONコードブロックや余計なテキストを含む場合があるため、
   * 寛容なパーサーで配列または単一オブジェクトを抽出する。
   *
   * @param rawContent - エージェントの生出力
   * @returns パースされた提案配列（失敗時は空配列）
   */
  private parseEnhancementProposals(rawContent: string): EnhancementProposal[] {
    if (!rawContent || !rawContent.trim()) {
      return [];
    }

    const trimmed = rawContent.trim();
    const candidates: string[] = [];

    // ```json ... ``` コードブロック
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
      candidates.push(codeBlockMatch[1].trim());
    }

    // オブジェクトセグメント
    const objectSegment = this.extractJsonSegment(trimmed, '{', '}');
    if (objectSegment) {
      candidates.push(objectSegment);
    }

    // 配列セグメント
    const arraySegment = this.extractJsonSegment(trimmed, '[', ']');
    if (arraySegment) {
      candidates.push(arraySegment);
    }

    // 生文字列も最後に試す
    candidates.push(trimmed);

    const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

    for (const candidate of uniqueCandidates) {
      if (!candidate) {
        continue;
      }
      const parsed = this.tryParseEnhancementJson(candidate);
      if (parsed) {
        return parsed;
      }
    }

    logger.debug('Failed to parse enhancement proposals with lenient parser.');
    return [];
  }

  /**
   * 候補文字列からJSONをパース
   */
  private tryParseEnhancementJson(payload: string): EnhancementProposal[] | null {
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        return parsed as EnhancementProposal[];
      }
      if (parsed && typeof parsed === 'object') {
        return [parsed as EnhancementProposal];
      }
      return null;
    } catch (error) {
      logger.debug(`Failed to parse enhancement JSON payload: ${getErrorMessage(error)}`);
      return null;
    }
  }

  /**
   * 最初に出現するJSONセグメントを抽出
   *
   * @param source - 元文字列
   * @param startChar - 開始文字（'[' | '{'）
   * @param endChar - 終了文字（']' | '}'）
   */
  private extractJsonSegment(
    source: string,
    startChar: '[' | '{',
    endChar: ']' | '}',
  ): string | null {
    const startIndex = source.indexOf(startChar);
    if (startIndex === -1) {
      return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < source.length; i += 1) {
      const char = source[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
      }

      if (!inString) {
        if (char === startChar) {
          depth += 1;
        } else if (char === endChar) {
          depth -= 1;
          if (depth === 0) {
            return source.slice(startIndex, i + 1);
          }
        }
      }
    }

    return null;
  }

  /**
   * 機能拡張提案のバリデーション
   *
   * @param proposal - 機能拡張提案
   * @returns バリデーション結果（true: 有効、false: 無効）
   */
  private validateEnhancementProposal(proposal: EnhancementProposal): boolean {
    // 必須フィールドの存在確認
    if (!proposal || typeof proposal !== 'object') {
      logger.debug('Invalid enhancement proposal: not an object');
      return false;
    }

    // type 検証
    const validTypes = ['improvement', 'integration', 'automation', 'dx', 'quality', 'ecosystem'];
    if (!validTypes.includes(proposal.type)) {
      logger.debug(`Invalid enhancement proposal: invalid type "${proposal.type}"`);
      return false;
    }

    // title 検証（10〜200文字）
    if (!proposal.title || typeof proposal.title !== 'string') {
      logger.debug('Invalid enhancement proposal: missing or invalid title');
      return false;
    }
    if (proposal.title.length < 10 || proposal.title.length > 200) {
      logger.debug(
        `Invalid enhancement proposal: title length ${proposal.title.length} is out of range (10-200)`,
      );
      return false;
    }

    // description 検証（最小100文字）
    if (!proposal.description || typeof proposal.description !== 'string') {
      logger.debug('Invalid enhancement proposal: missing or invalid description');
      return false;
    }
    if (proposal.description.length < 100) {
      logger.debug(
        `Invalid enhancement proposal: description length ${proposal.description.length} is too short (min 100)`,
      );
      return false;
    }

    // rationale 検証（最小50文字）
    if (!proposal.rationale || typeof proposal.rationale !== 'string') {
      logger.debug('Invalid enhancement proposal: missing or invalid rationale');
      return false;
    }
    if (proposal.rationale.length < 50) {
      logger.debug(
        `Invalid enhancement proposal: rationale length ${proposal.rationale.length} is too short (min 50)`,
      );
      return false;
    }

    // implementation_hints 検証（最低1つ）
    if (
      !Array.isArray(proposal.implementation_hints) ||
      proposal.implementation_hints.length === 0
    ) {
      logger.debug('Invalid enhancement proposal: no implementation hints provided');
      return false;
    }

    // expected_impact 検証
    if (!['low', 'medium', 'high'].includes(proposal.expected_impact)) {
      logger.debug(
        `Invalid enhancement proposal: invalid expected_impact "${proposal.expected_impact}"`,
      );
      return false;
    }

    // effort_estimate 検証
    if (!['small', 'medium', 'large'].includes(proposal.effort_estimate)) {
      logger.debug(
        `Invalid enhancement proposal: invalid effort_estimate "${proposal.effort_estimate}"`,
      );
      return false;
    }

    // related_files 検証（最低1つ）
    if (!Array.isArray(proposal.related_files) || proposal.related_files.length === 0) {
      logger.debug('Invalid enhancement proposal: no related files provided');
      return false;
    }

    return true;
  }
}
