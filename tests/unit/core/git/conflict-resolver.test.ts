import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { MergeContext, ConflictResolutionPlan, ConflictResolution } from '../../../../src/types/conflict.js';

const loadPromptMock = jest.fn();
const setupAgentMock = jest.fn();
const mkdirSyncMock = jest.fn();
const writeFileSyncMock = jest.fn();
const existsSyncMock = jest.fn();
const readFileSyncMock = jest.fn();
const formatAgentLogMock = jest.fn().mockReturnValue('# Formatted Log');

let ConflictResolver: typeof import('../../../../src/core/git/conflict-resolver.js').ConflictResolver;

beforeAll(async () => {
  await jest.unstable_mockModule('../../../../src/core/prompt-loader.js', () => ({
    __esModule: true,
    PromptLoader: {
      loadPrompt: loadPromptMock,
    },
  }));

  await jest.unstable_mockModule('../../../../src/commands/pr-comment/analyze/agent-utils.js', () => ({
    __esModule: true,
    setupAgent: setupAgentMock,
  }));

  await jest.unstable_mockModule('node:fs', () => ({
    __esModule: true,
    default: {
      mkdirSync: mkdirSyncMock,
      writeFileSync: writeFileSyncMock,
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
    },
  }));

  await jest.unstable_mockModule('../../../../src/phases/formatters/log-formatter.js', () => ({
    __esModule: true,
    LogFormatter: class {
      formatAgentLog = formatAgentLogMock;
    },
  }));

  ({ ConflictResolver } = await import('../../../../src/core/git/conflict-resolver.js'));
});

