/**
 * インテグレーションテスト: Finalize AI Rewrite 機能
 * Issue #888: PR Finalize後のPRボディをレビュアー向けに全面リライトする機能
 *
 * テスト対象:
 * - generateAiRewrittenPrBody() のエンドツーエンドフロー
 * - CLIオプション統合（--ai-rewrite, --dry-run, --skip-pr-update）
 * - フォールバックチェーン（Claude → Codex → 従来PRボディ）
 *
 * テスト戦略: UNIT_INTEGRATION - 統合テスト部分
 * テストID: IT-AIR-01 〜 IT-AIR-12
 */
import { jest } from '@jest/globals';
import fs from 'fs-extra';
import * as path from 'node:path';

// =========================================================================
// Mock function declarations（top-level hoisting for ESM）
// =========================================================================

// GitManager mocks
const mockCommitWorkflowDeletion = jest.fn();
const mockPushToRemote = jest.fn();
const mockSquashCommitsForFinalize = jest.fn();

// ArtifactCleaner mocks
const mockCleanupWorkflowArtifacts = jest.fn();

// GitHubClient / PullRequestClient mocks
const mockGetPullRequestNumber = jest.fn();
const mockGetPullRequestDiff = jest.fn();
const mockUpdatePullRequest = jest.fn();
const mockUpdateBaseBranch = jest.fn();
const mockMarkPRReady = jest.fn();

// Agent mocks
const mockClaudeExecuteTask = jest.fn();
const mockCodexExecuteTask = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();

// Config mocks
const mockGetHomeDir = jest.fn();
const mockGetGitHubRepository = jest.fn();
const mockGetReposRoot = jest.fn();

// Logger mocks
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

// PromptLoader mocks
const mockLoadPrompt = jest.fn();
const mockLoadTemplate = jest.fn();

// simple-git mock
const mockRevparse = jest.fn();

// =========================================================================
// ESM Module mocks (await jest.unstable_mockModule)
// =========================================================================

await jest.unstable_mockModule('simple-git', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    revparse: mockRevparse,
  })),
}));

await jest.unstable_mockModule('../../src/core/git-manager.js', () => ({
  __esModule: true,
  GitManager: jest.fn().mockImplementation(() => ({
    commitWorkflowDeletion: mockCommitWorkflowDeletion,
    pushToRemote: mockPushToRemote,
    getSquashManager: jest.fn().mockReturnValue({
      squashCommitsForFinalize: mockSquashCommitsForFinalize,
    }),
  })),
}));

await jest.unstable_mockModule('../../src/phases/cleanup/artifact-cleaner.js', () => ({
  __esModule: true,
  ArtifactCleaner: jest.fn().mockImplementation(() => ({
    cleanupWorkflowArtifacts: mockCleanupWorkflowArtifacts,
  })),
}));

await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: jest.fn().mockImplementation(() => ({
    getPullRequestClient: jest.fn().mockReturnValue({
      getPullRequestNumber: mockGetPullRequestNumber,
      getPullRequestDiff: mockGetPullRequestDiff,
      updatePullRequest: mockUpdatePullRequest,
      updateBaseBranch: mockUpdateBaseBranch,
      markPRReady: mockMarkPRReady,
    }),
  })),
}));

await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getHomeDir: mockGetHomeDir,
    getGitHubRepository: mockGetGitHubRepository,
    getReposRoot: mockGetReposRoot,
  },
}));

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

await jest.unstable_mockModule('../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
    loadTemplate: mockLoadTemplate,
  },
}));

await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  findWorkflowMetadata: jest.fn().mockImplementation(async (issueNumber: string) => {
    const metadataPath = path.join(process.cwd(), '.ai-workflow', `issue-${issueNumber}`, 'metadata.json');
    return { repoRoot: process.cwd(), metadataPath };
  }),
  resolveLocalRepoPath: jest.fn(),
  getRepoRoot: jest.fn(),
}));

// =========================================================================
// Import module under test (AFTER all mocks are set up)
// =========================================================================

