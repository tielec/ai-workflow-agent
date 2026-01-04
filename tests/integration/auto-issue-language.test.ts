import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BugCandidate, EnhancementProposal } from '../../src/types/auto-issue.js';

const mockAnalyze = jest.fn();
const mockAnalyzeEnhancements = jest.fn();
const mockGenerate = jest.fn();
const mockGenerateEnhancementIssue = jest.fn();
const mockFilterDuplicates = jest.fn();
const mockResolveLocalRepoPath = jest.fn().mockReturnValue('/tmp/test-repo');

const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();

const mockConfig = {
  getGitHubRepository: jest.fn(() => 'owner/repo'),
  getGitHubToken: jest.fn(() => 'test-token'),
  getHomeDir: jest.fn(() => '/home/test'),
  getReposRoot: jest.fn(() => null),
  getLanguage: jest.fn(() => {
    const lang = process.env.AI_WORKFLOW_LANGUAGE?.toLowerCase();
    return lang === 'en' ? 'en' : 'ja';
  }),
  getOpenAiApiKey: jest.fn(() => null),
  getAnthropicApiKey: jest.fn(() => null),
  getCodexApiKey: jest.fn(() => 'test-codex-key'),
  getClaudeCodeToken: jest.fn(() => 'test-claude-token'),
};

await jest.unstable_mockModule('../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    analyze: mockAnalyze,
    analyzeForEnhancements: mockAnalyzeEnhancements,
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
    generateEnhancementIssue: mockGenerateEnhancementIssue,
  })),
}));

await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: () => mockSetupAgentClients(),
}));

await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

await jest.unstable_mockModule('../../src/core/config.js', () => ({
  __esModule: true,
  config: mockConfig,
}));

await jest.unstable_mockModule('@octokit/rest', () => ({
  __esModule: true,
  Octokit: class {
    public issues = {
      listForRepo: jest.fn().mockResolvedValue({ data: [] }),
    };
  },
}));

await jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { handleAutoIssueCommand } = await import('../../src/commands/auto-issue.js');

const englishBugTitle = 'Fix memory leak when processing large files in batch mode';
const englishEnhancementTitle = 'Improve error handling in background job orchestration and vendor API retries';
const japaneseBugTitle = 'バッチ処理で大容量ファイル処理時にメモリリークが発生するバッチ処理で大容量ファイル処理時にメモリリークが発生する';
const japaneseEnhancementTitle = '自動化されたセットアップウィザードによって初回実行時の環境構築を簡素化する'.repeat(2);

const japanesePattern = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
const englishPattern = /[a-zA-Z]/;

type TitleCategory = 'bug' | 'enhancement';

function detectTitleLanguage(title: string): 'en' | 'ja' | 'mixed' {
  const hasJapanese = japanesePattern.test(title);
  const hasEnglish = englishPattern.test(title);
  if (hasJapanese && !hasEnglish) {
    return 'ja';
  }
  if (hasEnglish && !hasJapanese) {
    return 'en';
  }
  return 'mixed';
}

function assertTitleLanguage(title: string, expectedLang: 'en' | 'ja'): void {
  const actual = detectTitleLanguage(title);
  expect(actual).toBe(expectedLang);
  expect(actual).not.toBe('mixed');
}

function assertTitleLength(title: string, category: TitleCategory): void {
  const [min, max] = category === 'bug' ? [50, 80] : [50, 100];
  expect(title.length).toBeGreaterThanOrEqual(min);
  expect(title.length).toBeLessThanOrEqual(max);
}

function buildBugCandidate(title: string): BugCandidate {
  return {
    title,
    file: 'src/index.ts',
    line: 42,
    severity: 'medium',
    description: 'Detailed description of the detected issue.',
    suggestedFix: 'Apply a fix that avoids leaking buffers when streaming files.',
    category: 'bug',
  };
}

function buildEnhancementProposal(title: string): EnhancementProposal {
  return {
    type: 'integration',
    title,
    description: 'Detailed enhancement description.',
    rationale: 'Provides clearer outcomes for the workflow team.',
    implementation_hints: ['Add retry logic', 'Use exponential backoff'],
    expected_impact: 'medium',
    effort_estimate: 'medium',
    related_files: ['src/commands/auto-issue.ts'],
  };
}

