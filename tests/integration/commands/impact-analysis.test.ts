/**
 * インテグレーションテスト: impact-analysis パイプライン
 *
 * テスト対象: src/commands/impact-analysis.ts
 * テストシナリオ: IT-001, IT-002（E2E）
 */

import fs from 'node:fs';
import path from 'node:path';
import { jest } from '@jest/globals';

const mockResolveLocalRepoPath = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const mockGitHubGetPullRequestDiff = jest.fn();
const mockGitHubPostPRComment = jest.fn();

await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
  parsePullRequestUrl: jest.fn(),
}));

await jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    getPullRequestDiff(prNumber: number) {
      return mockGitHubGetPullRequestDiff(prNumber);
    }
    postPRComment(prNumber: number, body: string) {
      return mockGitHubPostPRComment(prNumber, body);
    }
  },
}));

const { handleImpactAnalysisCommand } = await import('../../../src/commands/impact-analysis.js');
const { config } = await import('../../../src/core/config.js');
const { logger } = await import('../../../src/utils/logger.js');

function cleanupLogs(prNumber: number) {
  const logDir = path.resolve(process.cwd(), 'logs', `pr-${prNumber}`);
  if (fs.existsSync(logDir)) {
    fs.rmSync(logDir, { recursive: true, force: true });
  }
}

