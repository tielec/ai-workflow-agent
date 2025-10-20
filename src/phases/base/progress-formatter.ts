/**
 * Progress Formatter
 *
 * ワークフローの進捗状況をMarkdown形式のコメントにフォーマットする機能を提供します。
 * base-phase.tsから分離された進捗コメント生成専用クラスです。
 */

import { MetadataManager } from '../../core/metadata-manager.js';
import { PhaseStatus, PhaseName, PhaseMetadata } from '../../types.js';

/**
 * ProgressFormatter クラス
 *
 * ワークフローの進捗状況を GitHub Issue コメント用の Markdown 形式に変換します。
 */
export class ProgressFormatter {
  constructor(
    private metadata: MetadataManager,
    private phaseName: PhaseName,
  ) {}

  /**
   * 進捗コメントをフォーマット
   *
   * @param status - 現在のフェーズのステータス
   * @param details - 追加の詳細情報（オプション）
   * @returns Markdown形式の進捗コメント文字列
   */
  formatProgressComment(status: PhaseStatus, details?: string): string {
    const statusEmoji: Record<string, string> = {
      pending: '⏸️',
      in_progress: '🔄',
      completed: '✅',
      failed: '❌',
    };

    const phaseDefinitions: Array<{ key: PhaseName; number: string; label: string }> = [
      { key: 'planning', number: 'Phase 0', label: 'Planning' },
      { key: 'requirements', number: 'Phase 1', label: 'Requirements' },
      { key: 'design', number: 'Phase 2', label: 'Design' },
      { key: 'test_scenario', number: 'Phase 3', label: 'Test Scenario' },
      { key: 'implementation', number: 'Phase 4', label: 'Implementation' },
      { key: 'test_implementation', number: 'Phase 5', label: 'Test Implementation' },
      { key: 'testing', number: 'Phase 6', label: 'Testing' },
      { key: 'documentation', number: 'Phase 7', label: 'Documentation' },
      { key: 'report', number: 'Phase 8', label: 'Report' },
      { key: 'evaluation', number: 'Phase 9', label: 'Evaluation' },
    ];

    const phasesStatus = this.metadata.getAllPhasesStatus();
    phasesStatus[this.phaseName] = status;
    const parts: string[] = [];

    parts.push('## 🤖 AI Workflow - 進捗状況\n\n');
    parts.push('### 全体進捗\n\n');

    const completedDetails: Array<{
      number: string;
      label: string;
      data: PhaseMetadata | undefined;
    }> = [];
    let currentPhaseInfo:
      | {
          number: string;
          label: string;
          status: PhaseStatus;
          data: PhaseMetadata | undefined;
        }
      | null = null;

    for (const definition of phaseDefinitions) {
      const phaseStatus = phasesStatus[definition.key] ?? 'pending';
      const emoji = statusEmoji[phaseStatus] ?? '📝';
      const phaseData = this.metadata.data.phases[definition.key];

      let line = `- ${emoji} ${definition.number}: ${definition.label} - **${phaseStatus.toUpperCase()}**`;
      if (phaseStatus === 'completed' && phaseData?.completed_at) {
        line += ` (${phaseData.completed_at})`;
      } else if (phaseStatus === 'in_progress' && phaseData?.started_at) {
        line += ` (開始: ${phaseData.started_at})`;
      }

      parts.push(`${line}\n`);

      if (phaseStatus === 'completed') {
        completedDetails.push({
          number: definition.number,
          label: definition.label,
          data: phaseData,
        });
      }

      if (definition.key === this.phaseName) {
        currentPhaseInfo = {
          number: definition.number,
          label: definition.label,
          status: phaseStatus,
          data: phaseData,
        };
      }
    }

    if (currentPhaseInfo) {
      parts.push(
        `\n### 現在のフェーズ: ${currentPhaseInfo.number} (${currentPhaseInfo.label})\n\n`,
      );
      parts.push(`**ステータス**: ${currentPhaseInfo.status.toUpperCase()}\n`);

      const phaseData = currentPhaseInfo.data;
      if (phaseData?.started_at) {
        parts.push(`**開始時刻**: ${phaseData.started_at}\n`);
      }

      const retryCount = phaseData?.retry_count ?? 0;
      parts.push(`**試行回数**: ${retryCount + 1}/3\n`);

      if (details) {
        parts.push(`\n${details}\n`);
      }
    }

    if (completedDetails.length) {
      parts.push('\n<details>\n');
      parts.push('<summary>完了したフェーズの詳細</summary>\n\n');

      for (const info of completedDetails) {
        parts.push(`### ${info.number}: ${info.label}\n\n`);
        parts.push('**ステータス**: COMPLETED\n');

        const data = info.data;
        if (data?.review_result) {
          parts.push(`**レビュー結果**: ${data.review_result}\n`);
        }
        if (data?.completed_at) {
          parts.push(`**完了時刻**: ${data.completed_at}\n`);
        }

        parts.push('\n');
      }

      parts.push('</details>\n');
    }

    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const formattedNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    parts.push('\n---\n');
    parts.push(`*最終更新: ${formattedNow}*\n`);
    parts.push('*AI駆動開発自動化ワークフロー (Claude Agent SDK)*\n');

    return parts.join('');
  }
}
