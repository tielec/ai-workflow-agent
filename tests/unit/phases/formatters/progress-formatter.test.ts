/**
 * ユニットテスト: progress-formatter.ts
 *
 * テスト対象:
 * - ProgressFormatter.formatProgressComment()
 * - フェーズステータス絵文字マッピング
 * - 進捗状況リストの生成
 * - 完了フェーズの折りたたみ表示
 */

import { describe, test, expect } from '@jest/globals';
import { ProgressFormatter } from '../../../../src/phases/formatters/progress-formatter.js';
import { PhaseName, PhaseStatus, WorkflowMetadata } from '../../../../src/types.js';

/**
 * MetadataManager のモックを作成
 */
function createMockMetadataManager(phasesData: Partial<Record<PhaseName, { status: PhaseStatus; started_at?: string | null; completed_at?: string | null; retry_count?: number; review_result?: string | null }>>): any {
  const allPhases: PhaseName[] = [
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
    'evaluation',
  ];

  const phases: any = {};
  for (const phase of allPhases) {
    const data = phasesData[phase] || { status: 'pending' };
    const phaseData: any = {
      status: data.status,
      started_at: data.started_at || null,
      completed_at: data.completed_at || null,
      retry_count: data.retry_count || 0,
      review_result: data.review_result || null,
      output_files: [],
      completed_steps: [],
      current_step: null,
    };

    // EvaluationPhaseMetadata には追加フィールドが必要
    if (phase === 'evaluation') {
      phaseData.decision = null;
      phaseData.failed_phase = null;
      phaseData.remaining_tasks = [];
      phaseData.created_issue_url = null;
      phaseData.abort_reason = null;
    }

    phases[phase] = phaseData;
  }

  const metadata: WorkflowMetadata = {
    issue_number: '999',
    issue_url: 'https://github.com/test/repo/issues/999',
    issue_title: 'Test Issue',
    workflow_version: '0.3.0',
    current_phase: 'planning',
    created_at: '2025-01-20T00:00:00Z',
    updated_at: '2025-01-20T00:00:00Z',
    phases,
    cost_tracking: {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
    },
    design_decisions: { implementation_strategy: null, test_strategy: null, test_code_strategy: null },
  };

  return {
    data: metadata,
    getAllPhasesStatus: () => {
      const result: any = {};
      for (const phase of allPhases) {
        result[phase] = phases[phase].status;
      }
      return result;
    },
  };
}

describe('ProgressFormatter - 基本的な進捗コメント生成', () => {
  const formatter = new ProgressFormatter();

  test('1-1: 進行中フェーズの進捗コメントが正しくフォーマットされる', () => {
    // Given: planning完了、requirements進行中、design以降はpending
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00', review_result: 'approved' },
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 0 },
    });

    // When: requirements フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata, 'Analyzing existing code...');

    // Then: 期待されるフォーマットが返される
    expect(result).toContain('## 🤖 AI Workflow - 進捗状況');
    expect(result).toContain('### 全体進捗');
    expect(result).toContain('✅ Phase 0: Planning - **COMPLETED** (2024-01-23 12:00:00)');
    expect(result).toContain('🔄 Phase 1: Requirements - **IN_PROGRESS** (開始: 2024-01-23 12:05:00)');
    expect(result).toContain('⏸️ Phase 2: Design - **PENDING**');
    expect(result).toContain('### 現在のフェーズ: Phase 1 (Requirements)');
    expect(result).toContain('**ステータス**: IN_PROGRESS');
    expect(result).toContain('**開始時刻**: 2024-01-23 12:05:00');
    expect(result).toContain('**試行回数**: 1/3');
    expect(result).toContain('Analyzing existing code...');
    expect(result).toContain('<details>');
    expect(result).toContain('完了したフェーズの詳細');
    expect(result).toContain('### Phase 0: Planning');
    expect(result).toContain('**レビュー結果**: approved');
  });

  test('1-2: 完了フェーズの進捗コメントが正しくフォーマットされる', () => {
    // Given: planning, requirements完了、design進行中
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00' },
      requirements: { status: 'completed', completed_at: '2024-01-23 12:10:00', review_result: 'approved' },
      design: { status: 'in_progress', started_at: '2024-01-23 12:15:00', retry_count: 0 },
    });

    // When: design フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('design', 'in_progress', mockMetadata);

    // Then: 完了したフェーズが折りたたみ表示される
    expect(result).toContain('✅ Phase 0: Planning - **COMPLETED** (2024-01-23 12:00:00)');
    expect(result).toContain('✅ Phase 1: Requirements - **COMPLETED** (2024-01-23 12:10:00)');
    expect(result).toContain('🔄 Phase 2: Design - **IN_PROGRESS**');
    expect(result).toContain('### 現在のフェーズ: Phase 2 (Design)');
    expect(result).toContain('<details>');
    expect(result).toContain('### Phase 0: Planning');
    expect(result).toContain('### Phase 1: Requirements');
    expect(result).toContain('**レビュー結果**: approved');
  });

  test('1-3: 失敗フェーズの進捗コメントが正しくフォーマットされる', () => {
    // Given: requirements失敗、リトライカウント3
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00' },
      requirements: { status: 'failed', started_at: '2024-01-23 12:05:00', retry_count: 3 },
    });

    // When: requirements フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'failed', mockMetadata, 'Max retries reached');

    // Then: 失敗ステータスが表示される
    expect(result).toContain('❌ Phase 1: Requirements - **FAILED**');
    expect(result).toContain('**ステータス**: FAILED');
    expect(result).toContain('**試行回数**: 4/3'); // retry_count=3 → 4回目の試行
    expect(result).toContain('Max retries reached');
  });

  test('1-4: 最初のフェーズ（planning）の進捗コメントが正しくフォーマットされる', () => {
    // Given: すべてのフェーズがpending、planning開始
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'in_progress', started_at: '2024-01-23 10:00:00', retry_count: 0 },
    });

    // When: planning フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('planning', 'in_progress', mockMetadata, 'Planning the implementation...');

    // Then: planningが進行中と表示される
    expect(result).toContain('🔄 Phase 0: Planning - **IN_PROGRESS**');
    expect(result).toContain('### 現在のフェーズ: Phase 0 (Planning)');
    expect(result).toContain('Planning the implementation...');
    expect(result).not.toContain('<details>'); // 完了したフェーズがないため
  });
});

