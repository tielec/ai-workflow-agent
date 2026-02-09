/**
 * インテグレーションテスト: auto-issue のエージェント優先順位 (Issue #629)
 *
 * テスト対象: src/commands/auto-issue.ts / agent-setup.ts の統合挙動
 * テストシナリオ: test-scenario.md の IT-629-001〜IT-629-005
 */

import { jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';

jest.setTimeout(20000);

// リポジトリ解析系モック
const mockAnalyze = jest.fn<any>();
const mockAnalyzeForRefactoring = jest.fn<any>();
const mockAnalyzeForEnhancements = jest.fn<any>();

// Issue 重複・生成モック
const mockFilterDuplicates = jest.fn<any>();
const mockGenerate = jest.fn<any>();
const mockGenerateRefactorIssue = jest.fn<any>();
const mockGenerateEnhancementIssue = jest.fn<any>();

// ユーティリティ・設定モック
const mockResolveLocalRepoPath = jest.fn<any>();
const mockDetectCodexCliAuth = jest.fn<any>();
const mockIsValidCodexApiKey = jest.fn<any>();
const mockConfig = {
  getGitHubToken: jest.fn<any>(),
  getGitHubRepository: jest.fn<any>(),
  getHomeDir: jest.fn<any>(),
  getOpenAiApiKey: jest.fn<any>(),
  getAnthropicApiKey: jest.fn<any>(),
  getCodexApiKey: jest.fn<any>(),
  getClaudeCodeToken: jest.fn<any>(),
  getClaudeCredentialsPath: jest.fn<any>(),
  getCodexModel: jest.fn<any>(),
  getClaudeModel: jest.fn<any>(),
  getReposRoot: jest.fn<any>(),
  isCI: jest.fn<any>(),
};

// ロガーモック
const logger = {
  info: jest.fn<any>(),
  warn: jest.fn<any>(),
  error: jest.fn<any>(),
  debug: jest.fn<any>(),
};

// エージェントクライアントの生成監視
const codexClientConstructor = jest.fn<any>();
const claudeClientConstructor = jest.fn<any>();

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger,
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: mockConfig,
}));

await jest.unstable_mockModule('../../src/core/helpers/codex-credentials.js', () => ({
  __esModule: true,
  CODEX_MIN_API_KEY_LENGTH: 40,
  detectCodexCliAuth: mockDetectCodexCliAuth,
  isValidCodexApiKey: mockIsValidCodexApiKey,
}));

await jest.unstable_mockModule('../../src/core/codex-agent-client.js', () => ({
  __esModule: true,
  CodexAgentClient: jest.fn().mockImplementation((options) => {
    codexClientConstructor(options);
    return { __type: 'codex', options };
  }),
  resolveCodexModel: jest.fn().mockImplementation((model) => model ?? 'gpt-5.2-codex'),
  DEFAULT_CODEX_MODEL: 'gpt-5.2-codex',
}));

await jest.unstable_mockModule('../../src/core/claude-agent-client.js', () => ({
  __esModule: true,
  ClaudeAgentClient: jest.fn().mockImplementation((options) => {
    claudeClientConstructor(options);
    return { __type: 'claude', options };
  }),
  resolveClaudeModel: jest.fn().mockImplementation((model) => model ?? 'claude-3.5-sonnet'),
  DEFAULT_CLAUDE_MODEL: 'claude-3.5-sonnet',
}));

await jest.unstable_mockModule('../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
    analyzeForRefactoring: mockAnalyzeForRefactoring,
    analyzeForEnhancements: mockAnalyzeForEnhancements,
  })),
}));

await jest.unstable_mockModule('../../src/core/issue-deduplicator.js', () => ({
  __esModule: true,
  IssueDeduplicator: jest.fn().mockImplementation(() => ({
    filterDuplicates: mockFilterDuplicates,
  })),
}));

await jest.unstable_mockModule('../../src/core/issue-generator.js', () => ({
  __esModule: true,
  IssueGenerator: jest.fn().mockImplementation(() => ({
    generate: mockGenerate,
    generateRefactorIssue: mockGenerateRefactorIssue,
    generateEnhancementIssue: mockGenerateEnhancementIssue,
  })),
}));

await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
  // findWorkflowMetadata が無いと依存先 import で落ちるため追加
  findWorkflowMetadata: jest.fn(),
}));

await jest.unstable_mockModule('../../src/core/instruction-validator.js', () => ({
  __esModule: true,
  InstructionValidator: {
    validate: jest.fn().mockResolvedValue({
      isValid: true,
      confidence: 'high',
      category: 'bug',
      validationMethod: 'mock',
    }),
  },
}));

await jest.unstable_mockModule('@octokit/rest', () => ({
  __esModule: true,
  Octokit: class {
    issues = { listForRepo: jest.fn().mockResolvedValue({ data: [] }) };
  },
}));

// モック適用後に実装を読み込む
const { handleAutoIssueCommand } = await import('../../src/commands/auto-issue.js');

