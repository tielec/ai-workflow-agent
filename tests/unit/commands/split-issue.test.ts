/**
 * ユニットテスト: split-issue コマンド
 *
 * テスト対象: src/commands/split-issue.ts
 * シナリオ出典: test-scenario.md のユニット系 (TC-UNIT-S001〜051)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import fs from 'node:fs';

// モック関数定義
const mockGetIssueInfo = jest.fn();
const mockCreateMultipleIssues = jest.fn();
const mockPostComment = jest.fn();
const mockLoadPrompt = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const mockResolveLocalRepoPath = jest.fn();
const mockGetGitHubRepository = jest.fn();
const mockGetHomeDir = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockClaudeExecute = jest.fn();
const mockCodexExecute = jest.fn();

// ESMモジュールのモック
await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
    createMultipleIssues = mockCreateMultipleIssues;
    postComment = mockPostComment;
  },
}));

await jest.unstable_mockModule('../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

await jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

await jest.unstable_mockModule('../../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    collectRepositoryCode: jest.fn().mockResolvedValue('ctx'),
  })),
}));

await jest.unstable_mockModule('../../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
  },
}));

await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

const {
  handleSplitIssueCommand,
  parseOptions,
  parseSplitResponseText,
  buildSplitResponseFromParsed,
  validateSplitResponse,
  displaySplitPreview,
  buildParentComment,
  calculateDefaultMetrics,
} = await import('../../../src/commands/split-issue.js');

describe('split-issue command (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue(process.cwd());
    mockLoadPrompt.mockReturnValue(
      '{"summary":"{ORIGINAL_TITLE}","issues":[],"metrics":{"completeness":80,"specificity":70}}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 123,
      title: 'Original Title',
      body: 'Original Body',
      url: 'https://example.com/issue/123',
      state: 'open',
      labels: [],
    });
    mockCreateMultipleIssues.mockResolvedValue({
      success: true,
      created: [],
      failed: [],
    });
    mockPostComment.mockResolvedValue({ id: 1 });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { executeTask: mockCodexExecute },
      claudeClient: { executeTask: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue([
      '{"summary":"概要","issues":[{"title":"Issue 1","body":"Body 1","labels":[],"priority":"high","dependencies":[]}]}',
    ]);
    mockCodexExecute.mockResolvedValue([
      '{"summary":"概要","issues":[{"title":"Issue 1","body":"Body 1","labels":[],"priority":"high","dependencies":[]}]}',
    ]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseOptions', () => {
    it('全オプション指定時に正しくパースされる (TC-UNIT-S001)', () => {
      // 意図: 全オプション指定の正常パースを確認する
      const result = parseOptions({
        issue: '123',
        language: 'en',
        agent: 'claude',
        apply: true,
        maxSplits: '5',
      });

      expect(result).toEqual({
        issueNumber: 123,
        language: 'en',
        agent: 'claude',
        apply: true,
        maxSplits: 5,
      });
    });

    it('最小構成でデフォルト値が適用される (TC-UNIT-S002)', () => {
      // 意図: issueのみ指定時のデフォルト設定を確認する
      const result = parseOptions({ issue: '456' });

      expect(result).toEqual({
        issueNumber: 456,
        language: 'ja',
        agent: 'auto',
        apply: false,
        maxSplits: 10,
      });
    });

    it('issueが数値型でもパースされる (TC-UNIT-S003)', () => {
      // 意図: commanderが数値を渡すケースを検証する
      const result = parseOptions({ issue: 789 });
      expect(result.issueNumber).toBe(789);
    });

    it('無効なissue/言語/エージェントでエラー (TC-UNIT-S004〜014)', () => {
      // 意図: 不正値の検証エラーをまとめて確認する
      expect(() => parseOptions({})).toThrow('--issue option is required.');
      expect(() => parseOptions({ issue: '0' })).toThrow('Invalid issue number');
      expect(() => parseOptions({ issue: '-1' })).toThrow('Invalid issue number');
      expect(() => parseOptions({ issue: 'abc' })).toThrow('Invalid issue number');
      expect(() => parseOptions({ issue: '1', maxSplits: '0' })).toThrow('Invalid max-splits');
      expect(() => parseOptions({ issue: '1', maxSplits: '21' })).toThrow('Invalid max-splits');
      expect(() => parseOptions({ issue: '1', maxSplits: 'abc' })).toThrow('Invalid max-splits');
      expect(() => parseOptions({ issue: '1', language: 'fr' })).toThrow('Invalid language');
      expect(() => parseOptions({ issue: '1', agent: 'gpt' })).toThrow('Invalid agent');
    });

    it('maxSplits境界値が許容される (TC-UNIT-S010/011)', () => {
      // 意図: maxSplitsの境界値が有効であることを確認する
      expect(parseOptions({ issue: '1', maxSplits: '1' }).maxSplits).toBe(1);
      expect(parseOptions({ issue: '1', maxSplits: '20' }).maxSplits).toBe(20);
    });
  });

  describe('buildSplitResponseFromParsed', () => {
    it('完全なJSONを正しく変換する (TC-UNIT-S015)', () => {
      // 意図: 正常なJSONがSplitAgentResponseに変換されることを確認する
      const parsed = {
        summary: 'Issue分割の概要',
        issues: [
          { title: '子Issue 1', body: '本文1', labels: ['enhancement'], priority: 'high', dependencies: [] },
          { title: '子Issue 2', body: '本文2', labels: ['bug'], priority: 'medium', dependencies: [0] },
        ],
        metrics: { completeness: 85, specificity: 70 },
      };

      const result = buildSplitResponseFromParsed(parsed);
      expect(result).toEqual({
        summary: 'Issue分割の概要',
        issues: [
          { title: '子Issue 1', body: '本文1', labels: ['enhancement'], priority: 'high', dependencies: [] },
          { title: '子Issue 2', body: '本文2', labels: ['bug'], priority: 'medium', dependencies: [0] },
        ],
        metrics: { completenessScore: 85, specificityScore: 70 },
      });
    });

    it('メトリクスなしでもデフォルト値が補完される (TC-UNIT-S016)', () => {
      // 意図: metrics未指定時のデフォルト挙動を確認する
      const result = buildSplitResponseFromParsed({
        summary: '概要',
        issues: [{ title: 'タイトル', body: '本文' }],
      });

      expect(result.metrics).toBeUndefined();
      expect(result.issues[0]).toEqual({
        title: 'タイトル',
        body: '本文',
        labels: [],
        priority: 'medium',
        dependencies: [],
      });
    });

    it('メトリクスのフィールド名揺らぎに対応する (TC-UNIT-S017)', () => {
      // 意図: completenessScore/specificityScore形式を許容する
      const result = buildSplitResponseFromParsed({
        summary: '概要',
        issues: [{ title: 'タイトル', body: '本文' }],
        metrics: { completenessScore: 90, specificityScore: 80 },
      });

      expect(result.metrics).toEqual({ completenessScore: 90, specificityScore: 80 });
    });

    it('labels/dependenciesのフィルタリングを行う (TC-UNIT-S018/019)', () => {
      // 意図: labelsやdependenciesの非対応型を除外する
      const result = buildSplitResponseFromParsed({
        summary: '概要',
        issues: [
          {
            title: 'タイトル',
            body: '本文',
            labels: ['valid', 123, null, 'also-valid'],
            dependencies: [0, 'invalid', null, 2],
          },
        ],
      });

      expect(result.issues[0].labels).toEqual(['valid', 'also-valid']);
      expect(result.issues[0].dependencies).toEqual([0, 2]);
    });

    it('issuesやsummaryが未指定でもフォールバックされる (TC-UNIT-S020/021)', () => {
      // 意図: summary/issue未指定時のフォールバックを確認する
      const result1 = buildSplitResponseFromParsed({ summary: '概要' });
      expect(result1.issues).toEqual([]);

      const result2 = buildSplitResponseFromParsed({ issues: [{ title: 'タイトル', body: '本文' }] });
      expect(result2.summary).toBe('');
    });
  });

  describe('parseSplitResponseText', () => {
    it('コードブロック内JSONをパースできる (TC-UNIT-S022)', () => {
      // 意図: Markdownコードブロック内JSONの抽出を検証する
      const response = [
        '以下が分割結果です:',
        '```json',
        '{"summary":"分割概要","issues":[{"title":"Issue 1","body":"Body 1","labels":[],"priority":"high","dependencies":[]}],"metrics":{"completeness":80,"specificity":75}}',
        '```',
      ].join('\n');

      const parsed = parseSplitResponseText(response);
      expect(parsed.summary).toBe('分割概要');
      expect(parsed.issues).toHaveLength(1);
    });

    it('ブレース追跡でJSONを抽出できる (TC-UNIT-S023)', () => {
      // 意図: コードブロックなしJSON抽出を検証する
      const response =
        '分割結果を生成しました。{"summary":"概要","issues":[{"title":"Issue 1","body":"Body","labels":[],"priority":"medium","dependencies":[]}],"metrics":{"completeness":70,"specificity":60}}';

      const parsed = parseSplitResponseText(response);
      expect(parsed.summary).toBe('概要');
      expect(parsed.issues).toHaveLength(1);
    });

    it('完全に不正なテキストはエラー (TC-UNIT-S024)', () => {
      // 意図: JSON不在時に例外が発生することを確認する
      expect(() => parseSplitResponseText('これはJSONを含まない普通のテキストです。')).toThrow(
        'Failed to parse',
      );
    });

    it('ネストされたブレースを含むJSONもパースできる (TC-UNIT-S025)', () => {
      // 意図: JSON本文内にブレースがある場合のパースを検証する
      const response = [
        '```json',
        '{"summary":"概要","issues":[{"title":"Issue 1","body":"```typescript\\nconst obj = { key: \'value\' };\\n```","labels":["enhancement"],"priority":"high","dependencies":[]}]}',
        '```',
      ].join('\n');

      const parsed = parseSplitResponseText(response);
      expect(parsed.issues[0].body).toContain('const obj = { key:');
    });
  });

  describe('validateSplitResponse', () => {
    it('issuesが空ならエラー (TC-UNIT-S026)', () => {
      // 意図: 空配列時に例外が発生することを確認する
      expect(() =>
        validateSplitResponse({ summary: '概要', issues: [], metrics: { completenessScore: 50, specificityScore: 50 } }, 10),
      ).toThrow('No issues');
    });

    it('maxSplits超過時に切り詰める (TC-UNIT-S027)', () => {
      // 意図: maxSplits超過時の切り詰め処理を確認する
      const result = validateSplitResponse(
        {
          summary: '概要',
          issues: [
            { title: 'Issue 1', body: 'Body 1', labels: [], priority: 'high', dependencies: [] },
            { title: 'Issue 2', body: 'Body 2', labels: [], priority: 'medium', dependencies: [] },
            { title: 'Issue 3', body: 'Body 3', labels: [], priority: 'low', dependencies: [] },
          ],
        },
        2,
      );

      expect(result.issues).toHaveLength(2);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('タイトル長が80超の場合に切り詰める (TC-UNIT-S028/029)', () => {
      // 意図: タイトル長境界値の処理を確認する
      const result = validateSplitResponse(
        {
          summary: '概要',
          issues: [
            { title: 'A'.repeat(100), body: '本文', labels: [], priority: 'medium', dependencies: [] },
            { title: 'B'.repeat(80), body: '本文', labels: [], priority: 'medium', dependencies: [] },
          ],
        },
        10,
      );

      expect(result.issues[0].title).toBe(`${'A'.repeat(77)}...`);
      expect(result.issues[0].title.length).toBe(80);
      expect(result.issues[1].title.length).toBe(80);
    });

    it('タイトルが空ならフォールバックする (TC-UNIT-S030)', () => {
      // 意図: 空タイトルのフォールバックを確認する
      const result = validateSplitResponse(
        {
          summary: '概要',
          issues: [{ title: '', body: '本文', labels: [], priority: 'medium', dependencies: [] }],
        },
        10,
      );

      expect(result.issues[0].title).toBe('Issue 1');
    });

    it('依存関係の範囲外/自己参照を除外する (TC-UNIT-S031/032)', () => {
      // 意図: 依存関係の無効値除外を確認する
      const result = validateSplitResponse(
        {
          summary: '概要',
          issues: [
            { title: 'Issue 1', body: 'Body 1', labels: [], priority: 'high', dependencies: [5, 0] },
            { title: 'Issue 2', body: 'Body 2', labels: [], priority: 'medium', dependencies: [0, 1, -1, 99] },
          ],
        },
        10,
      );

      expect(result.issues[0].dependencies).toEqual([]);
      expect(result.issues[1].dependencies).toEqual([0]);
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('正常入力は変更されない (TC-UNIT-S033)', () => {
      // 意図: 正常入力がそのまま返ることを確認する
      const input = {
        summary: '分割概要',
        issues: [
          { title: 'Issue 1', body: 'Body 1', labels: ['enhancement'], priority: 'high', dependencies: [] },
          { title: 'Issue 2', body: 'Body 2', labels: ['bug'], priority: 'medium', dependencies: [0] },
        ],
        metrics: { completenessScore: 85, specificityScore: 70 },
      };

      const result = validateSplitResponse(input, 10);
      expect(result).toEqual(input);
    });
  });

  describe('displaySplitPreview', () => {
    it('単一Issueのプレビューが表示される (TC-UNIT-S034)', () => {
      // 意図: 単一Issueの表示内容を確認する
      displaySplitPreview({
        success: true,
        originalTitle: 'Original',
        originalBody: 'Body',
        splitSummary: 'Issue分割の概要',
        splitIssues: [
          {
            title: 'サブタスク1',
            body: '本文内容が200文字以内の短い本文です。',
            labels: ['enhancement'],
            priority: 'high',
            dependencies: [],
          },
        ],
        metrics: { completenessScore: 85, specificityScore: 70 },
      });

      const output = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('SPLIT-ISSUE PREVIEW (dry-run)');
      expect(output).toContain('Issue 1/1');
      expect(output).toContain('サブタスク1');
      expect(output).toContain('enhancement');
      expect(output).toContain('Completeness Score: 85/100');
      expect(output).toContain('Specificity Score:  70/100');
      expect(output).toContain('--apply');
    });

    it('複数Issueと依存グラフが表示される (TC-UNIT-S035/037)', () => {
      // 意図: 複数Issueと依存グラフの表示を確認する
      displaySplitPreview({
        success: true,
        originalTitle: 'Original',
        originalBody: 'Body',
        splitSummary: '3件に分割',
        splitIssues: [
          { title: 'Issue 1', body: 'Body 1', labels: ['bug'], priority: 'high', dependencies: [] },
          { title: 'Issue 2', body: 'Body 2', labels: ['enhancement'], priority: 'medium', dependencies: [0] },
          { title: 'Issue 3', body: 'Body 3', labels: ['docs'], priority: 'low', dependencies: [0, 1] },
        ],
        metrics: { completenessScore: 90, specificityScore: 80 },
      });

      const output = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('Issue 1/3');
      expect(output).toContain('Issue 2/3');
      expect(output).toContain('Issue 3/3');
      expect(output).toContain('DEPENDENCY GRAPH');
      expect(output).toContain('Issue 2 → Issue 1');
      expect(output).toContain('Issue 3 → Issue 1, Issue 2');
    });

    it('本文が200文字を超えると省略される (TC-UNIT-S036)', () => {
      // 意図: 本文プレビューが省略されることを確認する
      const longBody = 'あ'.repeat(300);
      displaySplitPreview({
        success: true,
        originalTitle: 'Original',
        originalBody: 'Body',
        splitSummary: '概要',
        splitIssues: [
          { title: 'Issue 1', body: longBody, labels: [], priority: 'medium', dependencies: [] },
        ],
        metrics: { completenessScore: 50, specificityScore: 50 },
      });

      const output = mockLoggerInfo.mock.calls.map((c) => c[0]).join('\n');
      expect(output).toContain('...');
    });
  });

  describe('buildParentComment', () => {
    it('全件成功・依存関係ありのコメントを構築する (TC-UNIT-S038/041)', () => {
      // 意図: 依存関係付きコメントが正しく構築されることを確認する
      const comment = buildParentComment(
        {
          success: true,
          created: [
            { issueNumber: 201, issueUrl: 'https://github.com/owner/repo/issues/201', title: 'サブタスク1' },
            { issueNumber: 202, issueUrl: 'https://github.com/owner/repo/issues/202', title: 'サブタスク2' },
            { issueNumber: 203, issueUrl: 'https://github.com/owner/repo/issues/203', title: 'サブタスク3' },
          ],
          failed: [],
        },
        [
          { title: 'サブタスク1', body: '', labels: [], priority: 'high', dependencies: [] },
          { title: 'サブタスク2', body: '', labels: [], priority: 'medium', dependencies: [0] },
          { title: 'サブタスク3', body: '', labels: [], priority: 'low', dependencies: [0, 1] },
        ],
      );

      expect(comment).toContain('## Issue分割完了');
      expect(comment).toContain('- [ ] #201 - サブタスク1');
      expect(comment).toContain('- [ ] #202 - サブタスク2');
      expect(comment).toContain('- [ ] #203 - サブタスク3');
      expect(comment).toContain('### 依存関係');
      expect(comment).toContain('#202 は #201 の完了後に着手');
      expect(comment).toContain('#203 は #201, #202 の完了後に着手');
      expect(comment).toContain('*自動生成: ai-workflow split-issue*');
    });

    it('依存関係なしの場合は依存セクションを省略する (TC-UNIT-S039)', () => {
      // 意図: 依存関係がない場合のコメント構築を確認する
      const comment = buildParentComment(
        {
          success: true,
          created: [
            { issueNumber: 301, issueUrl: '...', title: 'Task A' },
            { issueNumber: 302, issueUrl: '...', title: 'Task B' },
          ],
          failed: [],
        },
        [
          { title: 'Task A', body: '', labels: [], priority: 'medium', dependencies: [] },
          { title: 'Task B', body: '', labels: [], priority: 'medium', dependencies: [] },
        ],
      );

      expect(comment).toContain('#301');
      expect(comment).toContain('#302');
      expect(comment).not.toContain('### 依存関係');
    });

    it('部分的失敗時は警告行を含める (TC-UNIT-S040)', () => {
      // 意図: 失敗行がコメントに含まれることを確認する
      const comment = buildParentComment(
        {
          success: false,
          created: [{ issueNumber: 401, issueUrl: '...', title: 'Task 1' }],
          failed: [{ index: 1, title: 'Task 2', error: 'API rate limit exceeded' }],
        },
        [
          { title: 'Task 1', body: '', labels: [], priority: 'high', dependencies: [] },
          { title: 'Task 2', body: '', labels: [], priority: 'medium', dependencies: [] },
        ],
      );

      expect(comment).toContain('#401 - Task 1');
      expect(comment).toContain('⚠️ 作成失敗');
      expect(comment).toContain('Task 2');
    });
  });

  describe('calculateDefaultMetrics', () => {
    it('具体性の高いIssueはスコアが高い (TC-UNIT-S042)', () => {
      // 意図: 具体性の高い本文でスコアが上がることを確認する
      const metrics = calculateDefaultMetrics([
        {
          title: 'Issue 1',
          body:
            '## 概要\n本文内容\n## 対象ファイル\nsrc/commands/split-issue.ts\n```typescript\nconst x = 1;\n```\n- [ ] アクション1\n- [ ] アクション2',
          labels: ['enhancement'],
          priority: 'high',
          dependencies: [],
        },
      ]);

      expect(metrics.completenessScore).toBeGreaterThanOrEqual(50);
      expect(metrics.specificityScore).toBeGreaterThanOrEqual(50);
    });

    it('最小限の本文では具体性スコアが低い (TC-UNIT-S043)', () => {
      // 意図: 最小限の本文でスコアが低くなることを確認する
      const metrics = calculateDefaultMetrics([
        {
          title: 'Issue 1',
          body: '簡単な説明',
          labels: [],
          priority: '',
          dependencies: [],
        },
      ]);

      expect(metrics.specificityScore).toBeLessThanOrEqual(50);
    });
  });

  describe('handleSplitIssueCommand', () => {
    it('デフォルトdry-runフローでプレビューのみ表示される (TC-UNIT-S044)', async () => {
      // 意図: dry-run時にGitHub更新が行われないことを確認する
      await handleSplitIssueCommand({ issue: '123' });

      expect(mockGetIssueInfo).toHaveBeenCalledWith(123);
      expect(mockCreateMultipleIssues).not.toHaveBeenCalled();
      expect(mockPostComment).not.toHaveBeenCalled();
      expect(mockLoggerInfo).toHaveBeenCalledWith('  SPLIT-ISSUE PREVIEW (dry-run)');
    });

    it('apply指定でIssue作成とコメント投稿が行われる (TC-UNIT-S045)', async () => {
      // 意図: apply時にIssue作成とコメント投稿が行われることを確認する
      mockCreateMultipleIssues.mockResolvedValueOnce({
        success: true,
        created: [
          { issueNumber: 201, issueUrl: 'https://github.com/owner/repo/issues/201', title: 'Issue 1' },
          { issueNumber: 202, issueUrl: 'https://github.com/owner/repo/issues/202', title: 'Issue 2' },
        ],
        failed: [],
      });
      mockClaudeExecute.mockResolvedValueOnce([
        '{"summary":"概要","issues":[{"title":"Issue 1","body":"Body 1","labels":["bug"],"priority":"high","dependencies":[]},{"title":"Issue 2","body":"Body 2","labels":["enhancement"],"priority":"medium","dependencies":[0]}]}',
      ]);

      await handleSplitIssueCommand({ issue: '123', apply: true });

      expect(mockCreateMultipleIssues).toHaveBeenCalledTimes(1);
      expect(mockCreateMultipleIssues.mock.calls[0][0]).toEqual([
        { title: 'Issue 1', body: 'Body 1', labels: ['bug'] },
        { title: 'Issue 2', body: 'Body 2', labels: ['enhancement'] },
      ]);
      expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#201'));
      expect(mockPostComment).toHaveBeenCalledWith(123, expect.stringContaining('#202'));
    });

    it('GITHUB_REPOSITORY未設定でエラー (TC-UNIT-S046)', async () => {
      // 意図: 必須環境変数未設定時のエラーを確認する
      mockGetGitHubRepository.mockReturnValueOnce(undefined);
      await expect(handleSplitIssueCommand({ issue: '123' })).rejects.toThrow(
        'GITHUB_REPOSITORY environment variable is required.',
      );
    });

    it('Issue取得失敗時にエラー (TC-UNIT-S047)', async () => {
      // 意図: Issue取得失敗時の例外を確認する
      mockGetIssueInfo.mockRejectedValueOnce(new Error('Not Found'));
      await expect(handleSplitIssueCommand({ issue: '99999' })).rejects.toThrow('Not Found');
    });

    it('Claude失敗時にCodexへフォールバックする (TC-UNIT-S048)', async () => {
      // 意図: フォールバック動作を確認する
      mockClaudeExecute.mockRejectedValueOnce(new Error('claude down'));
      mockCodexExecute.mockResolvedValueOnce([
        '{"summary":"概要","issues":[{"title":"Fallback","body":"Body","labels":[],"priority":"high","dependencies":[]}]}',
      ]);

      await handleSplitIssueCommand({ issue: '123', agent: 'auto' });

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
      expect(mockCodexExecute).toHaveBeenCalledTimes(1);
    });

    it('全エージェント失敗時にエラー (TC-UNIT-S049)', async () => {
      // 意図: 全エージェント失敗時の例外を確認する
      mockClaudeExecute.mockRejectedValueOnce(new Error('fail'));
      mockCodexExecute.mockRejectedValueOnce(new Error('fail'));

      await expect(handleSplitIssueCommand({ issue: '123', agent: 'auto' })).rejects.toThrow(
        'All agents failed',
      );
    });

    it('コメント投稿失敗でも処理は継続する (TC-UNIT-S050)', async () => {
      // 意図: コメント投稿失敗時に警告ログが出ることを確認する
      mockCreateMultipleIssues.mockResolvedValueOnce({
        success: true,
        created: [{ issueNumber: 201, issueUrl: 'https://github.com/owner/repo/issues/201', title: 'Issue 1' }],
        failed: [],
      });
      mockPostComment.mockRejectedValueOnce(new Error('comment failed'));

      await handleSplitIssueCommand({ issue: '123', apply: true });

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to post comment on issue #123'),
      );
    });

    it('リポジトリコンテキスト取得失敗でも継続する (TC-UNIT-S051)', async () => {
      // 意図: repository context取得失敗時のフォールバックを確認する
      const readdirSpy = jest.spyOn(fs, 'readdirSync').mockImplementationOnce(() => {
        throw new Error('read fail');
      });

      await handleSplitIssueCommand({ issue: '123' });

      expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to get repository context'));
      readdirSpy.mockRestore();
    });
  });
});