describe('ProgressFormatter - 絵文字マッピング', () => {
  const formatter = new ProgressFormatter();

  test('2-1: 各ステータスに対応する絵文字が正しく表示される', () => {
    // Given: 各ステータスのフェーズ
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00' },
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00' },
      design: { status: 'pending' },
      test_scenario: { status: 'failed', started_at: '2024-01-23 12:10:00' },
    });

    // When: requirements フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 各絵文字が正しくマッピングされる
    expect(result).toContain('✅ Phase 0: Planning - **COMPLETED**'); // completed → ✅
    expect(result).toContain('🔄 Phase 1: Requirements - **IN_PROGRESS**'); // in_progress → 🔄
    expect(result).toContain('⏸️ Phase 2: Design - **PENDING**'); // pending → ⏸️
    expect(result).toContain('❌ Phase 3: Test Scenario - **FAILED**'); // failed → ❌
  });
});

describe('ProgressFormatter - リトライカウント', () => {
  const formatter = new ProgressFormatter();

  test('3-1: リトライカウント0の場合、試行回数1/3と表示される', () => {
    // Given: retry_count=0
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 0 },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 試行回数1/3
    expect(result).toContain('**試行回数**: 1/3');
  });

  test('3-2: リトライカウント1の場合、試行回数2/3と表示される', () => {
    // Given: retry_count=1
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 1 },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 試行回数2/3
    expect(result).toContain('**試行回数**: 2/3');
  });

  test('3-3: リトライカウント2の場合、試行回数3/3と表示される', () => {
    // Given: retry_count=2
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 2 },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 試行回数3/3
    expect(result).toContain('**試行回数**: 3/3');
  });
});

describe('ProgressFormatter - 詳細メッセージ', () => {
  const formatter = new ProgressFormatter();

  test('4-1: 詳細メッセージが指定された場合、表示される', () => {
    // Given: 詳細メッセージあり
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 0 },
    });
    const details = 'Analyzing existing code structure...';

    // When: 詳細メッセージ付きで進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata, details);

    // Then: 詳細メッセージが含まれる
    expect(result).toContain(details);
  });

  test('4-2: 詳細メッセージが指定されない場合、省略される', () => {
    // Given: 詳細メッセージなし
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 0 },
    });

    // When: 詳細メッセージなしで進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 基本情報のみ
    expect(result).toContain('### 現在のフェーズ: Phase 1 (Requirements)');
    expect(result).not.toContain('Analyzing'); // 詳細メッセージが含まれない
  });

  test('4-3: 複数行の詳細メッセージが正しく表示される', () => {
    // Given: 複数行の詳細メッセージ
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00', retry_count: 0 },
    });
    const details = `Line 1: First detail
Line 2: Second detail
Line 3: Third detail`;

    // When: 詳細メッセージ付きで進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata, details);

    // Then: すべての行が含まれる
    expect(result).toContain('Line 1: First detail');
    expect(result).toContain('Line 2: Second detail');
    expect(result).toContain('Line 3: Third detail');
  });
});