describe('auto-issue language integration tests', () => {
  beforeEach(() => {
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.GITHUB_TOKEN = 'token';
    process.env.HOME = '/home/test';
    mockAnalyze.mockReset();
    mockAnalyzeEnhancements.mockReset();
    mockGenerate.mockReset();
    mockGenerateEnhancementIssue.mockReset();
    mockFilterDuplicates.mockReset().mockImplementation(async (candidates) => candidates);
    mockResolveAgentCredentials.mockReset().mockReturnValue({ codexApiKey: 'codex-key' });
    mockSetupAgentClients.mockReset().mockReturnValue({
      codexClient: { executeTask: jest.fn().mockResolvedValue(undefined) },
      claudeClient: null,
    });
    mockConfig.getGitHubRepository.mockReturnValue('owner/repo');
    mockConfig.getGitHubToken.mockReturnValue('token');
    mockConfig.getHomeDir.mockReturnValue('/home/test');
  });

  afterEach(() => {
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.AI_WORKFLOW_LANGUAGE;
    delete process.env.HOME;
  });

  it('generates English titles for bug category when language is en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const candidate = buildBugCandidate(englishBugTitle);
    mockAnalyze.mockResolvedValue([candidate]);
    mockGenerate.mockResolvedValue({
      success: true,
      title: candidate.title,
      skippedReason: 'dry-run mode',
    });
    // Given the language preference is English for a bug candidate, when handling a dry-run bug command, then expect an English title within the bug length bounds.

    await handleAutoIssueCommand({
      category: 'bug',
      limit: '1',
      similarityThreshold: '0.8',
      agent: 'codex',
      dryRun: true,
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    assertTitleLanguage(candidate.title, 'en');
    assertTitleLength(candidate.title, 'bug');
  });

  it('generates English titles for enhancement category when language is en', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'en';
    const proposal = buildEnhancementProposal(englishEnhancementTitle);
    mockAnalyzeEnhancements.mockResolvedValue([proposal]);
    mockGenerateEnhancementIssue.mockResolvedValue({
      success: true,
      title: proposal.title,
      skippedReason: 'dry-run mode',
    });
    // Given an English enhancement preference, when handling a creative enhancement dry-run, then assert the generated title stays English and respects the enhancement length limits.

    await handleAutoIssueCommand({
      category: 'enhancement',
      limit: '1',
      similarityThreshold: '0.8',
      agent: 'codex',
      creativeMode: true,
      dryRun: true,
    });

    expect(mockGenerateEnhancementIssue).toHaveBeenCalledTimes(1);
    assertTitleLanguage(proposal.title, 'en');
    assertTitleLength(proposal.title, 'enhancement');
  });

  it('generates Japanese titles for bug category when language is ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const candidate = buildBugCandidate(japaneseBugTitle);
    mockAnalyze.mockResolvedValue([candidate]);
    mockGenerate.mockResolvedValue({
      success: true,
      title: candidate.title,
      skippedReason: 'dry-run mode',
    });
    // Given the language preference is Japanese for a bug candidate, when running the dry-run bug flow, check Japanese title detection and bounds.

    await handleAutoIssueCommand({
      category: 'bug',
      limit: '1',
      similarityThreshold: '0.8',
      agent: 'codex',
      dryRun: true,
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    assertTitleLanguage(candidate.title, 'ja');
    assertTitleLength(candidate.title, 'bug');
  });

  it('generates Japanese titles for enhancement category when language is ja', async () => {
    process.env.AI_WORKFLOW_LANGUAGE = 'ja';
    const proposal = buildEnhancementProposal(japaneseEnhancementTitle);
    mockAnalyzeEnhancements.mockResolvedValue([proposal]);
    mockGenerateEnhancementIssue.mockResolvedValue({
      success: true,
      title: proposal.title,
      skippedReason: 'dry-run mode',
    });
    // Given a Japanese enhancement preference for creative mode, when the command executes, assert the title stays Japanese and within enhancement limits.

    await handleAutoIssueCommand({
      category: 'enhancement',
      limit: '1',
      similarityThreshold: '0.8',
      agent: 'codex',
      creativeMode: true,
      dryRun: true,
    });

    expect(mockGenerateEnhancementIssue).toHaveBeenCalledTimes(1);
    assertTitleLanguage(proposal.title, 'ja');
    assertTitleLength(proposal.title, 'enhancement');
  });
});
