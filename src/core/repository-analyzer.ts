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
import fs from 'fs-extra';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type { BugCandidate } from '../types/auto-issue.js';

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

  // パストラバーサル攻撃防止（../ を含むパスを拒否）
  if (normalizedPath.includes('../')) {
    logger.warn(`Potentially malicious path detected: ${filePath}`);
    return true; // 疑わしいパスは除外
  }

  return EXCLUDED_DIRECTORIES.some((dir) => normalizedPath.includes(`/${dir}`));
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
 * @returns 一時ディレクトリ内のユニークなファイルパス
 */
function generateOutputFilePath(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(os.tmpdir(), `auto-issue-bugs-${timestamp}-${random}.json`);
}

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

    // 2. 出力ファイルパスを生成
    const outputFilePath = generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    // 3. プロンプト変数を置換
    const prompt = template
      .replace('{repository_path}', repoPath)
      .replace(/{output_file_path}/g, outputFilePath);

    // 4. エージェントを選択（auto の場合は Codex → Claude フォールバック）
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
          await this.codexClient.executeTask({ prompt });
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
      await this.claudeClient.executeTask({ prompt });
    }

    // 5. 出力ファイルからJSONを読み込み
    const candidates = this.readOutputFile(outputFilePath);

    // 6. バリデーション
    const validCandidates = candidates.filter((c) => this.validateBugCandidate(c));

    logger.info(
      `Parsed ${candidates.length} candidates, ${validCandidates.length} valid after validation.`,
    );

    // 7. 一時ファイルをクリーンアップ
    this.cleanupOutputFile(outputFilePath);

    return validCandidates;
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
        fs.removeSync(filePath);
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
}