describe('ProgressFormatter - 完了フェーズの折りたたみ表示', () => {
  const formatter = new ProgressFormatter();

  test('5-1: 完了フェーズが複数ある場合、すべて折りたたみ表示される', () => {
    // Given: 3つのフェーズが完了
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00', review_result: 'approved' },
      requirements: { status: 'completed', completed_at: '2024-01-23 12:10:00', review_result: 'approved' },
      design: { status: 'completed', completed_at: '2024-01-23 12:20:00', review_result: 'approved' },
      test_scenario: { status: 'in_progress', started_at: '2024-01-23 12:25:00' },
    });

    // When: test_scenario フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('test_scenario', 'in_progress', mockMetadata);

    // Then: 3つの完了フェーズが折りたたみ表示される
    expect(result).toContain('<details>');
    expect(result).toContain('完了したフェーズの詳細');
    expect(result).toContain('### Phase 0: Planning');
    expect(result).toContain('### Phase 1: Requirements');
    expect(result).toContain('### Phase 2: Design');
    expect(result).toContain('</details>');
  });

  test('5-2: 完了フェーズがない場合、折りたたみ表示されない', () => {
    // Given: すべてのフェーズがpending
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'in_progress', started_at: '2024-01-23 10:00:00' },
    });

    // When: planning フェーズの進捗コメントを生成
    const result = formatter.formatProgressComment('planning', 'in_progress', mockMetadata);

    // Then: 折りたたみ表示がない
    expect(result).not.toContain('<details>');
    expect(result).not.toContain('完了したフェーズの詳細');
  });
});

describe('ProgressFormatter - 最終更新時刻', () => {
  const formatter = new ProgressFormatter();

  test('6-1: 最終更新時刻が含まれる', () => {
    // Given: 任意の状態
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'in_progress', started_at: '2024-01-23 10:00:00' },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('planning', 'in_progress', mockMetadata);

    // Then: 最終更新時刻が含まれる
    expect(result).toContain('*最終更新:');
    expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); // YYYY-MM-DD HH:MM:SS 形式
    expect(result).toContain('*AI駆動開発自動化ワークフロー (Claude Agent SDK)*');
  });
});

describe('ProgressFormatter - エッジケース', () => {
  const formatter = new ProgressFormatter();

  test('7-1: すべてのフェーズがpendingの場合でも正常動作', () => {
    // Given: すべてのフェーズがpending
    const mockMetadata = createMockMetadataManager({});

    // When: planning フェーズの進捗コメントを生成（pendingのまま）
    const result = formatter.formatProgressComment('planning', 'pending', mockMetadata);

    // Then: 基本情報が表示される
    expect(result).toContain('## 🤖 AI Workflow - 進捗状況');
    expect(result).toContain('⏸️ Phase 0: Planning - **PENDING**');
  });

  test('7-2: started_atがnullの進行中フェーズでも正常動作', () => {
    // Given: started_atがnull
    const mockMetadata = createMockMetadataManager({
      requirements: { status: 'in_progress', started_at: null, retry_count: 0 },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 基本情報のみ表示（開始時刻は省略）
    expect(result).toContain('### 現在のフェーズ: Phase 1 (Requirements)');
    expect(result).toContain('**ステータス**: IN_PROGRESS');
    expect(result).not.toContain('**開始時刻**:'); // started_atがnullのため省略
  });

  test('7-3: completed_atがnullの完了フェーズでも正常動作', () => {
    // Given: completed_atがnull
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: null },
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00' },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: 完了時刻なしで表示
    expect(result).toContain('✅ Phase 0: Planning - **COMPLETED**');
    expect(result).not.toContain('(2024'); // 完了時刻が表示されない
  });

  test('7-4: review_resultがnullの完了フェーズでも正常動作', () => {
    // Given: review_resultがnull
    const mockMetadata = createMockMetadataManager({
      planning: { status: 'completed', completed_at: '2024-01-23 12:00:00', review_result: null },
      requirements: { status: 'in_progress', started_at: '2024-01-23 12:05:00' },
    });

    // When: 進捗コメントを生成
    const result = formatter.formatProgressComment('requirements', 'in_progress', mockMetadata);

    // Then: レビュー結果なしで表示
    expect(result).toContain('### Phase 0: Planning');
    expect(result).not.toContain('**レビュー結果**:');
  });
});