describe('ConflictResolver', () => {
  const repoRoot = '/repo';

  beforeEach(() => {
    jest.clearAllMocks();
    loadPromptMock.mockReturnValue('PROMPT {conflict_file_list} {conflict_file_count} {merge_context_file_path} {output_file_path}');
    formatAgentLogMock.mockReturnValue('# Formatted Log');
    existsSyncMock.mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createResolutionPlan', () => {
    it('正常系_解消計画が生成される', async () => {
      // Given: 正常なエージェント出力
      const agent = {
        executeTask: jest.fn().mockResolvedValue([
          '解析結果: ',
          JSON.stringify({
            resolutions: [
              {
                filePath: 'src/a.ts',
                strategy: 'ours',
                resolvedContent: 'const a = 1;',
              },
            ],
            skippedFiles: [],
            warnings: [],
          }),
        ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [{ hash: 'abc', message: 'fix', date: '2024-01-01' }],
        theirsLog: [{ hash: 'def', message: 'feat', date: '2024-01-01' }],
        prDescription: 'Add new feature',
        relatedIssues: ['#42'],
        contextSnippets: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 10, content: '...' },
        ],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: 解消計画生成
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then: 期待する計画が返る
      expect(plan.prNumber).toBe(42);
      expect(plan.baseBranch).toBe('main');
      expect(plan.headBranch).toBe('feature');
      expect(plan.resolutions).toHaveLength(1);
      expect(plan.resolutions[0].strategy).toBe('ours');
    });

    it('機密ファイルのスキップ_skippedFilesに含まれる', async () => {
      // Given: 機密ファイルが含まれる
      setupAgentMock.mockResolvedValue(null);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: '.env', startLine: 1, endLine: 2, oursContent: 'A', theirsContent: 'B' },
          { filePath: 'src/app.ts', startLine: 3, endLine: 5, oursContent: 'X', theirsContent: 'Y' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: 解消計画生成
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then: .env がスキップされる
      expect(plan.skippedFiles).toContain('.env');
      expect(plan.resolutions).toHaveLength(1);
      expect(plan.resolutions[0].filePath).toBe('src/app.ts');
      expect(plan.warnings.some((warning) => warning.includes('.env'))).toBe(true);
    });

    it('エージェント出力が空_エラーがスローされる', async () => {
      // Given: エージェントが空出力
      const agent = {
        executeTask: jest.fn().mockResolvedValue([]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 2, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When / Then: JSON抽出失敗でエラー
      const error = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      }).catch((err) => err as Error);

      expect(error.message).toContain('Failed to extract JSON');
      expect(error.message).toContain('after retry');
      expect(agent.executeTask).toHaveBeenCalledTimes(2);
    });

    it('一部ファイル不足_リトライで補完_正常完了', async () => {
      // Given: 初回は一部ファイルのみ、リトライで不足分を補完
      const agent = {
        executeTask: jest
          .fn()
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                {
                  filePath: 'src/a.ts',
                  strategy: 'ours',
                  resolvedContent: 'content A',
                },
              ],
              skippedFiles: [],
              warnings: [],
            }),
          ])
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                {
                  filePath: 'src/b.ts',
                  strategy: 'theirs',
                  resolvedContent: 'content B',
                },
              ],
              skippedFiles: [],
              warnings: [],
            }),
          ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
          { filePath: 'src/b.ts', startLine: 1, endLine: 3, oursContent: 'C', theirsContent: 'D' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then
      expect(agent.executeTask).toHaveBeenCalledTimes(2);
      expect(plan.resolutions).toHaveLength(2);
      const resolvedPaths = plan.resolutions.map((resolution) => resolution.filePath);
      expect(resolvedPaths).toContain('src/a.ts');
      expect(resolvedPaths).toContain('src/b.ts');
    });

    it('リトライ後も不足_afterRetryエラーがスローされる', async () => {
      // Given: 初回は一部のみ、リトライは空
      const agent = {
        executeTask: jest
          .fn()
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                {
                  filePath: 'src/a.ts',
                  strategy: 'ours',
                  resolvedContent: 'A',
                },
              ],
            }),
          ])
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [],
            }),
          ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
          { filePath: 'src/b.ts', startLine: 1, endLine: 3, oursContent: 'C', theirsContent: 'D' },
          { filePath: 'CHANGELOG.md', startLine: 1, endLine: 3, oursContent: 'E', theirsContent: 'F' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When / Then
      await expect(
        resolver.createResolutionPlan(context, {
          agent: 'auto',
          language: 'ja',
          prNumber: 1,
          baseBranch: 'main',
          headBranch: 'feature',
          outputFilePath: '/tmp/plan.json',
        }),
      ).rejects.toThrow('after retry');
      expect(agent.executeTask).toHaveBeenCalledTimes(2);
    });

    it('全ファイル返却時_リトライが発生しない', async () => {
      // Given: 初回で全ファイル返却
      const agent = {
        executeTask: jest.fn().mockResolvedValue([
          JSON.stringify({
            resolutions: [
              { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'A' },
              { filePath: 'src/b.ts', strategy: 'theirs', resolvedContent: 'B' },
            ],
            skippedFiles: [],
            warnings: [],
          }),
        ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
          { filePath: 'src/b.ts', startLine: 1, endLine: 3, oursContent: 'C', theirsContent: 'D' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then
      expect(agent.executeTask).toHaveBeenCalledTimes(1);
      expect(plan.resolutions).toHaveLength(2);
    });

    it('初回JSON抽出失敗_リトライで成功', async () => {
      // Given: 初回は非JSON、リトライで成功
      const agent = {
        executeTask: jest
          .fn()
          .mockResolvedValueOnce(['This is not JSON output'])
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'A' },
              ],
              skippedFiles: [],
              warnings: [],
            }),
          ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then
      expect(agent.executeTask).toHaveBeenCalledTimes(2);
      expect(plan.resolutions).toHaveLength(1);
      expect(plan.resolutions[0].filePath).toBe('src/a.ts');
    });

    it('初回リトライ両方JSON抽出失敗_afterRetryエラー', async () => {
      // Given: 初回・リトライともに非JSON
      const agent = {
        executeTask: jest
          .fn()
          .mockResolvedValueOnce(['Not JSON'])
          .mockResolvedValueOnce(['Still not JSON']),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When / Then
      await expect(
        resolver.createResolutionPlan(context, {
          agent: 'auto',
          language: 'ja',
          prNumber: 1,
          baseBranch: 'main',
          headBranch: 'feature',
          outputFilePath: '/tmp/plan.json',
        }),
      ).rejects.toThrow('after retry');
      expect(agent.executeTask).toHaveBeenCalledTimes(2);
    });

    it('プロンプトにファイル一覧とファイル数が含まれる', async () => {
      // Given: テンプレートにプレースホルダーを含む
      loadPromptMock.mockReturnValue(
        'FILES: {conflict_file_list} COUNT: {conflict_file_count} CTX: {merge_context_file_path} OUT: {output_file_path}',
      );

      const agent = {
        executeTask: jest.fn().mockResolvedValue([
          JSON.stringify({
            resolutions: [
              { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'A' },
              { filePath: 'src/b.ts', strategy: 'theirs', resolvedContent: 'B' },
              { filePath: 'CHANGELOG.md', strategy: 'both', resolvedContent: 'C' },
            ],
            skippedFiles: [],
            warnings: [],
          }),
        ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
          { filePath: 'src/b.ts', startLine: 1, endLine: 3, oursContent: 'C', theirsContent: 'D' },
          { filePath: 'CHANGELOG.md', startLine: 1, endLine: 5, oursContent: 'E', theirsContent: 'F' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then
      const prompt = agent.executeTask.mock.calls[0][0].prompt as string;
      expect(prompt).toContain('1. src/a.ts');
      expect(prompt).toContain('2. src/b.ts');
      expect(prompt).toContain('3. CHANGELOG.md');
      expect(prompt).toContain('COUNT: 3');
    });

    it('同一ファイルの複数ConflictBlock_ファイル一覧が重複しない', async () => {
      // Given: 同一ファイルの複数ブロック
      loadPromptMock.mockReturnValue(
        'FILES: {conflict_file_list} COUNT: {conflict_file_count} CTX: {merge_context_file_path} OUT: {output_file_path}',
      );

      const agent = {
        executeTask: jest.fn().mockResolvedValue([
          JSON.stringify({
            resolutions: [
              { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'A' },
              { filePath: 'src/b.ts', strategy: 'theirs', resolvedContent: 'B' },
            ],
            skippedFiles: [],
            warnings: [],
          }),
        ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A1', theirsContent: 'B1' },
          { filePath: 'src/a.ts', startLine: 10, endLine: 15, oursContent: 'A2', theirsContent: 'B2' },
          { filePath: 'src/b.ts', startLine: 1, endLine: 3, oursContent: 'C', theirsContent: 'D' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then
      const prompt = agent.executeTask.mock.calls[0][0].prompt as string;
      expect(prompt).toContain('1. src/a.ts');
      expect(prompt).toContain('2. src/b.ts');
      expect(prompt).not.toContain('3. src/a.ts');
      expect(prompt).toContain('COUNT: 2');
    });

    it('ファイル出力が存在する場合_ファイルから読まれる', async () => {
      // Given: エージェントがファイルに出力
      const fileContent = JSON.stringify({
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'from file' },
        ],
        skippedFiles: [],
        warnings: [],
      });
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(fileContent);

      const agent = {
        executeTask: jest.fn().mockResolvedValue(['stdout garbage']),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then: ファイルから読まれた内容が使われる
      expect(plan.resolutions).toHaveLength(1);
      expect(plan.resolutions[0].resolvedContent).toBe('from file');
      expect(existsSyncMock).toHaveBeenCalled();
      expect(readFileSyncMock).toHaveBeenCalled();
    });

    it('コンテキストJSONがファイルに書き出される', async () => {
      // Given: logDir を指定
      const agent = {
        executeTask: jest.fn().mockResolvedValue([
          JSON.stringify({
            resolutions: [
              { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'A' },
            ],
            skippedFiles: [],
            warnings: [],
          }),
        ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [{ hash: 'abc', message: 'fix', date: '2024-01-01' }],
        theirsLog: [],
        prDescription: 'test PR',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
        logDir: '/tmp/logs',
      });

      // Then: コンテキストファイルが書き出され、プロンプトにパスが含まれる
      const writeCalls = writeFileSyncMock.mock.calls;
      const contextCall = writeCalls.find((call: unknown[]) => (call[0] as string).includes('merge-context.json'));
      expect(contextCall).toBeDefined();
      const writtenJson = JSON.parse(contextCall![1] as string);
      expect(writtenJson.conflictFiles).toHaveLength(1);
      expect(writtenJson.conflictFiles[0].filePath).toBe('src/a.ts');

      const prompt = agent.executeTask.mock.calls[0][0].prompt as string;
      expect(prompt).toContain('merge-context.json');
    });

    it('ファイル出力が存在しない場合_stdoutフォールバック', async () => {
      // Given: ファイルが存在しない
      existsSyncMock.mockReturnValue(false);

      const agent = {
        executeTask: jest.fn().mockResolvedValue([
          JSON.stringify({
            resolutions: [
              { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'from stdout' },
            ],
            skippedFiles: [],
            warnings: [],
          }),
        ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then: stdout フォールバックが使われる
      expect(plan.resolutions).toHaveLength(1);
      expect(plan.resolutions[0].resolvedContent).toBe('from stdout');
      expect(readFileSyncMock).not.toHaveBeenCalled();
    });

    it('JSONリトライ後_不足ファイル再試行が行われる', async () => {
      // Given: 初回はJSON抽出失敗、リトライで一部解消、さらに不足ファイルを再試行
      const agent = {
        executeTask: jest
          .fn()
          .mockResolvedValueOnce(['no json output'])
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                {
                  filePath: 'src/a.ts',
                  strategy: 'ours',
                  resolvedContent: 'A',
                },
              ],
              skippedFiles: [],
              warnings: [],
            }),
          ])
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                {
                  filePath: 'src/b.ts',
                  strategy: 'theirs',
                  resolvedContent: 'B',
                },
              ],
              skippedFiles: [],
              warnings: [],
            }),
          ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 2, oursContent: 'A', theirsContent: 'B' },
          { filePath: 'src/b.ts', startLine: 1, endLine: 2, oursContent: 'C', theirsContent: 'D' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: 解消計画生成
      const plan = await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then: 3回呼び出しされ、全ファイルが解消される
      expect(agent.executeTask).toHaveBeenCalledTimes(3);
      const resolvedPaths = plan.resolutions.map((resolution) => resolution.filePath);
      expect(resolvedPaths).toContain('src/a.ts');
      expect(resolvedPaths).toContain('src/b.ts');
      expect(plan.resolutions).toHaveLength(2);
    });
  });

  describe('resolve', () => {
    it('manual-merge戦略_AIが生成したコードが使用される', async () => {
      // Given: manual-mergeでresolvedContentが空
      const agent = {
        executeTask: jest.fn().mockResolvedValue(['resolved by agent']),
      };
      setupAgentMock.mockResolvedValue(agent);

      const plan: ConflictResolutionPlan = {
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        generatedAt: '2024-01-01T00:00:00Z',
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'manual-merge', resolvedContent: '' },
        ],
        skippedFiles: [],
        warnings: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: resolve 実行
      const result = await resolver.resolve(plan, { agent: 'auto', language: 'ja' });

      // Then: AI出力が反映される
      expect(result[0].resolvedContent).toBe('resolved by agent');
      expect(agent.executeTask).toHaveBeenCalled();
    });

    it('manual-merge戦略_エージェント未設定_エラーがスローされる', async () => {
      // Given: エージェント無し
      setupAgentMock.mockResolvedValue(null);

      const plan: ConflictResolutionPlan = {
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        generatedAt: '2024-01-01T00:00:00Z',
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'manual-merge', resolvedContent: '' },
        ],
        skippedFiles: [],
        warnings: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When / Then
      await expect(resolver.resolve(plan, { agent: 'auto', language: 'ja' }))
        .rejects.toThrow('No agent available');
    });

    it('ours戦略_解消内容がそのまま使用される', async () => {
      // Given: ours戦略の解消計画
      setupAgentMock.mockResolvedValue(null);

      const plan: ConflictResolutionPlan = {
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        generatedAt: '2024-01-01T00:00:00Z',
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'OURS CONTENT' },
        ],
        skippedFiles: [],
        warnings: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: resolve 実行
      const result = await resolver.resolve(plan, { agent: 'auto', language: 'ja' });

      // Then: resolvedContent が維持される
      expect(result[0].resolvedContent).toBe('OURS CONTENT');
    });

    it('theirs戦略_解消内容がそのまま使用される', async () => {
      // Given: theirs戦略の解消計画
      setupAgentMock.mockResolvedValue(null);

      const plan: ConflictResolutionPlan = {
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        generatedAt: '2024-01-01T00:00:00Z',
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'theirs', resolvedContent: 'THEIRS CONTENT' },
        ],
        skippedFiles: [],
        warnings: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: resolve 実行
      const result = await resolver.resolve(plan, { agent: 'auto', language: 'ja' });

      // Then: resolvedContent が維持される
      expect(result[0].resolvedContent).toBe('THEIRS CONTENT');
    });

    it('both戦略_解消内容がある場合はエージェント不要', async () => {
      // Given: both戦略でresolvedContentが既に設定済み
      setupAgentMock.mockResolvedValue(null);

      const plan: ConflictResolutionPlan = {
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        generatedAt: '2024-01-01T00:00:00Z',
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'both', resolvedContent: 'OURS\nTHEIRS' },
        ],
        skippedFiles: [],
        warnings: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When: resolve 実行
      const result = await resolver.resolve(plan, { agent: 'auto', language: 'ja' });

      // Then: resolvedContent が維持される
      expect(result[0].resolvedContent).toBe('OURS\nTHEIRS');
    });
  });

  describe('validateResolution', () => {
    it('マーカー残存なし_検証成功', () => {
      // Given: マーカー無し
      const resolutions: ConflictResolution[] = [
        { filePath: 'src/a.ts', strategy: 'manual-merge', resolvedContent: 'const a = 1;\n' },
      ];

      const resolver = new ConflictResolver(repoRoot);

      // When / Then: 例外なし
      expect(() => resolver.validateResolution(resolutions)).not.toThrow();
    });

    it('マーカー残存あり_検証失敗', () => {
      // Given: マーカー残存
      const resolutions: ConflictResolution[] = [
        { filePath: 'src/a.ts', strategy: 'manual-merge', resolvedContent: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> branch\n' },
      ];

      const resolver = new ConflictResolver(repoRoot);

      // When / Then: エラー
      expect(() => resolver.validateResolution(resolutions))
        .toThrow('Conflict markers remain');
    });
  });

  describe('agent execution logging', () => {
    const logDir = '/tmp/conflict-logs';

    it('logDir指定時_ログファイルが保存される', async () => {
      // Given: logDir を指定してエージェントを実行
      const agentOutput = JSON.stringify({
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'const a = 1;' },
        ],
        skippedFiles: [],
        warnings: [],
      });
      const agent = {
        executeTask: jest.fn().mockResolvedValue([agentOutput]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot, 'ja');

      // When
      await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
        logDir,
      });

      // Then: コンテキストファイルとログファイルが保存される
      const writeCalls = writeFileSyncMock.mock.calls.map((call: unknown[]) => call[0] as string);
      expect(writeCalls.some((p: string) => p.includes('merge-context.json'))).toBe(true);
      expect(writeCalls.some((p: string) => p.includes('prompt.txt'))).toBe(true);
      expect(writeCalls.some((p: string) => p.includes('agent_log_raw.txt'))).toBe(true);
      expect(writeCalls.some((p: string) => p.includes('agent_log.md'))).toBe(true);

      // LogFormatter が呼ばれたことを検証
      expect(formatAgentLogMock).toHaveBeenCalledTimes(1);
    });

    it('logDir未指定時_ログファイルが保存されない', async () => {
      // Given: logDir を指定しない
      const agentOutput = JSON.stringify({
        resolutions: [
          { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'const a = 1;' },
        ],
        skippedFiles: [],
        warnings: [],
      });
      const agent = {
        executeTask: jest.fn().mockResolvedValue([agentOutput]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot);

      // When
      await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 42,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
      });

      // Then: コンテキストファイルは書き出されるが、ログファイルは保存されない
      const writeCalls = writeFileSyncMock.mock.calls.map((call: unknown[]) => call[0] as string);
      expect(writeCalls.some((p: string) => p.includes('merge-context.json'))).toBe(true);
      expect(writeCalls.some((p: string) => p.includes('prompt.txt'))).toBe(false);
      expect(writeCalls.some((p: string) => p.includes('agent_log'))).toBe(false);
      expect(formatAgentLogMock).not.toHaveBeenCalled();
    });

    it('JSONリトライ時_リトライ用ログも保存される', async () => {
      // Given: 初回JSON抽出失敗 → リトライで成功
      const agent = {
        executeTask: jest
          .fn()
          .mockResolvedValueOnce(['not json'])
          .mockResolvedValueOnce([
            JSON.stringify({
              resolutions: [
                { filePath: 'src/a.ts', strategy: 'ours', resolvedContent: 'A' },
              ],
              skippedFiles: [],
              warnings: [],
            }),
          ]),
      };
      setupAgentMock.mockResolvedValue(agent);

      const context: MergeContext = {
        conflictFiles: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 3, oursContent: 'A', theirsContent: 'B' },
        ],
        oursLog: [],
        theirsLog: [],
        prDescription: '',
        relatedIssues: [],
        contextSnippets: [],
      };

      const resolver = new ConflictResolver(repoRoot, 'ja');

      // When
      await resolver.createResolutionPlan(context, {
        agent: 'auto',
        language: 'ja',
        prNumber: 1,
        baseBranch: 'main',
        headBranch: 'feature',
        outputFilePath: '/tmp/plan.json',
        logDir,
      });

      // Then: analyze と analyze-retry-json の2つのログディレクトリが作成される
      const mkdirCalls = mkdirSyncMock.mock.calls.map((call: unknown[]) => call[0] as string);
      expect(mkdirCalls.some((p: string) => p.includes('analyze-retry-json'))).toBe(true);

      // 合計7ファイル（コンテキストファイル1 + 2回分 × 3ログファイル）
      expect(writeFileSyncMock).toHaveBeenCalledTimes(7);
    });
  });
});