describe('Integration: auto-issue agent priority (Issue #629)', () => {
  let testRepoDir: string;

  beforeEach(async () => {
    testRepoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-issue-agent-priority-'));
    await fs.ensureDir(path.join(testRepoDir, '.git'));

    jest.clearAllMocks();

    mockResolveLocalRepoPath.mockReturnValue(testRepoDir);

    mockAnalyze.mockResolvedValue([]);
    mockAnalyzeForRefactoring.mockResolvedValue([]);
    mockAnalyzeForEnhancements.mockResolvedValue([]);

    mockFilterDuplicates.mockImplementation(async (candidates: any) => candidates);
    mockGenerate.mockResolvedValue({ success: true });
    mockGenerateRefactorIssue.mockResolvedValue({ success: true });
    mockGenerateEnhancementIssue.mockResolvedValue({ success: true });

    mockDetectCodexCliAuth.mockReturnValue({ authFilePath: null, candidates: [] });
    mockIsValidCodexApiKey.mockImplementation(
      (key: unknown) => typeof key === 'string' && key.trim().length >= 40,
    );

    mockConfig.getGitHubToken.mockReturnValue('test-token');
    mockConfig.getGitHubRepository.mockReturnValue('tielec/test-repo');
    mockConfig.getHomeDir.mockReturnValue('/home/test');
    mockConfig.getOpenAiApiKey.mockReturnValue(null);
    mockConfig.getAnthropicApiKey.mockReturnValue(null);
    mockConfig.getCodexModel.mockReturnValue(undefined);
    mockConfig.getClaudeModel.mockReturnValue(undefined);
    mockConfig.getReposRoot.mockReturnValue(null);
    mockConfig.isCI.mockReturnValue(false);
    mockConfig.getClaudeCredentialsPath.mockReturnValue(null);
  });

  afterEach(async () => {
    if (testRepoDir && (await fs.pathExists(testRepoDir))) {
      await fs.remove(testRepoDir);
    }
  });

  // IT-629-001: Claude 優先（bug カテゴリ）
  it('bug カテゴリで Claude を優先し Codex をフォールバックとして初期化する', async () => {
    mockConfig.getCodexApiKey.mockReturnValue('valid-codex-api-key-12345678901234567890');
    mockConfig.getClaudeCodeToken.mockReturnValue('valid-claude-token');

    await handleAutoIssueCommand({
      category: 'bug',
      agent: 'auto',
      dryRun: true,
    });

    expect(logger.debug).toHaveBeenCalledWith("Agent priority for category 'bug': claude-first");
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Claude Code agent enabled (auto mode, claude-first priority'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Codex credentials detected. Fallback available'),
    );
    expect(claudeClientConstructor).toHaveBeenCalledTimes(1);
    expect(codexClientConstructor).toHaveBeenCalledTimes(1);
  });

  // IT-629-002: Claude 認証がない場合の Codex フォールバック
  it('Claude 認証が未設定でも Codex にフォールバックして実行する', async () => {
    mockConfig.getCodexApiKey.mockReturnValue('valid-codex-api-key-12345678901234567890');
    mockConfig.getClaudeCodeToken.mockReturnValue(null);
    mockConfig.getClaudeCredentialsPath.mockReturnValue(null);

    await handleAutoIssueCommand({
      category: 'bug',
      agent: 'auto',
      dryRun: true,
    });

    expect(logger.debug).toHaveBeenCalledWith("Agent priority for category 'bug': claude-first");
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Claude agent unavailable. Using Codex'),
    );
    expect(claudeClientConstructor).not.toHaveBeenCalled();
    expect(codexClientConstructor).toHaveBeenCalledTimes(1);
  });

  // IT-629-003: --agent codex 指定時は Codex のみ
  it('--agent codex 指定時は Codex モードのみで実行される', async () => {
    mockConfig.getCodexApiKey.mockReturnValue('valid-codex-api-key-12345678901234567890');
    mockConfig.getClaudeCodeToken.mockReturnValue('valid-claude-token');

    await handleAutoIssueCommand({
      category: 'bug',
      agent: 'codex',
      dryRun: true,
    });

    const infoMessages = logger.info.mock.calls.map(([msg]) => String(msg));
    expect(infoMessages.some((msg) => msg.includes('Codex agent enabled (codex mode'))).toBe(
      true,
    );
    expect(infoMessages.some((msg) => msg.includes('Claude Code agent enabled (auto mode'))).toBe(
      false,
    );
    expect(claudeClientConstructor).not.toHaveBeenCalled();
    expect(codexClientConstructor).toHaveBeenCalledTimes(1);
  });

  // IT-629-004: refactor カテゴリでの Claude 優先
  it('refactor カテゴリで claude-first が設定される', async () => {
    mockConfig.getCodexApiKey.mockReturnValue('valid-codex-api-key-12345678901234567890');
    mockConfig.getClaudeCodeToken.mockReturnValue('valid-claude-token');

    await handleAutoIssueCommand({
      category: 'refactor',
      agent: 'auto',
      dryRun: true,
    });

    expect(logger.debug).toHaveBeenCalledWith(
      "Agent priority for category 'refactor': claude-first",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Claude Code agent enabled (auto mode, claude-first priority'),
    );
    expect(mockAnalyzeForRefactoring).toHaveBeenCalledWith(
      testRepoDir,
      'auto',
      expect.objectContaining({ customInstruction: undefined }),
    );
  });

  // IT-629-005: enhancement カテゴリでの Claude 優先
  it('enhancement カテゴリで claude-first が設定される', async () => {
    mockConfig.getCodexApiKey.mockReturnValue('valid-codex-api-key-12345678901234567890');
    mockConfig.getClaudeCodeToken.mockReturnValue('valid-claude-token');

    await handleAutoIssueCommand({
      category: 'enhancement',
      agent: 'auto',
      dryRun: true,
    });

    expect(logger.debug).toHaveBeenCalledWith(
      "Agent priority for category 'enhancement': claude-first",
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Claude Code agent enabled (auto mode, claude-first priority'),
    );
    expect(mockAnalyzeForEnhancements).toHaveBeenCalledWith(
      testRepoDir,
      'auto',
      expect.objectContaining({
        creativeMode: false,
        customInstruction: undefined,
      }),
    );
  });
});
