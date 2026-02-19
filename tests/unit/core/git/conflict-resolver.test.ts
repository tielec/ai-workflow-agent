import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import type { MergeContext, ConflictResolutionPlan, ConflictResolution } from '../../../../src/types/conflict.js';

const loadPromptMock = jest.fn();
const setupAgentMock = jest.fn();

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

  ({ ConflictResolver } = await import('../../../../src/core/git/conflict-resolver.js'));
});

describe('ConflictResolver', () => {
  const repoRoot = '/repo';

  beforeEach(() => {
    jest.clearAllMocks();
    loadPromptMock.mockReturnValue('PROMPT {merge_context_json} {output_file_path}');
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
      await expect(
        resolver.createResolutionPlan(context, {
          agent: 'auto',
          language: 'ja',
          prNumber: 1,
          baseBranch: 'main',
          headBranch: 'feature',
          outputFilePath: '/tmp/plan.json',
        }),
      ).rejects.toThrow('Failed to extract JSON');
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
});
