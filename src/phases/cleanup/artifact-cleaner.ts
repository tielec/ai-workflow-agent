import * as fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { logger } from '../../utils/logger.js';
import { MetadataManager } from '../../core/metadata-manager.js';
import { getErrorMessage } from '../../utils/error-utils.js';

/**
 * ArtifactCleaner - ワークフロークリーンアップを担当
 *
 * ワークフロークリーンアップ（ログ削除、アーティファクト削除、確認プロンプト）を
 * 専門的に扱うモジュール。
 *
 * 責務:
 * - ワークフローログの削除（Report Phase 完了後）
 * - ワークフローアーティファクト全体の削除（Evaluation Phase 完了後）
 * - パス検証（セキュリティ）
 * - シンボリックリンクチェック（セキュリティ）
 * - CI 環境判定
 * - 確認プロンプト表示
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */
export class ArtifactCleaner {
  private readonly metadata: MetadataManager;

  /**
   * @param metadata - メタデータマネージャー
   */
  constructor(metadata: MetadataManager) {
    this.metadata = metadata;
  }

  /**
   * ワークフローアーティファクト全体をクリーンアップ（Issue #2）
   *
   * Evaluation Phase 完了後に実行され、.ai-workflow/issue-<NUM>/ ディレクトリ全体を削除します。
   * Report Phase のクリーンアップ（cleanupWorkflowLogs）とは異なり、metadata.json や
   * output/*.md ファイルを含むすべてのファイルを削除します。
   *
   * @param force - 確認プロンプトをスキップする場合は true（CI環境用）
   *
   * @throws {Error} パス検証失敗時、またはシンボリックリンク検出時
   *
   * @example
   * ```typescript
   * // CI環境または force=true の場合は確認プロンプトなしで削除
   * await artifactCleaner.cleanupWorkflowArtifacts(true);
   *
   * // 非CI環境で force=false の場合は確認プロンプトを表示
   * await artifactCleaner.cleanupWorkflowArtifacts(false);
   * ```
   */
  async cleanupWorkflowArtifacts(force: boolean = false): Promise<void> {
    const workflowDir = this.metadata.workflowDir; // .ai-workflow/issue-<NUM>

    // パス検証: .ai-workflow/issue-<NUM> 形式であることを確認（セキュリティ）
    if (!this.validatePath(workflowDir)) {
      logger.error(`Invalid workflow directory path: ${workflowDir}`);
      throw new Error(`Invalid workflow directory path: ${workflowDir}`);
    }

    // シンボリックリンクチェック（セキュリティ）
    if (this.isSymbolicLink(workflowDir)) {
      logger.error(`Workflow directory is a symbolic link: ${workflowDir}`);
      throw new Error(`Workflow directory is a symbolic link: ${workflowDir}`);
    }

    // CI 環境判定
    const isCIEnv = this.isCIEnvironment();

    // 確認プロンプト表示（force=false かつ非CI環境の場合のみ）
    if (!force && !isCIEnv) {
      const confirmed = await this.promptUserConfirmation(workflowDir);
      if (!confirmed) {
        logger.info('Cleanup cancelled by user.');
        return;
      }
    }

    // ディレクトリ削除
    try {
      logger.info(`Deleting workflow artifacts: ${workflowDir}`);

      // ディレクトリ存在確認
      if (!fs.existsSync(workflowDir)) {
        logger.warn(`Workflow directory does not exist: ${workflowDir}`);
        return;
      }

      // 削除実行
      fs.rmSync(workflowDir, { recursive: true, force: true });
      logger.info('Workflow artifacts deleted successfully.');
    } catch (error) {
      const message = getErrorMessage(error);
      logger.error(`Failed to delete workflow artifacts: ${message}`);
      // エラーでもワークフローは継続（Report Phase のクリーンアップと同様）
    }
  }