const { handleFinalizeCommand } = await import('../../src/commands/finalize.js');
import type { FinalizeCommandOptions } from '../../src/commands/finalize.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';

// =========================================================================
// Test data
// =========================================================================

const MOCK_SMALL_DIFF = `diff --git a/src/foo.ts b/src/foo.ts
index abc1234..def5678 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,4 @@
 import { bar } from './bar';
+import { baz } from './baz';

 export function foo() {
-  return bar();
+  return baz(bar());
 }`;

const VALID_PR_BODY_JA = `## 変更概要

テスト機能を追加しました。新しいユーティリティ関数を導入し、既存のfoo関数を拡張しました。

Closes #123

## 変更の背景・目的

Issue #123 で要求されたテスト機能の実装です。

## 主要な変更点

- \`src/foo.ts\`: baz処理の統合によるfoo関数の機能拡張
- \`src/baz.ts\`: 新規ユーティリティ関数の追加

## レビュー時の注目ポイント

- \`foo()\` 関数のAPI互換性が維持されていることを確認してください

## テスト結果サマリー

ユニットテスト: 全件パス

---

**AI Workflow Agent - Finalize (AI Rewrite)**`;

const VALID_PR_BODY_EN = `## Summary of Changes

Added test feature with new utility functions and extended the existing foo function.

Closes #123

## Background & Purpose

Implementation of test feature requested in Issue #123.

## Key Changes

- \`src/foo.ts\`: Extended foo function with baz processing integration
- \`src/baz.ts\`: Added new utility function

## Review Focus Points

- Verify API compatibility of \`foo()\` function is maintained

## Test Results Summary

Unit tests: All passed

---

**AI Workflow Agent - Finalize (AI Rewrite)**`;

const INVALID_PR_BODY_NO_SECTIONS = `## その他のセクション

何らかの内容が記載されていますが、必須ヘッダーが含まれていません。

## テスト結果

全件パスしました。`;

function generateLargeDiff(fileCount: number): string {
  return Array.from({ length: fileCount }, (_, i) =>
    `diff --git a/src/file${i}.ts b/src/file${i}.ts\n` +
    `--- a/src/file${i}.ts\n` +
    `+++ b/src/file${i}.ts\n` +
    `+added line in file ${i}\n` +
    `-removed line in file ${i}`,
  ).join('\n');
}

// Base metadata structure
const baseMetadata = {
  issue_number: '123',
  issue_url: 'https://github.com/owner/repo/issues/123',
  issue_title: 'テスト機能の追加',
  repository: null,
  target_repository: {
    owner: 'owner',
    repo: 'repo',
    path: process.cwd(),
    github_name: 'owner/repo',
    remote_url: 'https://github.com/owner/repo.git',
  },
  workflow_version: '1.0.0',
  current_phase: 'planning',
  base_commit: 'abc123def456',
  design_decisions: {
    implementation_strategy: null,
    test_strategy: null,
    test_code_strategy: null,
  },
  cost_tracking: {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cost_usd: 0,
  },
  phases: {
    planning: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    requirements: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    design: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    test_scenario: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    implementation: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    test_implementation: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    testing: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    documentation: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    report: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
    evaluation: { status: 'completed', retry_count: 0, started_at: null, completed_at: null, review_result: null },
  },
  github_integration: { progress_comment_url: null },
  costs: { total_input_tokens: 0, total_output_tokens: 0, total_cost_usd: 0 },
  model_config: null,
  difficulty_analysis: null,
  rollback_history: [],
  pr_number: 456,
};

// =========================================================================
// Test Suite
// =========================================================================

