import fs from 'fs-extra';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import { MetadataManager } from '../../core/metadata-manager.js';
import { PhaseName } from '../../types.js';

/**
 * ContextBuilder - コンテキスト構築を担当
 *
 * フェーズ実行時のコンテキスト構築（ファイル参照、オプショナルコンテキスト）を
 * 専門的に扱うモジュール。
 *
 * 責務:
 * - ファイル存在チェック
 * - @filepath 形式の参照生成
 * - 相対パス解決
 * - フォールバック処理
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 * Issue #274: REPOS_ROOT 対応（workflowBaseDir を受け取る）
 */
export class ContextBuilder {
  private readonly metadata: MetadataManager;
  private readonly workingDir: string;
  private readonly getAgentWorkingDirectoryFn: () => string;
  private readonly workflowBaseDir: string;

  /**
   * @param metadata - メタデータマネージャー
   * @param workingDir - 作業ディレクトリ
   * @param getAgentWorkingDirectoryFn - エージェント作業ディレクトリを取得する関数
   * @param workflowBaseDir - ワークフローベースディレクトリ（REPOS_ROOT 対応済み）
   */
  constructor(
    metadata: MetadataManager,
    workingDir: string,
    getAgentWorkingDirectoryFn: () => string,
    workflowBaseDir?: string
  ) {
    this.metadata = metadata;
    this.workingDir = workingDir;
    this.getAgentWorkingDirectoryFn = getAgentWorkingDirectoryFn;
    // Issue #274: workflowBaseDir が渡されない場合は従来の動作にフォールバック
    this.workflowBaseDir = workflowBaseDir ?? metadata.workflowDir;
  }

  /**
   * オプショナルコンテキストを構築（Issue #396）
   *
   * ファイルが存在する場合は @filepath 参照、存在しない場合はフォールバックメッセージ
   *
   * @param phaseName - 参照する Phase 名
   * @param filename - ファイル名（例: 'requirements.md'）
   * @param fallbackMessage - ファイルが存在しない場合のメッセージ
   * @param issueNumberOverride - Issue 番号（省略時は現在の Issue 番号を使用）
   * @returns ファイル参照またはフォールバックメッセージ
   *
   * @example
   * ```typescript
   * // Requirements Phase の requirements.md を参照
   * const context = contextBuilder.buildOptionalContext(
   *   'requirements',
   *   'requirements.md',
   *   '要件定義書は利用できません'
   * );
   * // => '@.ai-workflow/issue-1/01_requirements/output/requirements.md'
   * // または '要件定義書は利用できません'
   * ```
   */
  buildOptionalContext(
    phaseName: PhaseName,
    filename: string,
    fallbackMessage: string,
    issueNumberOverride?: string | number
  ): string {
    const issueNumber = issueNumberOverride !== undefined
      ? String(issueNumberOverride)
      : this.metadata.data.issue_number;

    const filePath = this.getPhaseOutputFile(phaseName, filename, issueNumber);

    // ファイル存在チェック
    if (filePath && fs.existsSync(filePath)) {
      // 存在する場合は @filepath 形式で参照
      const reference = this.getAgentFileReference(filePath);
      if (reference) {
        logger.info(`Using ${phaseName} output: ${reference}`);
        return reference;
      } else {
        logger.warn(`Failed to resolve relative path for ${phaseName}: ${filePath}`);
        return fallbackMessage;
      }
    } else {
      // 存在しない場合はフォールバックメッセージ
      logger.info(`${phaseName} output not found, using fallback message`);
      return fallbackMessage;
    }
  }

