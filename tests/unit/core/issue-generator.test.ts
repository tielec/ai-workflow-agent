/**
 * ユニットテスト: IssueGenerator
 *
 * テスト対象: src/core/issue-generator.ts
 * テストシナリオ: test-scenario.md の TC-IG-001 〜 TC-IG-008
 */

import { IssueGenerator } from '../../../src/core/issue-generator.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import type {
  BugCandidate,
  EnhancementProposal,
  RefactorCandidate,
} from '../../../src/types/auto-issue.js';
import { jest } from '@jest/globals';
import { createMockOctokit } from '../../helpers/mock-octokit.js';

// モック設定
jest.mock('../../../src/core/codex-agent-client.js');
jest.mock('../../../src/core/claude-agent-client.js');
jest.mock('../../../src/utils/logger.js');

describe('IssueGenerator', () => {
  let mockCodexClient: jest.Mocked<CodexAgentClient>;
  let mockClaudeClient: jest.Mocked<ClaudeAgentClient>;
  let mockOctokit: ReturnType<typeof createMockOctokit>;
  let generator: IssueGenerator;

  const repositoryName = 'owner/repo';

  beforeEach(() => {
    // Codex クライアントのモック
    mockCodexClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<CodexAgentClient>;

    // Claude クライアントのモック
    mockClaudeClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAgentClient>;

    // Octokit のモック - jest.fn()を使用して型安全なモック作成
    mockOctokit = createMockOctokit();

    // IssueGenerator インスタンス作成
    generator = new IssueGenerator(
      mockCodexClient,
      mockClaudeClient,
      mockOctokit.client,
      repositoryName,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC-IG-001: generate_正常系_dry-runモード
   *
   * 目的: dry-runモードでIssue作成がスキップされることを検証
   */
  describe('TC-IG-001: generate with dry-run mode', () => {
    it('should skip issue creation in dry-run mode', async () => {
      // Given: dry-run = true
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest issue body\n```']);

      // When: generate() を dry-run モードで実行
      const result = await generator.generate(candidate, 'codex', true);

      // Then: Issue作成がスキップされる
      expect(result.success).toBe(true);
      expect(result.skippedReason).toBe('dry-run mode');
      expect(result.issueUrl).toBeUndefined();
      expect(mockOctokit.issues.create).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-IG-002: generate_正常系_Issue作成成功
   *
   * 目的: 本番モードでIssueが正常に作成されることを検証
   */
  describe('TC-IG-002: generate with successful issue creation', () => {
    it('should create issue successfully', async () => {
      // Given: 正常な実行環境
      const candidate: BugCandidate = {
        title: 'Fix memory leak',
        file: 'src/core/test.ts',
        line: 42,
        severity: 'high',
        description: 'Memory leak description',
        suggestedFix: 'Add cleanup',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue([
        '```markdown\n## 概要\nMemory leak in test module\n```'
      ]);

      mockOctokit.issues.create.mockResolvedValue({
        data: {
          number: 456,
          html_url: 'https://github.com/owner/repo/issues/456',
        },
      } as any);

      // When: generate() を実行
      const result = await generator.generate(candidate, 'codex', false);

      // Then: Issue作成成功
      expect(result.success).toBe(true);
      expect(result.issueUrl).toBe('https://github.com/owner/repo/issues/456');
      expect(result.issueNumber).toBe(456);
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-IG-003: generate_異常系_GitHub_API失敗
   *
   * 目的: GitHub API失敗時、エラーが適切に処理されることを検証
   */
  describe('TC-IG-003: generate with GitHub API failure', () => {
    it('should handle GitHub API failure gracefully', async () => {
      // Given: GitHub APIがエラーをスロー
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest\n```']);

      mockOctokit.issues.create.mockRejectedValue(new Error('API rate limit exceeded'));

      // When: generate() を実行
      const result = await generator.generate(candidate, 'codex', false);

      // Then: エラーが適切に処理される
      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
    });
  });

  /**
   * TC-IG-004: generate_正常系_Claudeエージェント使用
   *
   * 目的: Claudeエージェントを使用してIssue本文を生成できることを検証
   */
  describe('TC-IG-004: generate with Claude agent', () => {
    it('should generate issue body using Claude agent', async () => {
      // Given: Claude エージェント使用
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockClaudeClient.executeTask.mockResolvedValue([
        '```markdown\n## 概要\nClaude generated issue body\n```'
      ]);

      // When: generate() を Claude で実行
      const result = await generator.generate(candidate, 'claude', true);

      // Then: Claude が使用される
      expect(result.success).toBe(true);
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodexClient.executeTask).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-IG-005: generate_異常系_Codexエージェント失敗
   *
   * 目的: Codexエージェント失敗時、エラーが適切に処理されることを検証
   */
  describe('TC-IG-005: generate with Codex agent failure', () => {
    it('should handle Codex agent failure', async () => {
      // Given: Codex がエラーをスロー
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));

      // When: generate() を codex モードで実行
      const result = await generator.generate(candidate, 'codex', false);

      // Then: エラーが適切に処理される
      expect(result.success).toBe(false);
      expect(result.error).toContain('Codex API failed');
      expect(mockOctokit.issues.create).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-IG-006: createIssueBody_正常系_Markdownブロック抽出
   *
   * 目的: エージェント出力からMarkdownブロックを正しく抽出できることを検証
   */
  describe('TC-IG-006: createIssueBody extracts Markdown block', () => {
    it('should extract Markdown block from agent output', async () => {
      // Given: Markdownブロックを含む出力
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      const agentOutput = `
Here is the issue body:

\`\`\`markdown
## 概要
This is a test issue.

## 詳細
Detailed description here.
\`\`\`

Additional text.
`;

      mockCodexClient.executeTask.mockResolvedValue([agentOutput]);

      // When: generate() を dry-run で実行
      const result = await generator.generate(candidate, 'codex', true);

      // Then: Markdown が正しく抽出される
      expect(result.success).toBe(true);
    });
  });

  /**
   * TC-IG-007: createIssueBody_異常系_Markdownブロックなし
   *
   * 目的: Markdownブロックがない場合、エージェント出力をそのまま使用することを検証
   */
  describe('TC-IG-007: createIssueBody without Markdown block', () => {
    it('should use agent output as-is when no Markdown block', async () => {
      // Given: Markdownブロックなし
      const candidate: BugCandidate = {
        title: 'Test bug',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['Plain text output without markdown block']);

      // When: generate() を dry-run で実行
      const result = await generator.generate(candidate, 'codex', true);

      // Then: 出力がそのまま使用される
      expect(result.success).toBe(true);
    });
  });

  /**
   * TC-IG-008: createIssueOnGitHub_正常系_ラベル付与
   *
   * 目的: Issue作成時に正しいラベルが付与されることを検証
   */
  describe('TC-IG-008: createIssueOnGitHub with labels', () => {
    it('should create issue with correct labels', async () => {
      // Given: 正常な実行環境
      const candidate: BugCandidate = {
        title: 'Test issue',
        file: 'test.ts',
        line: 1,
        severity: 'high',
        description: 'Test description',
        suggestedFix: 'Test fix',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['## 概要\nTest body']);

      mockOctokit.issues.create.mockResolvedValue({
        data: {
          number: 789,
          html_url: 'https://github.com/owner/repo/issues/789',
        },
      } as any);

      // When: generate() を実行
      await generator.generate(candidate, 'codex', false);

      // Then: 正しいラベルで Issue が作成される
      expect(mockOctokit.issues.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          title: 'Test issue',
          labels: ['auto-generated', 'bug'],
        })
      );
    });
  });

  /**
   * Phase 3: Enhancement proposal 機能のテスト
   * テストシナリオ: test-scenario.md のセクション2（ユニットテスト）- Enhancement関連
   */

  /**
   * TC-5.1.1: generateEnhancementIssue_正常系_dry-runモード
   *
   * 目的: dry-runモードでenhancement Issue作成がスキップされることを検証
   */
  describe('TC-5.1.1: generateEnhancementIssue with dry-run mode', () => {
    it('should skip enhancement issue creation in dry-run mode', async () => {
      // Given: dry-run = true
      const proposal = {
        type: 'improvement' as const,
        title: 'CLI UI の改善 - プログレスバーとカラフルな出力を追加する',
        description: 'CLI実行時にプログレスバーとカラフルな出力を追加することで、ユーザー体験を向上させる機能。',
        rationale: '長時間のタスク実行時にユーザーがフリーズしているのか判断できない問題を解決する。',
        implementation_hints: ['ora ライブラリを使用してスピナーを追加'],
        expected_impact: 'high' as const,
        effort_estimate: 'small' as const,
        related_files: ['src/commands/auto-issue.ts'],
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest issue body\n```']);

      // When: generateEnhancementIssue() を dry-run モードで実行
      const result = await generator.generateEnhancementIssue(proposal, 'codex', true);

      // Then: Issue作成がスキップされる
      expect(result.success).toBe(true);
      expect(result.skippedReason).toBe('dry-run mode');
      expect(result.issueUrl).toBeUndefined();
      expect(mockOctokit.issues.create).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-5.1.2: generateEnhancementIssue_正常系_Issue作成成功
   *
   * 目的: 本番モードでenhancement Issueが正常に作成されることを検証
   */
  describe('TC-5.1.2: generateEnhancementIssue with successful issue creation', () => {
    it('should create enhancement issue successfully', async () => {
      // Given: 正常な実行環境
      const proposal = {
        type: 'integration' as const,
        title: 'Slack 通知機能の追加 - ワークフロー完了時の自動通知を実装する機能',
        description: 'AI Workflow Agent のワークフロー完了時に Slack チャンネルへ自動通知を送信する機能。',
        rationale: 'チームメンバーがワークフロー完了をリアルタイムで把握できる。',
        implementation_hints: ['Slack Incoming Webhook を使用'],
        expected_impact: 'medium' as const,
        effort_estimate: 'small' as const,
        related_files: ['src/phases/evaluation.ts'],
      };

      mockCodexClient.executeTask.mockResolvedValue([
        '```markdown\n## 概要\nSlack integration\n```',
      ]);

      mockOctokit.issues.create.mockResolvedValue({
        data: {
          number: 100,
          html_url: 'https://github.com/owner/repo/issues/100',
        },
      } as any);

      // When: generateEnhancementIssue() を実行
      const result = await generator.generateEnhancementIssue(proposal, 'codex', false);

      // Then: Issue作成成功
      expect(result.success).toBe(true);
      expect(result.issueUrl).toBe('https://github.com/owner/repo/issues/100');
      expect(result.issueNumber).toBe(100);
      expect(mockOctokit.issues.create).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * TC-5.1.3: generateEnhancementIssue_正常系_Claudeエージェント使用
   *
   * 目的: Claudeエージェントを使用してenhancement Issue本文を生成できることを検証
   */
  describe('TC-5.1.3: generateEnhancementIssue with Claude agent', () => {
    it('should generate enhancement issue body using Claude agent', async () => {
      // Given: Claude エージェント使用
      const proposal = {
        type: 'automation' as const,
        title: '自動テスト生成機能の追加 - 既存コードから単体テストを自動生成する機能',
        description: '既存コードを解析して単体テストのスケルトンを自動生成する機能。',
        rationale: 'テスト作成の手間を削減し、開発速度を向上させる。',
        implementation_hints: ['AST解析でコード構造を把握'],
        expected_impact: 'medium' as const,
        effort_estimate: 'medium' as const,
        related_files: ['src/core/test-generator.ts'],
      };

      mockClaudeClient.executeTask.mockResolvedValue([
        '```markdown\n## 概要\nClaude generated enhancement issue\n```',
      ]);

      // When: generateEnhancementIssue() を Claude で実行
      const result = await generator.generateEnhancementIssue(proposal, 'claude', true);

      // Then: Claude が使用される
      expect(result.success).toBe(true);
      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      expect(mockCodexClient.executeTask).not.toHaveBeenCalled();
    });
  });

  /**
   * TC-5.1.4: generateEnhancementIssue_異常系_GitHub_API失敗
   *
   * 目的: GitHub API失敗時、エラーが適切に処理されることを検証
   */
  describe('TC-5.1.4: generateEnhancementIssue with GitHub API failure', () => {
    it('should handle GitHub API failure gracefully', async () => {
      // Given: GitHub APIがエラーをスロー
      const proposal = {
        type: 'dx' as const,
        title: '対話的セットアップウィザードの実装 - 初回実行時の環境設定を簡易化する機能',
        description: '初回実行時に対話的セットアップウィザードを表示し、環境変数の設定を GUI で完了できる機能。',
        rationale: '新規ユーザーがドキュメントを読まずに即座に利用開始できる。',
        implementation_hints: ['inquirer.js ライブラリを使用'],
        expected_impact: 'high' as const,
        effort_estimate: 'medium' as const,
        related_files: ['src/commands/init.ts'],
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest\n```']);

      mockOctokit.issues.create.mockRejectedValue(new Error('API rate limit exceeded'));

      // When: generateEnhancementIssue() を実行
      const result = await generator.generateEnhancementIssue(proposal, 'codex', false);

      // Then: エラーが適切に処理される
      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
    });
  });

  /**
   * TC-5.2.1: generateEnhancementTitle_正常系_タイプ別絵文字
   *
   * 目的: enhancement タイプごとに正しい絵文字プレフィックスが付与されることを検証
   */
  describe('TC-5.2.1: generateEnhancementTitle with type-specific emojis', () => {
    it('should add correct emoji for improvement type', () => {
      // Given: improvement タイプの提案
      const proposal = {
        type: 'improvement' as const,
        title: 'CLI UI の改善 - プログレスバーとカラフルな出力を追加する',
        description: 'test description with minimum 100 characters required for validation to pass correctly',
        rationale: 'test rationale with minimum 50 characters required',
        implementation_hints: ['hint'],
        expected_impact: 'high' as const,
        effort_estimate: 'small' as const,
        related_files: ['src/test.ts'],
      };

      // When: タイトルを生成
      const title = (generator as any).generateEnhancementTitle(proposal);

      // Then: ⚡ 絵文字が付与される
      expect(title).toBe('⚡ CLI UI の改善 - プログレスバーとカラフルな出力を追加する');
    });

    it('should add correct emoji for all enhancement types', () => {
      const types = [
        { type: 'improvement', emoji: '⚡' },
        { type: 'integration', emoji: '🔗' },
        { type: 'automation', emoji: '🤖' },
        { type: 'dx', emoji: '✨' },
        { type: 'quality', emoji: '🛡️' },
        { type: 'ecosystem', emoji: '🌐' },
      ];

      types.forEach(({ type, emoji }) => {
        const proposal = {
          type: type as any,
          title: `Test ${type} title`,
          description: 'test description with minimum 100 characters required for validation to pass correctly',
          rationale: 'test rationale with minimum 50 characters required',
          implementation_hints: ['hint'],
          expected_impact: 'high' as const,
          effort_estimate: 'small' as const,
          related_files: ['src/test.ts'],
        };

        const title = (generator as any).generateEnhancementTitle(proposal);
        expect(title).toBe(`${emoji} Test ${type} title`);
      });
    });
  });

  /**
   * TC-5.2.2: generateEnhancementLabels_正常系_ラベル生成
   *
   * 目的: enhancement提案から正しいラベルが生成されることを検証
   */
  describe('TC-5.2.2: generateEnhancementLabels with correct labels', () => {
    it('should generate labels with impact and effort', () => {
      // Given: high impact, small effort の提案
      const proposal = {
        type: 'improvement' as const,
        title: 'Test title with minimum required length of 50 characters',
        description: 'test description with minimum 100 characters required for validation to pass correctly',
        rationale: 'test rationale with minimum 50 characters required',
        implementation_hints: ['hint'],
        expected_impact: 'high' as const,
        effort_estimate: 'small' as const,
        related_files: ['src/test.ts'],
      };

      // When: ラベルを生成
      const labels = (generator as any).generateEnhancementLabels(proposal);

      // Then: 正しいラベルが生成される
      expect(labels).toContain('auto-generated');
      expect(labels).toContain('enhancement');
      expect(labels).toContain('type:improvement');
      expect(labels).toContain('impact:high');
      expect(labels).toContain('effort:small');
    });

    it('should generate labels for all impact and effort combinations', () => {
      const combinations = [
        { impact: 'high', effort: 'small' },
        { impact: 'medium', effort: 'medium' },
        { impact: 'low', effort: 'large' },
      ];

      combinations.forEach(({ impact, effort }) => {
        const proposal = {
          type: 'integration' as const,
          title: 'Test title with minimum required length of 50 characters',
          description: 'test description with minimum 100 characters required for validation to pass correctly',
          rationale: 'test rationale with minimum 50 characters required',
          implementation_hints: ['hint'],
          expected_impact: impact as any,
          effort_estimate: effort as any,
          related_files: ['src/test.ts'],
        };

        const labels = (generator as any).generateEnhancementLabels(proposal);
        expect(labels).toContain(`impact:${impact}`);
        expect(labels).toContain(`effort:${effort}`);
      });
    });
  });

  /**
   * TC-5.3.1: createEnhancementIssueOnGitHub_正常系_完全なラベルセット
   *
   * 目的: enhancement Issue作成時に全てのラベルが付与されることを検証
   */
  describe('TC-5.3.1: createEnhancementIssueOnGitHub with complete label set', () => {
    it('should create issue with all required labels', async () => {
      // Given: 正常な実行環境
      const proposal = {
        type: 'quality' as const,
        title: 'セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する機能',
        description: 'npm audit や Snyk を統合し、依存関係の脆弱性を自動検出する機能。セキュリティを向上させる。',
        rationale: 'セキュリティリスクを早期発見し、脆弱性のある依存関係の使用を防止できる。',
        implementation_hints: ['npm audit コマンドを実行', 'Snyk API を統合'],
        expected_impact: 'high' as const,
        effort_estimate: 'small' as const,
        related_files: ['src/commands/auto-issue.ts'],
      };

      mockCodexClient.executeTask.mockResolvedValue(['## 概要\nSecurity enhancement']);

      mockOctokit.issues.create.mockResolvedValue({
        data: {
          number: 200,
          html_url: 'https://github.com/owner/repo/issues/200',
        },
      } as any);

      // When: generateEnhancementIssue() を実行
      await generator.generateEnhancementIssue(proposal, 'codex', false);

      // Then: 正しいラベルで Issue が作成される
      expect(mockOctokit.issues.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'owner',
          repo: 'repo',
          title: '🛡️ セキュリティスキャンの追加 - 依存関係の脆弱性チェックを統合する機能',
          labels: expect.arrayContaining([
            'auto-generated',
            'enhancement',
            'type:quality',
            'impact:high',
            'effort:small',
          ]),
        }),
      );
    });
  });

  /**
   * TC-5.3.2: createEnhancementFallbackBody_正常系_フォールバック本文生成
   *
   * 目的: エージェント失敗時にフォールバック本文が生成されることを検証
   */
  describe('TC-5.3.2: createEnhancementFallbackBody generates fallback content', () => {
    it('should generate markdown fallback body when agent fails', async () => {
      // Given: Codex がエラーをスロー
      const proposal = {
        type: 'ecosystem' as const,
        title: 'プラグインシステムの実装 - カスタムフェーズを追加できる拡張機構を実装する',
        description: 'ユーザーが独自のフェーズを定義できるプラグインシステムを実装する機能。拡張性を向上する。',
        rationale: 'プロダクトの拡張性を大幅に向上させ、コミュニティ主導の成長を促進する。',
        implementation_hints: ['プラグインローダーを実装', 'フェーズインターフェースを定義'],
        expected_impact: 'high' as const,
        effort_estimate: 'large' as const,
        related_files: ['src/core/plugin-loader.ts'],
      };

      mockCodexClient.executeTask.mockRejectedValue(new Error('Agent failed'));

      // When: generateEnhancementIssue() を実行（dry-runで確認）
      const result = await generator.generateEnhancementIssue(proposal, 'codex', true);

      // Then: フォールバック本文が使用される（エラーでも成功としてスキップされる）
      expect(result.success).toBe(true);
    });
  });

  /**
   * Issue #257: JSONエクスポート向けのタイトル伝播を保証
   *
   * 目的: dry-run やスキップ時でも IssueCreationResult.title が常に埋まることを確認し、
   *       JSON 出力にタイトルが含まれるようにする。
   */
  describe('Issue #257: IssueCreationResult title propagation', () => {
    it('should keep bug candidate title when dry-run skips creation', async () => {
      const candidate: BugCandidate = {
        title: 'Ensure JSON output contains candidate title',
        file: 'src/commands/auto-issue.ts',
        line: 120,
        severity: 'high',
        description:
          'Bug description with enough detail to satisfy validation and reproduce the failure scenario.',
        suggestedFix: 'Add guards before writing files.',
        category: 'bug',
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nTest body\n```']);

      const result = await generator.generate(candidate, 'codex', true);

      expect(result.skippedReason).toBe('dry-run mode');
      expect(result.title).toBe(candidate.title);
    });

    it('should populate refactor issue title even when dry-run is enabled', async () => {
      const candidate: RefactorCandidate = {
        type: 'large-file',
        filePath: 'src/services/legacy-worker.ts',
        description: 'File exceeds 500 lines and is difficult to navigate.',
        suggestion: 'Split the worker into smaller modules grouped by responsibility.',
        priority: 'high',
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nRefactor body\n```']);

      const result = await generator.generateRefactorIssue(candidate, 'codex', true);

      expect(result.skippedReason).toBe('dry-run mode');
      expect(result.title).toBe('[Refactor] ファイルサイズの削減: legacy-worker.ts');
    });

    it('should return enhancement title with emoji while skipping creation', async () => {
      const proposal: EnhancementProposal = {
        type: 'improvement',
        title: 'Expose JSON output path in CLI summary',
        description:
          'Add a CLI summary block that explicitly prints the JSON output location so Jenkins users can cross-check artifacts easily.',
        rationale:
          'Developers frequently need to inspect artifacts. Including the path prevents confusion and speeds up debugging.',
        implementation_hints: ['Log resolved path after parsing options'],
        expected_impact: 'high',
        effort_estimate: 'small',
        related_files: ['src/commands/auto-issue.ts'],
      };

      mockCodexClient.executeTask.mockResolvedValue(['```markdown\n## 概要\nEnhancement body\n```']);

      const result = await generator.generateEnhancementIssue(proposal, 'codex', true);

      expect(result.skippedReason).toBe('dry-run mode');
      expect(result.title).toBe('⚡ Expose JSON output path in CLI summary');
    });
  });
});
