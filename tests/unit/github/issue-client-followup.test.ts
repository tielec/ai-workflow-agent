import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Octokit } from '@octokit/rest';
import { RequestError } from '@octokit/request-error';
import { IssueClient, IssueCreationResult } from '../../../src/core/github/issue-client.js';
import { RemainingTask, IssueContext } from '../../../src/types.js';

// @jest/globals を使用するため、jest.Mocked 型を any でキャストする必要がある
type MockedOctokit = {
  issues: {
    get: ReturnType<typeof jest.fn>;
    listComments: ReturnType<typeof jest.fn>;
    createComment: ReturnType<typeof jest.fn>;
    update: ReturnType<typeof jest.fn>;
    create: ReturnType<typeof jest.fn>;
  };
};

/**
 * テストスイート: Issue #104 - フォローアップ Issue 改善
 *
 * このテストスイートは、Phase 3のテストシナリオに基づいて実装されています。
 * テスト戦略: UNIT_INTEGRATION
 * - ユニットテスト: extractKeywords(), generateFollowUpTitle(), formatTaskDetails()
 * - インテグレーションテスト: createIssueFromEvaluation()
 */
describe('IssueClient - Follow-up Issue Improvements (Issue #104)', () => {
  let issueClient: IssueClient;
  let mockOctokit: MockedOctokit;

  beforeEach(() => {
    // Octokitモックの作成
    mockOctokit = {
      issues: {
        get: jest.fn(),
        listComments: jest.fn(),
        createComment: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    issueClient = new IssueClient(mockOctokit as any, 'owner', 'repo');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===== ユニットテスト: extractKeywords() =====

  describe('extractKeywords (private method)', () => {
    /**
     * テストケース 2.1.1: 正常系 - 3つのタスクから3つのキーワードを抽出
     *
     * Given: 3つの有効なタスクを含む RemainingTask[]
     * When: extractKeywords(tasks, 3) を呼び出す
     * Then: 3つのキーワードが抽出される
     */
    it('should extract keywords from 3 tasks', () => {
      const tasks: RemainingTask[] = [
        { task: 'Coverage improvement to 90%', phase: 'test_implementation', priority: 'Medium' },
        { task: 'Performance benchmark execution', phase: 'testing', priority: 'Medium' },
        { task: 'Documentation updates', phase: 'documentation', priority: 'Low' },
      ];

      const keywords = (issueClient as any).extractKeywords(tasks, 3);

      expect(keywords).toEqual([
        'Coverage improvement',    // 20文字に切り詰め (元: 'Coverage improvement to 90%')
        'Performance benchmar',    // 20文字に切り詰め (元: 'Performance benchmark execution')
        'Documentation update',    // 20文字に切り詰め (元: 'Documentation updates')
      ]);
    });

    /**
     * テストケース 2.1.2: 正常系 - 括弧前まで抽出（日本語括弧）
     *
     * Given: 日本語括弧（（）を含むタスクテキスト
     * When: extractKeywords(tasks, 1) を呼び出す
     * Then: 括弧前までのテキストが抽出される
     */
    it('should extract keywords before Japanese parentheses', () => {
      const tasks: RemainingTask[] = [
        { task: 'Jest設定を修正（src/jest.config.js）', phase: 'implementation', priority: 'High' },
      ];

      const keywords = (issueClient as any).extractKeywords(tasks, 1);

      expect(keywords).toEqual(['Jest設定を修正']);
    });

    /**
     * テストケース 2.1.3: 正常系 - 括弧前まで抽出（英語括弧）
     *
     * Given: 英語括弧（()）を含むタスクテキスト
     * When: extractKeywords(tasks, 1) を呼び出す
     * Then: 括弧前までのテキストが抽出される
     */
    it('should extract keywords before English parentheses', () => {
      const tasks: RemainingTask[] = [
        { task: 'Fix Jest configuration (src/jest.config.js)', phase: 'implementation', priority: 'High' },
      ];

      const keywords = (issueClient as any).extractKeywords(tasks, 1);

      expect(keywords).toEqual(['Fix Jest configurati']); // 20文字に切り詰め (元: 'Fix Jest configuration')
    });

    /**
     * テストケース 2.1.4: 境界値 - タスクテキストが20文字を超える場合
     *
     * Given: 20文字を超えるタスクテキスト
     * When: extractKeywords(tasks, 1) を呼び出す
     * Then: 20文字で切り詰められる
     */
    it('should truncate keywords to 20 characters', () => {
      const tasks: RemainingTask[] = [
        { task: 'This is a very long task description that exceeds 20 characters', phase: 'implementation', priority: 'High' },
      ];

      const keywords = (issueClient as any).extractKeywords(tasks, 1);

      expect(keywords[0]).toBe('This is a very long '); // 末尾空白を含めて20文字
      expect(keywords[0].length).toBe(20);
    });

    /**
     * テストケース 2.1.5: 境界値 - 空配列
     *
     * Given: 空の RemainingTask[]
     * When: extractKeywords([], 3) を呼び出す
     * Then: 空配列が返される
     */
    it('should return empty array for empty tasks', () => {
      const tasks: RemainingTask[] = [];

      const keywords = (issueClient as any).extractKeywords(tasks, 3);

      expect(keywords).toEqual([]);
    });

    /**
     * テストケース 2.1.6: 境界値 - maxCount より多いタスクがある場合
     *
     * Given: 10個のタスクを含む RemainingTask[]
     * When: extractKeywords(tasks, 3) を呼び出す
     * Then: 最初の3つのみが処理される
     */
    it('should extract only maxCount keywords when more tasks available', () => {
      const tasks: RemainingTask[] = Array.from({ length: 10 }, (_, i) => ({
        task: `Task ${i + 1}`,
        phase: `phase_${i + 1}`,
        priority: 'Medium',
      }));

      const keywords = (issueClient as any).extractKeywords(tasks, 3);

      expect(keywords).toEqual(['Task 1', 'Task 2', 'Task 3']);
    });

    /**
     * テストケース 2.1.7: 異常系 - タスクテキストが空文字列
     *
     * Given: 空文字列のタスクと有効なタスク
     * When: extractKeywords(tasks, 2) を呼び出す
     * Then: 空文字列はスキップされ、有効なタスクのみが抽出される
     */
    it('should skip empty task text', () => {
      const tasks: RemainingTask[] = [
        { task: '', phase: 'implementation', priority: 'High' },
        { task: 'Valid task', phase: 'testing', priority: 'Medium' },
      ];

      const keywords = (issueClient as any).extractKeywords(tasks, 2);

      expect(keywords).toEqual(['Valid task']);
    });

    /**
     * テストケース 2.1.8: 異常系 - すべてのタスクテキストが空
     *
     * Given: すべてのタスクが空文字列または空白のみ
     * When: extractKeywords(tasks, 2) を呼び出す
     * Then: 空配列が返される
     */
    it('should return empty array when all tasks are empty', () => {
      const tasks: RemainingTask[] = [
        { task: '', phase: 'p1', priority: 'High' },
        { task: '   ', phase: 'p2', priority: 'Medium' },
      ];

      const keywords = (issueClient as any).extractKeywords(tasks, 2);

      expect(keywords).toEqual([]);
    });
  });

  // ===== ユニットテスト: generateFollowUpTitle() =====

  describe('generateFollowUpTitle (private method)', () => {
    /**
     * テストケース 2.2.1: 正常系 - キーワードが抽出できた場合のタイトル生成
     *
     * Given: 有効なタスクを含む RemainingTask[]
     * When: generateFollowUpTitle(91, tasks) を呼び出す
     * Then: キーワードを含む正しいフォーマットのタイトルが生成される
     */
    it('should generate title with keywords', () => {
      const tasks: RemainingTask[] = [
        { task: 'テストカバレッジ改善', phase: 'test_implementation', priority: 'Medium' },
        { task: 'パフォーマンスベンチマーク', phase: 'testing', priority: 'Medium' },
      ];

      const title = (issueClient as any).generateFollowUpTitle(91, tasks);

      expect(title).toBe('[FOLLOW-UP] #91: テストカバレッジ改善・パフォーマンスベンチマーク');
    });

    /**
     * テストケース 2.2.2: 正常系 - 1つのキーワードのみの場合
     *
     * Given: 1つのタスクのみを含む RemainingTask[]
     * When: generateFollowUpTitle(52, tasks) を呼び出す
     * Then: 1つのキーワードを含むタイトルが生成される
     */
    it('should generate title with single keyword', () => {
      const tasks: RemainingTask[] = [
        { task: 'ドキュメント更新', phase: 'documentation', priority: 'Low' },
      ];

      const title = (issueClient as any).generateFollowUpTitle(52, tasks);

      expect(title).toBe('[FOLLOW-UP] #52: ドキュメント更新');
    });

    /**
     * テストケース 2.2.3: 境界値 - タイトルが80文字以内の場合
     *
     * Given: 生成されるタイトルが80文字以内
     * When: generateFollowUpTitle(74, tasks) を呼び出す
     * Then: タイトルがそのまま返される
     */
    it('should keep title under 80 characters without truncation', () => {
      const tasks: RemainingTask[] = [
        { task: 'ESLintルール追加', phase: 'implementation', priority: 'High' },
        { task: 'SecretMasker統合検討', phase: 'design', priority: 'Medium' },
      ];

      const title = (issueClient as any).generateFollowUpTitle(74, tasks);

      expect(title).toBe('[FOLLOW-UP] #74: ESLintルール追加・SecretMasker統合検討');
      expect(title.length).toBeLessThanOrEqual(80);
    });

    /**
     * テストケース 2.2.4: 境界値 - タイトルが80文字を超える場合
     *
     * Given: 生成されるタイトルが80文字を超える
     * When: generateFollowUpTitle(123, tasks) を呼び出す
     * Then: 77文字で切り詰められ、末尾に "..." が追加される
     */
    it('should truncate title to 80 characters with ellipsis', () => {
      const tasks: RemainingTask[] = [
        // より長いタスクテキストを使用し、Issue番号を5桁にして確実に80文字超えを保証
        { task: 'Implement a comprehensive authentication and authorization system', phase: 'implementation', priority: 'High' },
        { task: 'Add extensive unit and integration tests for all paths', phase: 'testing', priority: 'High' },
        { task: 'Update all documentation and user guides thoroughly', phase: 'documentation', priority: 'High' },
      ];

      // Issue番号を12345（5桁）にして、タイトルを長くする
      // [FOLLOW-UP] #12345: Implement a comprehe・Add extensive unit a・Update all documenta
      // = 20 + 20 + 1 + 20 + 1 + 20 = 82文字 → 77文字 + "..." = 80文字
      const title = (issueClient as any).generateFollowUpTitle(12345, tasks);

      expect(title.length).toBe(80);
      expect(title.endsWith('...')).toBe(true);
    });

    /**
     * テストケース 2.2.5: 異常系 - キーワードが抽出できない場合のフォールバック
     *
     * Given: すべてのタスクが空文字列
     * When: generateFollowUpTitle(52, tasks) を呼び出す
     * Then: フォールバック形式のタイトルが返される
     */
    it('should use fallback format when no keywords available', () => {
      const tasks: RemainingTask[] = [
        { task: '', phase: 'implementation', priority: 'High' },
      ];

      const title = (issueClient as any).generateFollowUpTitle(52, tasks);

      expect(title).toBe('[FOLLOW-UP] Issue #52 - 残タスク');
    });
  });

  // ===== ユニットテスト: formatTaskDetails() =====

  describe('formatTaskDetails (private method)', () => {
    /**
     * テストケース 2.3.1: 正常系 - すべてのオプショナルフィールドが存在する場合
     *
     * Given: すべてのオプショナルフィールドを含む RemainingTask
     * When: formatTaskDetails(task, 1) を呼び出す
     * Then: すべてのセクションが正しく表示される
     */
    it('should format task with all optional fields', () => {
      const task: RemainingTask = {
        task: 'カバレッジを 90% に改善',
        phase: 'test_implementation',
        priority: 'Medium',
        priorityReason: '元 Issue #91 の推奨事項、ブロッカーではない',
        targetFiles: ['src/core/phase-factory.ts', 'src/commands/execute/agent-setup.ts'],
        steps: ['不足しているテストケースを特定', 'エッジケースのテストを追加'],
        acceptanceCriteria: ['90% 以上のカバレッジを達成', 'npm run test:coverage がすべてパス'],
        dependencies: ['Task 1 完了後に実行'],
        estimatedHours: '2-4h',
      };

      const lines = (issueClient as any).formatTaskDetails(task, 1);

      expect(lines.join('\n')).toContain('### Task 1: カバレッジを 90% に改善');
      expect(lines.join('\n')).toContain('**対象ファイル**:');
      expect(lines.join('\n')).toContain('- `src/core/phase-factory.ts`');
      expect(lines.join('\n')).toContain('**必要な作業**:');
      expect(lines.join('\n')).toContain('1. 不足しているテストケースを特定');
      expect(lines.join('\n')).toContain('**Acceptance Criteria**:');
      expect(lines.join('\n')).toContain('- [ ] 90% 以上のカバレッジを達成');
      expect(lines.join('\n')).toContain('**Phase**: test_implementation');
      expect(lines.join('\n')).toContain('**優先度**: Medium - 元 Issue #91 の推奨事項、ブロッカーではない');
      expect(lines.join('\n')).toContain('**見積もり**: 2-4h');
      expect(lines.join('\n')).toContain('**依存タスク**:');
      expect(lines.join('\n')).toContain('- Task 1 完了後に実行');
    });

    /**
     * テストケース 2.3.2: 正常系 - 最小限のフィールドのみ（オプショナルフィールドなし）
     *
     * Given: オプショナルフィールドを含まない RemainingTask
     * When: formatTaskDetails(task, 2) を呼び出す
     * Then: 最小限の情報のみが表示される
     */
    it('should format task with minimal fields only', () => {
      const task: RemainingTask = {
        task: 'ドキュメント更新',
        phase: 'documentation',
        priority: 'Low',
      };

      const lines = (issueClient as any).formatTaskDetails(task, 2);
      const output = lines.join('\n');

      expect(output).toContain('### Task 2: ドキュメント更新');
      expect(output).toContain('**Phase**: documentation');
      expect(output).toContain('**優先度**: Low');
      expect(output).toContain('**見積もり**: 未定');
      expect(output).not.toContain('**対象ファイル**:');
      expect(output).not.toContain('**必要な作業**:');
      expect(output).not.toContain('**Acceptance Criteria**:');
      expect(output).not.toContain('**依存タスク**:');
    });

    /**
     * テストケース 2.3.3: 境界値 - targetFiles が空配列の場合
     *
     * Given: targetFiles が空配列の RemainingTask
     * When: formatTaskDetails(task, 1) を呼び出す
     * Then: 対象ファイルセクションが表示されない
     */
    it('should not display target files section when empty array', () => {
      const task: RemainingTask = {
        task: 'テストケース追加',
        phase: 'test_implementation',
        priority: 'High',
        targetFiles: [],
      };

      const lines = (issueClient as any).formatTaskDetails(task, 1);

      expect(lines.join('\n')).not.toContain('**対象ファイル**:');
    });

    /**
     * テストケース 2.3.4: 境界値 - steps が1個の場合
     *
     * Given: steps が1つの要素を含む RemainingTask
     * When: formatTaskDetails(task, 1) を呼び出す
     * Then: 番号付きリストで正しく表示される
     */
    it('should format single step correctly', () => {
      const task: RemainingTask = {
        task: 'シンプルなタスク',
        phase: 'implementation',
        priority: 'Medium',
        steps: ['修正を適用'],
      };

      const lines = (issueClient as any).formatTaskDetails(task, 1);

      expect(lines.join('\n')).toContain('**必要な作業**:');
      expect(lines.join('\n')).toContain('1. 修正を適用');
    });

    /**
     * テストケース 2.3.5: 境界値 - acceptanceCriteria が複数ある場合
     *
     * Given: acceptanceCriteria が3つの要素を含む RemainingTask
     * When: formatTaskDetails(task, 1) を呼び出す
     * Then: すべてチェックリスト形式で表示される
     */
    it('should format multiple acceptance criteria as checklist', () => {
      const task: RemainingTask = {
        task: '複雑なタスク',
        phase: 'testing',
        priority: 'High',
        acceptanceCriteria: [
          'すべてのテストがパス',
          'カバレッジ 90% 以上',
          'パフォーマンスが 10% 改善',
        ],
      };

      const lines = (issueClient as any).formatTaskDetails(task, 1);
      const output = lines.join('\n');

      expect(output).toContain('**Acceptance Criteria**:');
      expect(output).toContain('- [ ] すべてのテストがパス');
      expect(output).toContain('- [ ] カバレッジ 90% 以上');
      expect(output).toContain('- [ ] パフォーマンスが 10% 改善');
    });
  });

  // ===== インテグレーションテスト: createIssueFromEvaluation() =====

  describe('createIssueFromEvaluation (integration)', () => {
    /**
     * シナリオ 3.1.1: issueContext 指定時の Issue 作成
     *
     * Given: issueContext オブジェクトが有効な値を含む
     * When: createIssueFromEvaluation() を issueContext 付きで呼び出す
     * Then: 背景セクションが正しく含まれ、タイトルが改善された形式で Issue が作成される
     */
    it('should create issue with issueContext', async () => {
      const remainingTasks: RemainingTask[] = [
        { task: 'テストカバレッジ改善', phase: 'test_implementation', priority: 'Medium' },
        { task: 'パフォーマンスベンチマーク', phase: 'testing', priority: 'Medium' },
      ];

      const issueContext: IssueContext = {
        summary: 'この Issue は、Issue #91「テスト失敗修正」の Evaluation フェーズで特定された残タスクをまとめたものです。',
        blockerStatus: 'すべてのブロッカーは解決済み',
        deferredReason: 'テスト失敗修正を優先したため、カバレッジ改善は後回しにした',
      };

      const mockIssue = {
        number: 92,
        html_url: 'https://github.com/owner/repo/issues/92',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const result: IssueCreationResult = await issueClient.createIssueFromEvaluation(
        91,
        remainingTasks,
        '.ai-workflow/issue-91/09_evaluation/output/evaluation_report.md',
        issueContext,
      );

      // タイトルが改善された形式である
      expect(mockOctokit.issues.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '[FOLLOW-UP] #91: テストカバレッジ改善・パフォーマンスベンチマーク',
        }),
      );

      // 本文に背景セクションが含まれる
      const callArgs = mockOctokit.issues.create.mock.calls[0][0] as any;
      expect(callArgs.body).toContain('## 背景');
      expect(callArgs.body).toContain(issueContext.summary);
      expect(callArgs.body).toContain('### 元 Issue のステータス');
      expect(callArgs.body).toContain(issueContext.blockerStatus);
      expect(callArgs.body).toContain('### なぜこれらのタスクが残ったか');
      expect(callArgs.body).toContain(issueContext.deferredReason);

      // 結果が成功を示す
      expect(result.success).toBe(true);
      expect(result.issue_number).toBe(92);
      expect(result.issue_url).toBe('https://github.com/owner/repo/issues/92');
    });

    /**
     * シナリオ 3.1.2: issueContext 未指定時の Issue 作成（後方互換性）
     *
     * Given: issueContext パラメータが未指定（undefined）
     * When: createIssueFromEvaluation() を issueContext なしで呼び出す
     * Then: フォールバック形式の背景セクションが使用され、Issue が作成される
     */
    it('should create issue without issueContext (backward compatibility)', async () => {
      const remainingTasks: RemainingTask[] = [
        { task: 'ドキュメント更新', phase: 'documentation', priority: 'Low' },
      ];

      const mockIssue = {
        number: 53,
        html_url: 'https://github.com/owner/repo/issues/53',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const result = await issueClient.createIssueFromEvaluation(
        52,
        remainingTasks,
        '.ai-workflow/issue-52/09_evaluation/output/evaluation_report.md',
        // issueContext 未指定
      );

      // タイトルが生成される
      const callArgs = mockOctokit.issues.create.mock.calls[0][0] as any;
      expect(callArgs.title).toContain('[FOLLOW-UP]');

      // 本文にフォールバック形式の背景が含まれる
      expect(callArgs.body).toContain('## 背景');
      expect(callArgs.body).toContain('AI Workflow Issue #52 の評価フェーズで残タスクが見つかりました。');

      // 元 Issue のステータスセクションが表示されない
      expect(callArgs.body).not.toContain('### 元 Issue のステータス');

      // 結果が成功を示す
      expect(result.success).toBe(true);
    });

    /**
     * シナリオ 3.1.3: 残タスク0件の場合（エッジケース）
     *
     * Given: RemainingTask[] が空配列
     * When: createIssueFromEvaluation() を空配列で呼び出す
     * Then: Issue が正常に作成される
     */
    it('should handle empty remaining tasks', async () => {
      const remainingTasks: RemainingTask[] = [];

      const mockIssue = {
        number: 54,
        html_url: 'https://github.com/owner/repo/issues/54',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const result = await issueClient.createIssueFromEvaluation(
        53,
        remainingTasks,
        'eval.md',
      );

      // タイトルがフォールバック形式である
      const callArgs = mockOctokit.issues.create.mock.calls[0][0] as any;
      expect(callArgs.title).toBe('[FOLLOW-UP] Issue #53 - 残タスク');

      // 本文に背景セクションが含まれるが、タスクは0件
      expect(callArgs.body).toContain('## 背景');
      expect(callArgs.body).toContain('## 残タスク詳細');

      // エラーが発生しない
      expect(result.success).toBe(true);
    });

    /**
     * シナリオ 3.1.4: 残タスク10件の場合（多数のタスク）
     *
     * Given: RemainingTask[] が10個のタスクを含む
     * When: createIssueFromEvaluation() を10個のタスクで呼び出す
     * Then: すべてのタスクが正しく Issue 本文に含まれる
     */
    it('should handle 10 remaining tasks', async () => {
      const remainingTasks: RemainingTask[] = Array.from({ length: 10 }, (_, i) => ({
        task: `Task ${i + 1}`,
        phase: `phase_${i + 1}`,
        priority: i % 3 === 0 ? 'High' : i % 3 === 1 ? 'Medium' : 'Low',
      }));

      const mockIssue = {
        number: 55,
        html_url: 'https://github.com/owner/repo/issues/55',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const result = await issueClient.createIssueFromEvaluation(
        54,
        remainingTasks,
        'eval.md',
      );

      // タイトルに最大3つのキーワードが含まれる
      const callArgs = mockOctokit.issues.create.mock.calls[0][0] as any;
      expect(callArgs.title).toContain('Task 1');
      expect(callArgs.title).toContain('Task 2');
      expect(callArgs.title).toContain('Task 3');

      // 本文に10個すべてのタスクが含まれる
      for (let i = 1; i <= 10; i++) {
        expect(callArgs.body).toContain(`### Task ${i}: Task ${i}`);
      }

      expect(result.success).toBe(true);
    });

    /**
     * シナリオ 3.1.5: GitHub API エラー時のエラーハンドリング
     *
     * Given: GitHub API が RequestError をスローする
     * When: createIssueFromEvaluation() を呼び出す
     * Then: エラーが適切にキャッチされ、ログが記録される
     */
    it('should handle GitHub API error appropriately', async () => {
      const remainingTasks: RemainingTask[] = [
        { task: 'Test task', phase: 'testing', priority: 'High' },
      ];

      const mockError = new RequestError('Validation Failed', 422, {
        request: {
          method: 'POST',
          url: 'https://api.github.com/repos/owner/repo/issues',
          headers: {},
        },
        response: {
          status: 422,
          url: 'https://api.github.com/repos/owner/repo/issues',
          headers: {},
          data: {},
        },
      });

      mockOctokit.issues.create.mockRejectedValue(mockError);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await issueClient.createIssueFromEvaluation(
        100,
        remainingTasks,
        'eval.md',
      );

      // エラーがキャッチされる
      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub API error: 422');
      expect(result.issue_number).toBeNull();
      expect(result.issue_url).toBeNull();

      consoleErrorSpy.mockRestore();
    });

    /**
     * シナリオ 4.2.1: 新規フィールド未指定時の動作検証（後方互換性）
     *
     * Given: RemainingTask の新規フィールドを含まない従来形式
     * When: createIssueFromEvaluation() を呼び出す
     * Then: 新規フィールド未指定でエラーが発生せず、デフォルト値が使用される
     */
    it('should handle RemainingTask without new fields (backward compatibility)', async () => {
      const tasks: RemainingTask[] = [
        { task: 'Test task', phase: 'testing', priority: 'Medium' },
      ];

      const mockIssue = {
        number: 60,
        html_url: 'https://github.com/owner/repo/issues/60',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const result = await issueClient.createIssueFromEvaluation(
        59,
        tasks,
        'eval.md',
      );

      const callArgs = mockOctokit.issues.create.mock.calls[0][0] as any;

      // 本文に基本情報が含まれる
      expect(callArgs.body).toContain('### Task 1: Test task');
      expect(callArgs.body).toContain('**Phase**: testing');
      expect(callArgs.body).toContain('**優先度**: Medium');
      expect(callArgs.body).toContain('**見積もり**: 未定'); // デフォルト値

      // 新規フィールドのセクションは表示されない
      expect(callArgs.body).not.toContain('**対象ファイル**:');
      expect(callArgs.body).not.toContain('**必要な作業**:');
      expect(callArgs.body).not.toContain('**Acceptance Criteria**:');

      // エラーが発生しない
      expect(result.success).toBe(true);
    });

    /**
     * シナリオ 4.2.2: 新規フィールド指定時の動作検証
     *
     * Given: RemainingTask の新規フィールドを含む
     * When: createIssueFromEvaluation() を呼び出す
     * Then: すべての新規フィールドが正しく表示される
     */
    it('should display all new fields when specified', async () => {
      const tasks: RemainingTask[] = [
        {
          task: 'Test task with new fields',
          phase: 'testing',
          priority: 'High',
          priorityReason: 'Blocker for next release',
          targetFiles: ['src/test.ts'],
          steps: ['Step 1', 'Step 2'],
          acceptanceCriteria: ['All tests pass'],
          dependencies: ['Task A'],
          estimatedHours: '1-2h',
        },
      ];

      const mockIssue = {
        number: 61,
        html_url: 'https://github.com/owner/repo/issues/61',
      };

      mockOctokit.issues.create.mockResolvedValue({ data: mockIssue } as any);

      const result = await issueClient.createIssueFromEvaluation(
        60,
        tasks,
        'eval.md',
      );

      const callArgs = mockOctokit.issues.create.mock.calls[0][0] as any;

      // すべての新規フィールドが表示される
      expect(callArgs.body).toContain('**対象ファイル**:');
      expect(callArgs.body).toContain('- `src/test.ts`');
      expect(callArgs.body).toContain('**必要な作業**:');
      expect(callArgs.body).toContain('1. Step 1');
      expect(callArgs.body).toContain('2. Step 2');
      expect(callArgs.body).toContain('**Acceptance Criteria**:');
      expect(callArgs.body).toContain('- [ ] All tests pass');
      expect(callArgs.body).toContain('**優先度**: High - Blocker for next release');
      expect(callArgs.body).toContain('**依存タスク**:');
      expect(callArgs.body).toContain('- Task A');
      expect(callArgs.body).toContain('**見積もり**: 1-2h');

      expect(result.success).toBe(true);
    });
  });
});
