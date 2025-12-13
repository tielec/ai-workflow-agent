import { describe, it, expect, jest, beforeAll, beforeEach, afterEach } from '@jest/globals';

let handleAutoIssueCommand: typeof import('../../src/commands/auto-issue.js').handleAutoIssueCommand;
let InstructionValidator: { validate: jest.Mock };
let RepositoryAnalyzer: jest.Mock;
let resolveAgentCredentials: jest.Mock;
let setupAgentClients: jest.Mock;
let resolveLocalRepoPath: jest.Mock;
let IssueDeduplicator: jest.Mock;
let IssueGenerator: jest.Mock;
let Octokit: jest.Mock;
let config: {
  getGitHubRepository: jest.Mock;
  getGitHubToken: jest.Mock;
  getHomeDir: jest.Mock;
  getReposRoot: jest.Mock;
  getOpenAiApiKey: jest.Mock;
};

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

let analyzerMock: {
  analyze: jest.Mock;
  analyzeForRefactoring: jest.Mock;
  analyzeForEnhancements: jest.Mock;
};
let deduplicatorMock: { filterDuplicates: jest.Mock };
let issueGeneratorMock: { generate: jest.Mock };

beforeAll(async () => {
  config = {
    getGitHubRepository: jest.fn(),
    getGitHubToken: jest.fn(),
    getHomeDir: jest.fn(),
    getReposRoot: jest.fn(),
    getOpenAiApiKey: jest.fn(),
  };

  InstructionValidator = {
    validate: jest.fn(),
  };

  const RepositoryAnalyzerMock = jest.fn();
  const resolveAgentCredentialsMock = jest.fn();
  const setupAgentClientsMock = jest.fn();
  const resolveLocalRepoPathMock = jest.fn();
  const IssueDeduplicatorMock = jest.fn();
  const IssueGeneratorMock = jest.fn();
  const OctokitMock = jest.fn();

  jest.unstable_mockModule('../../src/core/config.js', () => ({
    config,
  }));
  jest.unstable_mockModule('../../src/utils/logger.js', () => ({
    logger,
  }));
  jest.unstable_mockModule('../../src/core/instruction-validator.js', () => ({
    InstructionValidator,
  }));
  jest.unstable_mockModule('../../src/core/repository-analyzer.js', () => ({
    RepositoryAnalyzer: RepositoryAnalyzerMock,
  }));
  jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
    resolveAgentCredentials: resolveAgentCredentialsMock,
    setupAgentClients: setupAgentClientsMock,
  }));
  jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
    resolveLocalRepoPath: resolveLocalRepoPathMock,
  }));
  jest.unstable_mockModule('../../src/core/issue-deduplicator.js', () => ({
    IssueDeduplicator: IssueDeduplicatorMock,
  }));
  jest.unstable_mockModule('../../src/core/issue-generator.js', () => ({
    IssueGenerator: IssueGeneratorMock,
  }));
  jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: OctokitMock,
  }));

  ({ handleAutoIssueCommand } = await import('../../src/commands/auto-issue.js'));
  ({ resolveAgentCredentials, setupAgentClients } = await import(
    '../../src/commands/execute/agent-setup.js'
  ));
  ({ resolveLocalRepoPath } = await import('../../src/core/repository-utils.js'));
  ({ RepositoryAnalyzer } = await import('../../src/core/repository-analyzer.js'));
  ({ IssueDeduplicator } = await import('../../src/core/issue-deduplicator.js'));
  ({ IssueGenerator } = await import('../../src/core/issue-generator.js'));
  ({ Octokit } = await import('@octokit/rest'));
});

