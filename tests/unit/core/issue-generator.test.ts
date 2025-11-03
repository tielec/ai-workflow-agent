/**
 * ユニットテスト: IssueGenerator（Issue生成エンジン）
 *
 * テスト対象:
 * - generateIssues(): Issue一括生成
 * - createIssue(): 個別Issue作成
 * - generateIssueContent(): LLM Issue本文生成
 * - getLabels(): ラベル生成
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { IssueGenerator } from '../../../src/core/issue-generator.js';
import { IssueCategory, type IssueCandidateResult } from '../../../src/types.js';
import { GitHubClient } from '../../../src/core/github-client.js';
import { SecretMasker } from '../../../src/core/secret-masker.js';
import OpenAI from 'openai';

// モック設定
jest.mock('../../../src/core/github-client.js');
jest.mock('../../../src/core/secret-masker.js');
jest.mock('openai');
jest.mock('../../../src/core/config.js', () => ({
  config: {
    getGitHubToken: jest.fn(() => 'test-github-token'),
    getGitHubRepository: jest.fn(() => 'owner/repo'),
    getOpenAiApiKey: jest.fn(() => 'test-openai-key'),
  },
}));

// =============================================================================
// テストデータ
// =============================================================================

const createTestCandidate = (overrides?: Partial<IssueCandidateResult>): IssueCandidateResult => ({
  category: IssueCategory.BUG,
  title: 'テストIssue',
  description: 'テスト説明',
  file: 'src/test.ts',
  lineNumber: 10,
  codeSnippet: 'async function test() { ... }',
  confidence: 0.95,
  suggestedFixes: ['修正案1', '修正案2'],
  expectedBenefits: ['効果1', '効果2'],
  priority: 'High',
  ...overrides,
});

// =============================================================================
// IssueGenerator のテスト
// =============================================================================

describe('IssueGenerator', () => {
  let generator: IssueGenerator;
  let mockGitHubClient: jest.Mocked<GitHubClient>;
  let mockSecretMasker: jest.Mocked<SecretMasker>;
  let mockOpenAI: jest.Mocked<OpenAI>;

  beforeEach(() => {
    // GitHubClientのモック
    mockGitHubClient = {
      getIssueClient: jest.fn(() => ({
        createIssue: jest.fn(async (title, body, labels) => ({
          number: 999,
          url: 'https://github.com/owner/repo/issues/999',
        })),
      })),
    } as unknown as jest.Mocked<GitHubClient>;

    (GitHubClient as jest.MockedClass<typeof GitHubClient>).mockImplementation(() => mockGitHubClient);

    // SecretMaskerのモック
    mockSecretMasker = {
      maskSecrets: jest.fn((content: string) => content.replace(/sk-\w+/g, 'sk-*****')),
    } as unknown as jest.Mocked<SecretMasker>;

    (SecretMasker as jest.MockedClass<typeof SecretMasker>).mockImplementation(() => mockSecretMasker);

    // OpenAIのモック
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(async () => ({
            choices: [
              {
                message: {
                  content: `## 概要
テスト説明

## 詳細
詳細な説明です。

## 該当箇所
- ファイル: src/test.ts:10

## 提案される解決策
1. 修正案1
2. 修正案2

## 期待される効果
1. 効果1
2. 効果2`,
                },
              },
            ],
          })),
        },
      },
    } as unknown as jest.Mocked<OpenAI>;

    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAI);

    generator = new IssueGenerator();
  });

  // ===========================================================================
  // generateIssues() のテスト
  // ===========================================================================

  describe('generateIssues', () => {
    test('複数のIssue候補を一括でGitHubに作成できる', async () => {
      // Given: 3件のIssue候補
      const candidates = [
        createTestCandidate({ title: 'Issue 1' }),
        createTestCandidate({ title: 'Issue 2' }),
        createTestCandidate({ title: 'Issue 3' }),
      ];

      // When: Issue一括生成
      await generator.generateIssues(candidates);

      // Then: 3件のIssueが作成される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledTimes(3);
    });

    test('一部のIssue作成が失敗しても、他のIssue作成が継続される', async () => {
      // Given: Issue候補3件、2件目が失敗する設定
      const candidates = [
        createTestCandidate({ title: 'Issue 1' }),
        createTestCandidate({ title: 'Issue 2' }),
        createTestCandidate({ title: 'Issue 3' }),
      ];

      let callCount = 0;
      const issueClient = mockGitHubClient.getIssueClient();
      issueClient.createIssue = jest.fn(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error('GitHub API error');
        }
        return { number: 999, url: 'https://github.com/owner/repo/issues/999' };
      }) as typeof issueClient.createIssue;

      // When: Issue一括生成
      await generator.generateIssues(candidates);

      // Then: 3回試行される（2件目は失敗するがエラーログを記録して継続）
      expect(issueClient.createIssue).toHaveBeenCalledTimes(3);
    });
  });

  // ===========================================================================
  // Issue本文生成のテスト
  // ===========================================================================

  describe('generateIssueContent', () => {
    test('LLM APIでIssue本文が正しく生成される', async () => {
      // Given: Issue候補
      const candidates = [createTestCandidate()];

      // When: Issue生成
      await generator.generateIssues(candidates);

      // Then: OpenAI APIが呼び出される
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();

      // Issue本文が生成され、GitHubに送信される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('## 概要'),
        expect.any(Array)
      );
    });

    test('LLM API障害時はテンプレートベース生成にフォールバックする', async () => {
      // Given: OpenAI APIがエラーを返す
      mockOpenAI.chat.completions.create = jest.fn(async () => {
        throw new Error('OpenAI API error');
      }) as typeof mockOpenAI.chat.completions.create;

      const candidates = [createTestCandidate()];

      // When: Issue生成
      await generator.generateIssues(candidates);

      // Then: テンプレートベースの本文が生成される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('## 概要'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // SecretMasker統合のテスト
  // ===========================================================================

  describe('SecretMasker統合', () => {
    test('Issue作成前にSecretMaskerでシークレットが自動マスキングされる', async () => {
      // Given: Issue本文にAPIキーが含まれる
      mockOpenAI.chat.completions.create = jest.fn(async () => ({
        choices: [
          {
            message: {
              content: `## 概要
APIキーはsk-12345abcdeです`,
            },
          },
        ],
      })) as typeof mockOpenAI.chat.completions.create;

      const candidates = [createTestCandidate()];

      // When: Issue生成
      await generator.generateIssues(candidates);

      // Then: SecretMaskerが呼ばれる
      expect(mockSecretMasker.maskSecrets).toHaveBeenCalled();

      // マスキングされた本文がGitHub APIに送信される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('sk-*****'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // ラベル生成のテスト
  // ===========================================================================

  describe('getLabels', () => {
    test('Issue候補からGitHubラベルが正しく生成される', async () => {
      // Given: High優先度のbugカテゴリIssue候補
      const candidates = [
        createTestCandidate({
          category: IssueCategory.BUG,
          priority: 'High',
        }),
      ];

      // When: Issue生成
      await generator.generateIssues(candidates);

      // Then: 適切なラベルが付与される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.arrayContaining(['auto-generated', IssueCategory.BUG, 'priority:high'])
      );
    });

    test('Medium優先度の場合、適切なラベルが生成される', async () => {
      // Given: Medium優先度のIssue候補
      const candidates = [
        createTestCandidate({
          priority: 'Medium',
        }),
      ];

      // When: Issue生成
      await generator.generateIssues(candidates);

      // Then: priority:mediumラベルが付与される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.arrayContaining(['priority:medium'])
      );
    });
  });

  // ===========================================================================
  // OpenAI API未設定のテスト
  // ===========================================================================

  describe('OpenAI API未設定', () => {
    test('OpenAI APIキー未設定時はテンプレートベース生成を使用する', async () => {
      // Given: OpenAI APIキーが未設定
      const { config } = await import('../../../src/core/config.js');
      (config.getOpenAiApiKey as jest.Mock).mockReturnValueOnce(null);

      const generatorNoOpenAI = new IssueGenerator();
      const candidates = [createTestCandidate()];

      // When: Issue生成
      await generatorNoOpenAI.generateIssues(candidates);

      // Then: テンプレートベースの本文が生成され、Issueが作成される
      const issueClient = mockGitHubClient.getIssueClient();
      expect(issueClient.createIssue).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('## 概要'),
        expect.any(Array)
      );
    });
  });
});