  /**
   * ワークフローログをクリーンアップ（Issue #2、Issue #212で拡張）
   *
   * Report Phase 完了後に実行され、phases 00-10 の execute/review/revise ディレクトリを削除します。
   * metadata.json と output/*.md は保持されます。
   *
   * @param phaseRange - 削除対象のフェーズ範囲（オプション）
   *   - 未指定時: phases 00-10 を削除（既存動作）
   *   - 指定時: 指定されたフェーズのみ削除
   *
   * @example
   * ```typescript
   * // Report Phase 完了後に実行（全フェーズ削除）
   * await artifactCleaner.cleanupWorkflowLogs();
   *
   * // Issue #212: 特定フェーズのみ削除
   * const phaseRange: PhaseName[] = ['planning', 'requirements', 'design'];
   * await artifactCleaner.cleanupWorkflowLogs(phaseRange);
   * ```
   */
  async cleanupWorkflowLogs(phaseRange?: import('../../types.js').PhaseName[]): Promise<void> {
    const workflowDir = this.metadata.workflowDir; // .ai-workflow/issue-<NUM>

    logger.info('Cleaning up workflow execution logs...');

    try {
      // Issue #212: phaseRange が指定されている場合は、そのフェーズのみを対象にする
      const allPhaseDirs = [
        '00_planning',
        '01_requirements',
        '02_design',
        '03_test_scenario',
        '04_implementation',
        '05_test_implementation',
        '06_test_preparation',
        '07_testing',
        '08_documentation',
        '09_report',
        '10_evaluation',
      ];

      // Issue #212: PhaseName → ディレクトリ名のマッピング
      const phaseNameToDir: Record<string, string> = {
        'planning': '00_planning',
        'requirements': '01_requirements',
        'design': '02_design',
        'test_scenario': '03_test_scenario',
        'implementation': '04_implementation',
        'test_implementation': '05_test_implementation',
        'test_preparation': '06_test_preparation',
        'testing': '07_testing',
        'documentation': '08_documentation',
        'report': '09_report',
        'evaluation': '10_evaluation',
      };

      // Issue #212: 削除対象フェーズの決定
      let phaseDirs: string[];
      if (phaseRange && phaseRange.length > 0) {
        // 指定されたフェーズのみ
        phaseDirs = phaseRange.map(phase => phaseNameToDir[phase]).filter(dir => dir !== undefined);
        logger.info(`Cleanup target phases (${phaseRange.length}): ${phaseRange.join(', ')}`);
      } else {
        // 全フェーズ（既存動作）
        phaseDirs = allPhaseDirs;
        logger.info('Cleanup target: all phases (00-10)');
      }

      for (const phaseDir of phaseDirs) {
        const phasePath = path.join(workflowDir, phaseDir);

        if (!fs.existsSync(phasePath)) {
          continue;
        }

        // execute/review/revise ディレクトリを削除
        const dirsToRemove = ['execute', 'review', 'revise'];
        for (const dir of dirsToRemove) {
          const dirPath = path.join(phasePath, dir);
          if (fs.existsSync(dirPath)) {
            try {
              fs.rmSync(dirPath, { recursive: true, force: true });
              logger.debug(`Removed directory: ${dirPath}`);
            } catch (error) {
              const message = getErrorMessage(error);
              logger.warn(`Failed to remove directory ${dirPath}: ${message}`);
            }
          }
        }
      }

      logger.info('Workflow execution logs cleaned up successfully.');
    } catch (error) {
      const message = getErrorMessage(error);
      logger.warn(`Failed to clean up workflow logs: ${message}`);
      // エラーでもワークフローは継続
    }
  }

  /**
   * ユーザーに確認プロンプトを表示
   *
   * @param workflowDir - 削除対象のワークフローディレクトリ
   * @returns ユーザーが "yes" を入力した場合は true
   *
   * @example
   * ```typescript
   * const confirmed = await artifactCleaner.promptUserConfirmation('.ai-workflow/issue-1');
   * if (confirmed) {
   *   // 削除を実行
   * }
   * ```
   */
  private async promptUserConfirmation(workflowDir: string): Promise<boolean> {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    logger.warn(`About to delete workflow directory: ${workflowDir}`);
    logger.warn('This action cannot be undone.');

    return new Promise((resolve) => {
      rl.question('Proceed? (yes/no): ', (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === 'yes' || normalized === 'y');
      });
    });
  }

  /**
   * CI 環境かどうかを判定
   *
   * @returns CI 環境の場合は true
   *
   * @example
   * ```typescript
   * if (artifactCleaner.isCIEnvironment()) {
   *   // CI環境での処理
   * }
   * ```
   */
  private isCIEnvironment(): boolean {
    const ciValue = process.env.CI;
    if (ciValue !== undefined) {
      return ciValue === 'true' || ciValue === '1';
    }
    return false;
  }

  /**
   * パスを検証（正規表現による .ai-workflow/issue-<NUM> 形式チェック）
   *
   * パストラバーサル攻撃を防止するため、パスが正しい形式であることを確認します。
   *
   * @param workflowDir - ワークフローディレクトリパス
   * @returns パスが有効な場合は true
   *
   * @example
   * ```typescript
   * if (artifactCleaner.validatePath('.ai-workflow/issue-1')) {
   *   // パスが有効
   * }
   * ```
   */
  private validatePath(workflowDir: string): boolean {
    const pattern = /\.ai-workflow[\/\\]issue-\d+$/;
    return pattern.test(workflowDir);
  }

  /**
   * シンボリックリンクチェック
   *
   * シンボリックリンク攻撃を防止するため、パスがシンボリックリンクでないことを確認します。
   *
   * @param workflowDir - ワークフローディレクトリパス
   * @returns シンボリックリンクの場合は true
   *
   * @example
   * ```typescript
   * if (artifactCleaner.isSymbolicLink('.ai-workflow/issue-1')) {
   *   // シンボリックリンクを検出
   * }
   * ```
   */
  private isSymbolicLink(workflowDir: string): boolean {
    if (fs.existsSync(workflowDir)) {
      const stats = fs.lstatSync(workflowDir);
      return stats.isSymbolicLink();
    }
    return false;
  }
}