beforeEach(() => {
  jest.clearAllMocks();

  analyzerMock = {
    analyze: jest.fn().mockResolvedValue([]),
    analyzeForRefactoring: jest.fn(),
    analyzeForEnhancements: jest.fn(),
  };

  RepositoryAnalyzer.mockImplementation(
    () => analyzerMock as unknown as import('../../src/core/repository-analyzer.js').RepositoryAnalyzer,
  );

  InstructionValidator.validate.mockResolvedValue({
    isValid: true,
    confidence: 'medium',
    reason: 'safe instruction',
    category: 'analysis',
    validationMethod: 'llm',
    validatedAt: new Date().toISOString(),
  });

  deduplicatorMock = {
    filterDuplicates: jest.fn().mockResolvedValue([]),
  };
  IssueDeduplicator.mockImplementation(
    () => deduplicatorMock as unknown as import('../../src/core/issue-deduplicator.js').IssueDeduplicator,
  );

  issueGeneratorMock = {
    generate: jest.fn().mockResolvedValue({ success: true }),
  };
  IssueGenerator.mockImplementation(
    () => issueGeneratorMock as unknown as import('../../src/core/issue-generator.js').IssueGenerator,
  );

  config.getGitHubRepository.mockReturnValue('owner/repo');
  config.getGitHubToken.mockReturnValue('token');
  config.getHomeDir.mockReturnValue('/home/test');
  config.getReposRoot.mockReturnValue('/repos');
  config.getOpenAiApiKey.mockReturnValue('fake-key');

  resolveAgentCredentials.mockReturnValue({
    codexApiKey: 'codex-key',
    claudeCredentialsPath: '/creds',
  });
  setupAgentClients.mockReturnValue({ codexClient: {}, claudeClient: {} });
  resolveLocalRepoPath.mockReturnValue('/repos/repo');

  Octokit.mockImplementation(
    () =>
      ({
        issues: {
          listForRepo: jest.fn().mockResolvedValue({ data: [] }),
        },
      }) as unknown as import('@octokit/rest').Octokit,
  );

  logger.info.mockImplementation(() => {});
  logger.warn.mockImplementation(() => {});
  logger.error.mockImplementation(() => {});
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('auto-issue integration with InstructionValidator', () => {
  it('validates custom instruction before repository analysis', async () => {
    // 安全なカスタム指示が検証を通過し、リポジトリ分析が実行されることを確認
    await handleAutoIssueCommand({
      category: 'bug',
      limit: '1',
      dryRun: true,
      customInstruction: '削除候補を検出してください',
    });

    expect(InstructionValidator.validate).toHaveBeenCalledWith('削除候補を検出してください');
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
  });

  it('blocks workflow when validation reports unsafe instruction', async () => {
    // 危険な指示が検出された場合にワークフロー全体が中断され、後続処理が行われないことを確認
    InstructionValidator.validate.mockResolvedValueOnce({
      isValid: false,
      confidence: 'high',
      reason: 'execution instruction',
      category: 'execution',
      validationMethod: 'llm',
      validatedAt: new Date().toISOString(),
      errorMessage: 'Unsafe instruction detected',
    });

    await expect(
      handleAutoIssueCommand({
        category: 'bug',
        limit: '1',
        dryRun: true,
        customInstruction: 'このファイルを削除して',
      }),
    ).rejects.toThrow('Unsafe instruction detected');

    expect(analyzerMock.analyze).not.toHaveBeenCalled();
    expect(deduplicatorMock.filterDuplicates).not.toHaveBeenCalled();
    expect(issueGeneratorMock.generate).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('skips validation when custom instruction is not provided', async () => {
    // カスタム指示がない場合は検証をスキップし、通常のワークフローが実行されることを確認
    await handleAutoIssueCommand({
      category: 'bug',
      limit: '1',
      dryRun: true,
    });

    expect(InstructionValidator.validate).not.toHaveBeenCalled();
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
  });

  it('continues workflow when LLM validation falls back to pattern matching', async () => {
    // LLM 検証失敗時にフォールバック結果を受け取り、ワークフローが継続することを確認
    InstructionValidator.validate.mockImplementationOnce(async () => {
      logger.warn('LLM validation failed, falling back to pattern matching: timeout');
      return {
        isValid: true,
        confidence: 'medium',
        reason: 'fallback safe',
        category: 'analysis',
        validationMethod: 'pattern',
        validatedAt: new Date().toISOString(),
      };
    });

    await handleAutoIssueCommand({
      category: 'bug',
      limit: '1',
      dryRun: true,
      customInstruction: 'コードを分析してください',
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('LLM validation failed, falling back to pattern matching'),
    );
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
  });

  it('logs warning for low confidence validation and proceeds', async () => {
    // confidence: low の場合に警告ログが出力され、処理が継続することを確認
    InstructionValidator.validate.mockResolvedValueOnce({
      isValid: true,
      confidence: 'low',
      reason: '曖昧な指示',
      category: 'analysis',
      validationMethod: 'llm',
      validatedAt: new Date().toISOString(),
    });

    await handleAutoIssueCommand({
      category: 'bug',
      limit: '1',
      dryRun: true,
      customInstruction: '曖昧な指示',
    });

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Low confidence validation'));
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
  });

  it('runs full dry-run workflow when validation passes', async () => {
    // dry-run かつ安全な指示の場合に検証・分析・重複排除・Issue 生成が順に呼ばれることを確認
    const candidate = {
      title: 'Bug candidate',
      file: 'src/file.ts',
      line: 10,
      severity: 'medium',
      description: 'Example bug',
      suggestedFix: 'Fix it',
      category: 'bug' as const,
    };

    analyzerMock.analyze.mockResolvedValueOnce([candidate]);
    deduplicatorMock.filterDuplicates.mockResolvedValueOnce([candidate]);

    await handleAutoIssueCommand({
      category: 'bug',
      limit: '3',
      dryRun: true,
      customInstruction: 'セキュリティ脆弱性を検出してください',
    });

    expect(InstructionValidator.validate).toHaveBeenCalledWith('セキュリティ脆弱性を検出してください');
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
    expect(deduplicatorMock.filterDuplicates).toHaveBeenCalledTimes(1);
    expect(issueGeneratorMock.generate).toHaveBeenCalledTimes(1);
    expect(issueGeneratorMock.generate).toHaveBeenCalledWith(candidate, 'auto', true);
  });
});