describe('Integration: Finalize AI Rewrite', () => {
  const testWorkflowDir = path.join(process.cwd(), '.ai-workflow', 'issue-123');
  const testMetadataPath = path.join(testWorkflowDir, 'metadata.json');

  /**
   * Create phase output files for testing collectPhaseOutputs
   */
  function createPhaseOutputFiles(language: 'ja' | 'en' = 'ja'): void {
    const phaseOutputs: Record<string, { dir: string; file: string; content: string }> = {
      planning: {
        dir: path.join(testWorkflowDir, '00_planning', 'output'),
        file: 'planning.md',
        content: '# Planning\n\n## 実装戦略\n\nEXTEND戦略を採用。',
      },
      requirements: {
        dir: path.join(testWorkflowDir, '01_requirements', 'output'),
        file: 'requirements.md',
        content: '# Requirements\n\n## FR-001\n\n--ai-rewrite オプションの追加。',
      },
      design: {
        dir: path.join(testWorkflowDir, '02_design', 'output'),
        file: 'design.md',
        content: '# Design\n\n## アーキテクチャ\n\nAI Rewriteパイプラインの設計。',
      },
      test_scenario: {
        dir: path.join(testWorkflowDir, '03_test_scenario', 'output'),
        file: 'test-scenario.md',
        content: '# Test Scenario\n\n## TC-001\n\n正常系テスト。',
      },
      implementation: {
        dir: path.join(testWorkflowDir, '04_implementation', 'output'),
        file: 'implementation.md',
        content: '# Implementation\n\n## 変更ファイル\n\n- finalize.ts',
      },
      test_result: {
        dir: path.join(testWorkflowDir, '06_testing', 'output'),
        file: 'test-result.md',
        content: '# Test Result\n\n## 実行結果\n\n全件パス。',
      },
      documentation: {
        dir: path.join(testWorkflowDir, '07_documentation', 'output'),
        file: 'documentation-update-log.md',
        content: '# Documentation\n\n## 更新内容\n\nCLI_REFERENCE.md更新。',
      },
    };

    for (const [, value] of Object.entries(phaseOutputs)) {
      fs.ensureDirSync(value.dir);
      fs.writeFileSync(path.join(value.dir, value.file), value.content, 'utf-8');
    }
  }

  /**
   * Setup standard mocks for a successful finalize flow
   */
  function setupStandardMocks(language: 'ja' | 'en' = 'ja'): void {
    mockRevparse.mockResolvedValue('head-before-cleanup\n');
    mockCommitWorkflowDeletion.mockResolvedValue({ success: true, commit_hash: 'abc123' });
    mockPushToRemote.mockResolvedValue({ success: true });
    mockSquashCommitsForFinalize.mockResolvedValue(undefined);
    mockCleanupWorkflowArtifacts.mockResolvedValue(undefined);
    mockGetPullRequestNumber.mockResolvedValue(456);
    mockUpdatePullRequest.mockResolvedValue({ success: true });
    mockUpdateBaseBranch.mockResolvedValue({ success: true });
    mockMarkPRReady.mockResolvedValue({ success: true });
    mockGetHomeDir.mockReturnValue('/home/test');
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetReposRoot.mockReturnValue(null);

    // Prompt & Template
    const promptTemplate = language === 'ja'
      ? 'あなたはPRリライトの専門家です。\n\n## Issue情報\n- Issue番号: {issue_number}\n- タイトル: {issue_title}\n\n## Diff\n{diff_content}\n\n## フェーズ成果物\n{phase_outputs}\n\n## テンプレート\n{template_structure}'
      : 'You are a PR rewrite expert.\n\n## Issue Info\n- Issue: {issue_number}\n- Title: {issue_title}\n\n## Diff\n{diff_content}\n\n## Phase Outputs\n{phase_outputs}\n\n## Template\n{template_structure}';
    mockLoadPrompt.mockReturnValue(promptTemplate);
    mockLoadTemplate.mockReturnValue(language === 'ja' ? '## テンプレート構造' : '## Template Structure');
  }

  /**
   * Setup agent mocks for successful Claude execution
   */
  function setupClaudeSuccess(body: string = VALID_PR_BODY_JA): void {
    mockResolveAgentCredentials.mockReturnValue({
      claudeCodeToken: 'test-claude-token',
      codexApiKey: null,
      claudeCredentialsPath: null,
    });
    mockSetupAgentClients.mockReturnValue({
      claudeClient: { executeTask: mockClaudeExecuteTask },
      codexClient: null,
    });
    mockClaudeExecuteTask.mockResolvedValue([body]);
  }

  /**
   * Setup agent mocks for Claude + Codex fallback
   */
  function setupClaudeFailCodexSuccess(codexBody: string = VALID_PR_BODY_JA): void {
    mockResolveAgentCredentials.mockReturnValue({
      claudeCodeToken: 'test-claude-token',
      codexApiKey: 'test-codex-key',
      claudeCredentialsPath: null,
    });
    mockSetupAgentClients.mockReturnValue({
      claudeClient: { executeTask: mockClaudeExecuteTask },
      codexClient: { executeTask: mockCodexExecuteTask },
    });
    mockClaudeExecuteTask.mockRejectedValue(new Error('Claude API error'));
    mockCodexExecuteTask.mockResolvedValue([codexBody]);
  }

  /**
   * Setup mocks where no agent credentials are available
   */
  function setupNoCredentials(): void {
    mockResolveAgentCredentials.mockReturnValue({
      claudeCodeToken: null,
      codexApiKey: null,
      claudeCredentialsPath: null,
    });
    mockSetupAgentClients.mockReturnValue({
      claudeClient: null,
      codexClient: null,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Create metadata file on real filesystem
    fs.ensureDirSync(path.dirname(testMetadataPath));
    fs.writeJsonSync(testMetadataPath, { ...baseMetadata }, { spaces: 2 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(testWorkflowDir)) {
      fs.removeSync(testWorkflowDir);
    }
  });

  // =============================================================================
  // IT-AIR-01: AI Rewrite 正常フロー（Claude成功）
  // =============================================================================
  describe('IT-AIR-01: generateAiRewrittenPrBody 正常系 - Claude成功の正常フロー', () => {
    test('--ai-rewrite 有効時にClaudeエージェントがPRボディを正常に生成し、PR更新まで完了する', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      setupClaudeSuccess(VALID_PR_BODY_JA);
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
        agent: 'auto',
      };

      // When
      await handleFinalizeCommand(options);

      // Then
      // Claude agent was called
      expect(mockClaudeExecuteTask).toHaveBeenCalledTimes(1);

      // PR was updated with AI-generated body
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[0]).toBe(456); // PR number
      expect(updateArgs[1]).toContain('変更概要'); // AI-generated body contains required section

      // PR was marked as ready
      expect(mockMarkPRReady).toHaveBeenCalledTimes(1);

      // Success log was output
      const infoMessages = mockLoggerInfo.mock.calls.map((c: unknown[]) => c[0]);
      expect(infoMessages.some((m: string) => m.includes('AI rewrite of PR body completed successfully'))).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-02: AI Rewrite 正常フロー（英語）
  // =============================================================================
  describe('IT-AIR-02: generateAiRewrittenPrBody 正常系 - 英語での正常フロー', () => {
    test('英語の言語設定で英語のプロンプト・テンプレートが正しく使用される', async () => {
      // Given: metadata with English language
      const enMetadata = {
        ...baseMetadata,
        language: 'en',
      };
      fs.writeJsonSync(testMetadataPath, enMetadata, { spaces: 2 });
      createPhaseOutputFiles('en');
      setupStandardMocks('en');
      setupClaudeSuccess(VALID_PR_BODY_EN);
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
        agent: 'auto',
      };

      // When
      await handleFinalizeCommand(options);

      // Then
      // English prompt and template were loaded
      expect(mockLoadPrompt).toHaveBeenCalledWith('finalize', 'rewrite_pr_body', 'en');
      expect(mockLoadTemplate).toHaveBeenCalledWith('pr_body_finalize_template.md', 'en');

      // PR was updated with English body
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('Summary'); // English required section
    });
  });

  // =============================================================================
  // IT-AIR-03: Claude失敗→Codexフォールバック成功
  // =============================================================================
  describe('IT-AIR-03: generateAiRewrittenPrBody 正常系 - Claude失敗→Codexフォールバック', () => {
    test('Claudeエージェント失敗時にCodexへフォールバックし、正常にPRボディを生成する', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      setupClaudeFailCodexSuccess(VALID_PR_BODY_JA);
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then
      // Claude was attempted first
      expect(mockClaudeExecuteTask).toHaveBeenCalledTimes(1);

      // Codex was called as fallback
      expect(mockCodexExecuteTask).toHaveBeenCalledTimes(1);

      // PR was updated with Codex-generated body
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更概要');

      // Warning log about Claude failure
      const warnMessages = mockLoggerWarn.mock.calls.map((c: unknown[]) => c[0]);
      expect(warnMessages.some((m: string) => typeof m === 'string' && m.includes('Claude agent failed'))).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-04: 両エージェント失敗→従来PRボディフォールバック
  // =============================================================================
  describe('IT-AIR-04: generateAiRewrittenPrBody フォールバック系 - 両エージェント失敗', () => {
    test('Claude と Codex の両方が失敗した場合に従来のPRボディにフォールバックする', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      // Both agents fail
      mockResolveAgentCredentials.mockReturnValue({
        claudeCodeToken: 'test-token',
        codexApiKey: 'test-key',
        claudeCredentialsPath: null,
      });
      mockSetupAgentClients.mockReturnValue({
        claudeClient: { executeTask: mockClaudeExecuteTask },
        codexClient: { executeTask: mockCodexExecuteTask },
      });
      mockClaudeExecuteTask.mockRejectedValue(new Error('Claude error'));
      mockCodexExecuteTask.mockRejectedValue(new Error('Codex error'));

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When: finalize completes without throwing
      await expect(handleFinalizeCommand(options)).resolves.not.toThrow();

      // Then: PR was updated with fallback body (traditional body)
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      // Fallback body is from generateFinalPrBody which includes 変更サマリー
      expect(updateArgs[1]).toContain('変更サマリー');

      // Warning log about AI rewrite failure
      const warnMessages = mockLoggerWarn.mock.calls.map((c: unknown[]) => c[0]);
      expect(warnMessages.some((m: string) => typeof m === 'string' && m.includes('AI rewrite failed'))).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-05: エージェント認証情報なし→即座にフォールバック
  // =============================================================================
  describe('IT-AIR-05: generateAiRewrittenPrBody フォールバック系 - 認証情報なし', () => {
    test('エージェント認証情報が未設定の場合に即座にフォールバックする', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      setupNoCredentials();
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then: Agent executeTask was NOT called
      expect(mockClaudeExecuteTask).not.toHaveBeenCalled();
      expect(mockCodexExecuteTask).not.toHaveBeenCalled();

      // PR was updated with fallback body
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更サマリー');

      // Warning about no credentials
      const warnMessages = mockLoggerWarn.mock.calls.map((c: unknown[]) => c[0]);
      expect(warnMessages.some((m: string) => typeof m === 'string' && m.includes('No agent credentials available'))).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-06: AI生成結果が空→フォールバック
  // =============================================================================
  describe('IT-AIR-06: generateAiRewrittenPrBody フォールバック系 - AI生成結果が空', () => {
    test('エージェントが空配列を返した場合にフォールバックする', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      // Claude returns empty array (no Codex available)
      mockResolveAgentCredentials.mockReturnValue({
        claudeCodeToken: 'test-token',
        codexApiKey: null,
        claudeCredentialsPath: null,
      });
      mockSetupAgentClients.mockReturnValue({
        claudeClient: { executeTask: mockClaudeExecuteTask },
        codexClient: null,
      });
      mockClaudeExecuteTask.mockResolvedValue([]);

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then: Fallback body was used
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更サマリー');

      // Warning about empty result
      const warnMessages = mockLoggerWarn.mock.calls.map((c: unknown[]) => c[0]);
      const hasEmptyWarning = warnMessages.some((m: string) =>
        typeof m === 'string' && (
          m.includes('empty result') ||
          m.includes('empty output') ||
          m.includes('AI rewrite failed')
        ),
      );
      expect(hasEmptyWarning).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-07: 必須セクション欠損→フォールバック
  // =============================================================================
  describe('IT-AIR-07: generateAiRewrittenPrBody フォールバック系 - 必須セクション欠損', () => {
    test('AI生成結果に必須セクションが含まれない場合にフォールバックする', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      // Claude returns body without required sections
      setupClaudeSuccess(INVALID_PR_BODY_NO_SECTIONS);

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then: Fallback body was used (not the AI-generated invalid one)
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更サマリー'); // Traditional body
      expect(updateArgs[1]).not.toBe(INVALID_PR_BODY_NO_SECTIONS); // Not the invalid AI body

      // Warning about missing sections
      const warnMessages = mockLoggerWarn.mock.calls.map((c: unknown[]) => c[0]);
      expect(warnMessages.some((m: string) =>
        typeof m === 'string' && m.includes('missing required sections'),
      )).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-08: diff取得失敗時もAI生成を試行
  // =============================================================================
  describe('IT-AIR-08: generateAiRewrittenPrBody フォールバック系 - diff取得失敗', () => {
    test('diff取得が失敗した場合でもフォールバックdiffテキストを使ってAI生成が続行される', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      setupClaudeSuccess(VALID_PR_BODY_JA);

      // Diff retrieval fails
      mockGetPullRequestDiff.mockRejectedValue(new Error('GitHub API error: 500'));

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then: AI generation still proceeded
      expect(mockClaudeExecuteTask).toHaveBeenCalledTimes(1);

      // PR was updated with AI-generated body (not fallback)
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更概要'); // AI-generated body

      // Warning about diff failure
      const warnMessages = mockLoggerWarn.mock.calls.map((c: unknown[]) => c[0]);
      expect(warnMessages.some((m: string) =>
        typeof m === 'string' && m.includes('Failed to get PR diff'),
      )).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-09: --ai-rewrite 未指定時の従来動作保持
  // =============================================================================
  describe('IT-AIR-09: CLIオプション統合 - --ai-rewrite 未指定時の従来動作保持', () => {
    test('--ai-rewrite 未指定時に従来のgenerateFinalPrBodyのみが使用される', async () => {
      // Given
      setupStandardMocks('ja');
      mockGetPullRequestDiff.mockResolvedValue({
        diff: MOCK_SMALL_DIFF,
        truncated: false,
        filesChanged: 1,
      });

      const options: FinalizeCommandOptions = {
        issue: '123',
        // aiRewrite is NOT specified (defaults to undefined/false)
      };

      // When
      await handleFinalizeCommand(options);

      // Then: AI-related functions were NOT called
      expect(mockClaudeExecuteTask).not.toHaveBeenCalled();
      expect(mockCodexExecuteTask).not.toHaveBeenCalled();
      expect(mockLoadPrompt).not.toHaveBeenCalled();
      expect(mockLoadTemplate).not.toHaveBeenCalled();

      // PR was updated with traditional body
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更サマリー'); // Traditional body structure

      // PR was marked as ready
      expect(mockMarkPRReady).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // IT-AIR-10: --dry-run --ai-rewrite のプレビュー表示
  // =============================================================================
  describe('IT-AIR-10: CLIオプション統合 - --dry-run --ai-rewrite のプレビュー表示', () => {
    test('--dry-run と --ai-rewrite が同時指定された場合にAI Rewrite状態がプレビューに表示される', async () => {
      // Given
      setupStandardMocks('ja');

      const options: FinalizeCommandOptions = {
        issue: '123',
        dryRun: true,
        aiRewrite: true,
        agent: 'claude',
      };

      // When
      await handleFinalizeCommand(options);

      // Then: No actual API calls were made
      expect(mockUpdatePullRequest).not.toHaveBeenCalled();
      expect(mockMarkPRReady).not.toHaveBeenCalled();
      expect(mockClaudeExecuteTask).not.toHaveBeenCalled();
      expect(mockCodexExecuteTask).not.toHaveBeenCalled();
      expect(mockCleanupWorkflowArtifacts).not.toHaveBeenCalled();

      // Preview output contains AI rewrite information
      const infoMessages = mockLoggerInfo.mock.calls.map((c: unknown[]) => c[0]);
      const hasAiRewriteInfo = infoMessages.some((m: string) =>
        typeof m === 'string' && (
          m.includes('AI リライトが有効') || m.includes('AI rewrite enabled')
        ),
      );
      expect(hasAiRewriteInfo).toBe(true);

      // Preview contains agent mode
      const hasAgentMode = infoMessages.some((m: string) =>
        typeof m === 'string' && m.includes('claude'),
      );
      expect(hasAgentMode).toBe(true);

      // DRY RUN message
      const hasDryRunMessage = infoMessages.some((m: string) =>
        typeof m === 'string' && m.includes('[DRY RUN]'),
      );
      expect(hasDryRunMessage).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-11: --skip-pr-update --ai-rewrite 時のスキップ動作
  // =============================================================================
  describe('IT-AIR-11: CLIオプション統合 - --skip-pr-update --ai-rewrite 時のスキップ', () => {
    test('--skip-pr-update と --ai-rewrite が同時指定された場合にPR更新とAI Rewriteがスキップされる', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');

      const options: FinalizeCommandOptions = {
        issue: '123',
        skipPrUpdate: true,
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then: PR update was skipped
      expect(mockUpdatePullRequest).not.toHaveBeenCalled();
      expect(mockMarkPRReady).not.toHaveBeenCalled();

      // Agent executeTask was not called
      expect(mockClaudeExecuteTask).not.toHaveBeenCalled();
      expect(mockCodexExecuteTask).not.toHaveBeenCalled();

      // Steps 1-3 were still executed
      expect(mockRevparse).toHaveBeenCalled(); // Step 1
      expect(mockCleanupWorkflowArtifacts).toHaveBeenCalled(); // Step 2
      expect(mockCommitWorkflowDeletion).toHaveBeenCalled(); // Step 2
      expect(mockSquashCommitsForFinalize).toHaveBeenCalled(); // Step 3

      // Skip message was logged
      const infoMessages = mockLoggerInfo.mock.calls.map((c: unknown[]) => c[0]);
      const hasSkipMessage = infoMessages.some((m: string) =>
        typeof m === 'string' && m.includes('Skipping PR update'),
      );
      expect(hasSkipMessage).toBe(true);
    });
  });

  // =============================================================================
  // IT-AIR-12: 大規模diff時のトランケーションとAI生成
  // =============================================================================
  describe('IT-AIR-12: CLIオプション統合 - 大規模diff時のトランケーションとAI生成', () => {
    test('大規模diff（300ファイル超）の場合にdiffがトランケーションされた上でAI生成が正常に完了する', async () => {
      // Given
      createPhaseOutputFiles('ja');
      setupStandardMocks('ja');
      setupClaudeSuccess(VALID_PR_BODY_JA);

      // Large diff with 400 files
      const largeDiff = generateLargeDiff(400);
      mockGetPullRequestDiff.mockResolvedValue({
        diff: largeDiff,
        truncated: true,
        filesChanged: 400,
      });

      const options: FinalizeCommandOptions = {
        issue: '123',
        aiRewrite: true,
      };

      // When
      await handleFinalizeCommand(options);

      // Then: AI generation completed successfully
      expect(mockClaudeExecuteTask).toHaveBeenCalledTimes(1);

      // The prompt passed to the agent should contain truncation message
      const agentCallArgs = mockClaudeExecuteTask.mock.calls[0] as unknown[];
      const taskOptions = agentCallArgs[0] as { prompt: string };
      // The prompt should indicate truncation (file summary rather than full diff)
      expect(taskOptions.prompt).toContain('400');

      // PR was updated with AI-generated body
      expect(mockUpdatePullRequest).toHaveBeenCalledTimes(1);
      const updateArgs = mockUpdatePullRequest.mock.calls[0];
      expect(updateArgs[1]).toContain('変更概要');

      // Success log
      const infoMessages = mockLoggerInfo.mock.calls.map((c: unknown[]) => c[0]);
      expect(infoMessages.some((m: string) =>
        typeof m === 'string' && m.includes('AI rewrite of PR body completed successfully'),
      )).toBe(true);
    });
  });
});