describe('impact-analysis integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    process.env.GITHUB_TOKEN = 'test-token';
    process.env.GITHUB_REPOSITORY = 'owner/repo';

    config.getGitHubRepository = jest.fn().mockReturnValue('owner/repo');
    config.getHomeDir = jest.fn().mockReturnValue('/home/test');

    logger.info = jest.fn();
    logger.warn = jest.fn();
    logger.error = jest.fn();
    logger.debug = jest.fn();

    mockResolveLocalRepoPath.mockReturnValue(process.cwd());
    mockResolveAgentCredentials.mockReturnValue({ codexApiKey: 'x', claudeCredentialsPath: '/tmp/claude' });

    mockGitHubGetPullRequestDiff.mockResolvedValue({
      diff: 'diff --git a/db/migrations/001.sql b/db/migrations/001.sql',
      truncated: false,
      filesChanged: 1,
    });

    mockGitHubPostPRComment.mockResolvedValue({
      success: true,
      commentId: 1,
      commentUrl: 'https://example.com',
      error: null,
    });
  });

  afterEach(() => {
    cleanupLogs(123);
  });

  it('IT-001: Scoper→Investigator→Reporter のE2Eフロー', async () => {
    const agentClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [
              { id: 'INV-001', patternName: 'マイグレーション波及', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
              { id: 'INV-002', patternName: '依存パッケージ更新', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
            ],
            matchedPatterns: ['マイグレーション波及', '依存パッケージ更新'],
            skippedPatterns: [],
            reasoning: 'scoper reasoning',
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            findings: [
              {
                investigationPointId: 'INV-001',
                patternName: 'マイグレーション波及',
                description: 'desc',
                evidence: [{ type: 'code_reference', filePath: 'src/a.ts', lineNumber: 1, content: 'x' }],
                severity: 'info',
              },
            ],
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            findings: [
              {
                investigationPointId: 'INV-002',
                patternName: '依存パッケージ更新',
                description: 'desc',
                evidence: [{ type: 'code_reference', filePath: 'package.json', lineNumber: 2, content: 'dep' }],
                severity: 'info',
              },
            ],
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: '## 影響範囲調査\n- マイグレーション波及\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: agentClient, claudeClient: agentClient });

    await handleImpactAnalysisCommand({ pr: '123' });

    expect(mockGitHubPostPRComment).toHaveBeenCalledWith(123, expect.any(String));

    const logDir = path.resolve(process.cwd(), 'logs', 'pr-123');
    expect(fs.existsSync(path.join(logDir, 'scoper-reasoning.md'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'investigator-log.md'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'reporter-output.md'))).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'pipeline-summary.json'))).toBe(true);
  });

  it('IT-002: dry-run モードのE2Eフロー', async () => {
    const agentClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [],
            matchedPatterns: [],
            skippedPatterns: [],
            reasoning: 'none',
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: '該当する発見事項はありませんでした。\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: agentClient, claudeClient: agentClient });

    await handleImpactAnalysisCommand({ pr: '123', dryRun: true });

    expect(mockGitHubPostPRComment).not.toHaveBeenCalled();

    const logDir = path.resolve(process.cwd(), 'logs', 'pr-123');
    expect(fs.existsSync(path.join(logDir, 'report-dry-run.md'))).toBe(true);
  });

  it('IT-003: ガードレール到達時のE2Eフロー', async () => {
    const toolHeavyMessage = 'rg '.repeat(31);
    const agentClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [
              { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
              { id: 'INV-002', patternName: 'B', description: 'b', targetFiles: [], searchKeywords: [], instructions: '' },
              { id: 'INV-003', patternName: 'C', description: 'c', targetFiles: [], searchKeywords: [], instructions: '' },
            ],
            matchedPatterns: ['A', 'B', 'C'],
            skippedPatterns: [],
            reasoning: 'scoper reasoning',
          }),
        ])
        .mockResolvedValueOnce([toolHeavyMessage])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: 'ガードレール到達により調査途中で終了\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: agentClient, claudeClient: agentClient });

    await handleImpactAnalysisCommand({ pr: '123' });

    const logDir = path.resolve(process.cwd(), 'logs', 'pr-123');
    const summary = JSON.parse(fs.readFileSync(path.join(logDir, 'pipeline-summary.json'), 'utf-8'));
    expect(summary.guardrailsReached).toBe(true);
    expect(fs.existsSync(path.join(logDir, 'reporter-output.md'))).toBe(true);
  });

  it('IT-004: Scoper結果が空の場合のE2Eフロー', async () => {
    const agentClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [],
            matchedPatterns: [],
            skippedPatterns: [],
            reasoning: 'none',
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: '該当する調査パターンはありませんでした。\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: agentClient, claudeClient: agentClient });

    await handleImpactAnalysisCommand({ pr: '123' });

    const logDir = path.resolve(process.cwd(), 'logs', 'pr-123');
    expect(fs.existsSync(path.join(logDir, 'investigator-log.md'))).toBe(false);
    expect(mockGitHubPostPRComment).toHaveBeenCalled();
  });

  it('IT-005: custom-instructionが反映される', async () => {
    const agentClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [
              { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
            ],
            matchedPatterns: ['A'],
            skippedPatterns: [],
            reasoning: 'scoper reasoning',
          }),
        ])
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })])
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: 'カスタム観点を含むレポート\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: agentClient, claudeClient: agentClient });

    await handleImpactAnalysisCommand({ pr: '123', customInstruction: 'table_aとtable_bは新旧テーブル' });

    expect(agentClient.executeTask).toHaveBeenCalledTimes(4);
  });

  it('IT-006: エージェントフォールバックで完了する', async () => {
    const primaryClient = { executeTask: jest.fn().mockRejectedValue(new Error('primary failed')) };
    const fallbackClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [
              { id: 'INV-001', patternName: 'A', description: 'a', targetFiles: [], searchKeywords: [], instructions: '' },
            ],
            matchedPatterns: ['A'],
            skippedPatterns: [],
            reasoning: 'scoper reasoning',
          }),
        ])
        .mockResolvedValueOnce([JSON.stringify({ findings: [] })])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: 'フォールバック完了\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: fallbackClient, claudeClient: primaryClient });

    await handleImpactAnalysisCommand({ pr: '123' });

    expect(primaryClient.executeTask).toHaveBeenCalled();
    expect(fallbackClient.executeTask).toHaveBeenCalled();
  });

  it('IT-007: PRコメント投稿失敗時にフォールバック保存される', async () => {
    const agentClient = {
      executeTask: jest.fn()
        .mockResolvedValueOnce([
          JSON.stringify({
            investigationPoints: [],
            matchedPatterns: [],
            skippedPatterns: [],
            reasoning: 'none',
          }),
        ])
        .mockResolvedValueOnce([
          JSON.stringify({
            markdown: 'フォールバック保存\n判断は開発者が行ってください',
          }),
        ]),
    };

    mockSetupAgentClients.mockReturnValue({ codexClient: agentClient, claudeClient: agentClient });
    mockGitHubPostPRComment.mockResolvedValue({ success: false, commentId: null, commentUrl: null, error: '認証エラー' });

    await handleImpactAnalysisCommand({ pr: '123' });

    const logDir = path.resolve(process.cwd(), 'logs', 'pr-123');
    expect(fs.existsSync(path.join(logDir, 'report-fallback.md'))).toBe(true);
  });
});
