/**
 * ProgressFormatter - 進捗表示フォーマットを担当
 *
 * GitHub Issue コメント用の進捗状況フォーマットを生成するモジュール。
 * - フェーズステータス（pending/in_progress/completed/failed）に応じた絵文字表示
 * - 全フェーズの進捗状況リスト
 * - 現在のフェーズ詳細（ステータス、開始時刻、試行回数）
 * - 完了したフェーズの詳細（折りたたみ表示）
 * - 最終更新時刻
 */

import { MetadataManager } from '../../core/metadata-manager.js';
import { PhaseName, PhaseStatus, PhaseMetadata } from '../../types.js';

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

export class ProgressFormatter {
  /**
   * 進捗コメントを Markdown 形式で生成
   *
   * @param currentPhase - 現在のフェーズ名
   * @param status - 現在のステータス
   * @param metadata - メタデータマネージャー
   * @param details - 詳細メッセージ（オプション）
   * @returns GitHub Issue コメント用 Markdown
   */
  formatProgressComment(
    currentPhase: PhaseName,
    status: PhaseStatus,
    metadata: MetadataManager,
    details?: string,
  ): string {
    const phasesStatus = metadata.getAllPhasesStatus();
    phasesStatus[currentPhase] = status;
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

    // フェーズステータス一覧の生成
    for (const definition of phaseDefinitions) {
      const phaseStatus = phasesStatus[definition.key] ?? 'pending';
      const emoji = statusEmoji[phaseStatus] ?? '📝';
      const phaseData = metadata.data.phases[definition.key];

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

      if (definition.key === currentPhase) {
        currentPhaseInfo = {
          number: definition.number,
          label: definition.label,
          status: phaseStatus,
          data: phaseData,
        };
      }
    }

    // 現在のフェーズ詳細
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

    // 完了したフェーズの詳細（折りたたみ表示）
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

    // 最終更新時刻
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