  /**
   * @filepath 形式の参照を生成
   *
   * 絶対ファイルパスから相対パスを計算し、@filepath 形式の参照を生成します。
   *
   * @param filePath - 絶対ファイルパス
   * @returns @filepath 形式の参照（例: @.ai-workflow/issue-1/01_requirements/output/requirements.md）
   *          相対パス解決に失敗した場合は null
   *
   * @example
   * ```typescript
   * const reference = contextBuilder.getAgentFileReference(
   *   '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md'
   * );
   * // => '@.ai-workflow/issue-1/01_requirements/output/requirements.md'
   * ```
   */
  getAgentFileReference(filePath: string): string | null {
    const absoluteFile = path.resolve(filePath);
    const workingDir = path.resolve(this.getAgentWorkingDirectoryFn());
    const relative = path.relative(workingDir, absoluteFile);

    // 相対パスが '..' で始まる場合、または絶対パスの場合は null を返す
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    // パス区切り文字を '/' に正規化
    const normalized = relative.split(path.sep).join('/');
    return `@${normalized}`;
  }

  /**
   * Planning Phase の output/planning.md を参照
   *
   * @param issueNumber - Issue 番号
   * @returns @filepath 形式の参照またはフォールバックメッセージ
   *
   * @example
   * ```typescript
   * const reference = contextBuilder.getPlanningDocumentReference(1);
   * // => '@.ai-workflow/issue-1/00_planning/output/planning.md'
   * // または 'Planning Phaseは実行されていません'
   * ```
   */
  getPlanningDocumentReference(issueNumber: number): string {
    const planningFile = this.getPhaseOutputFile('planning', 'planning.md', issueNumber);

    if (!planningFile) {
      logger.warn('Planning document not found.');
      return 'Planning Phaseは実行されていません';
    }

    const reference = this.getAgentFileReference(planningFile);
    if (!reference) {
      logger.warn(`Failed to resolve relative path for planning document: ${planningFile}`);
      return 'Planning Phaseは実行されていません';
    }

    logger.info(`Planning document reference: ${reference}`);
    return reference;
  }

  /**
   * 各フェーズの出力ファイルパスを解決
   * Issue #252: REPOS_ROOT が設定されている場合は動的にパスを解決
   *
   * @param targetPhase - ターゲットフェーズ名
   * @param fileName - ファイル名
   * @param issueNumberOverride - Issue 番号（省略時は現在の Issue 番号を使用）
   * @returns ファイルパス（存在しない場合は null）
   *
   * @example
   * ```typescript
   * const filePath = contextBuilder.getPhaseOutputFile('requirements', 'requirements.md', 1);
   * // => '/path/to/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md'
   * ```
   */
  private getPhaseOutputFile(
    targetPhase: PhaseName,
    fileName: string,
    issueNumberOverride?: string | number
  ): string | null {
    const issueIdentifier =
      issueNumberOverride !== undefined ? String(issueNumberOverride) : this.metadata.data.issue_number;
    const phaseNumber = this.getPhaseNumber(targetPhase);

    // Issue #274: workflowBaseDir を使用（REPOS_ROOT 対応済み）
    // workflowBaseDir は .ai-workflow/issue-{NUM} 形式なので、親ディレクトリを取得
    const basePath = path.resolve(this.workflowBaseDir, '..');

    const filePath = path.join(
      basePath,
      `issue-${issueIdentifier}`,
      `${phaseNumber}_${targetPhase}`,
      'output',
      fileName
    );

    if (!fs.existsSync(filePath)) {
      logger.warn(`Output file not found for phase ${targetPhase}: ${filePath}`);
      return null;
    }

    return filePath;
  }

  /**
   * フェーズ番号を取得
   *
   * @param phase - フェーズ名
   * @returns フェーズ番号（2桁の文字列、例: '00', '01', '02'）
   */
  private getPhaseNumber(phase: PhaseName): string {
    const mapping: Record<PhaseName, string> = {
      planning: '00',
      requirements: '01',
      design: '02',
      test_scenario: '03',
      implementation: '04',
      test_implementation: '05',
      testing: '06',
      documentation: '07',
      report: '08',
      evaluation: '09',
    };
    return mapping[phase];
  }
}
