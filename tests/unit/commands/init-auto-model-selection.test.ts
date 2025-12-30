import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';

const gitMock = {
  fetch: jest.fn().mockResolvedValue(undefined),
  branch: jest.fn().mockResolvedValue({ all: [] }),
  branchLocal: jest.fn().mockResolvedValue({ all: [] }),
  checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
  checkoutBranch: jest.fn().mockResolvedValue(undefined),
  checkout: jest.fn().mockResolvedValue(undefined),
  pull: jest.fn().mockResolvedValue(undefined),
  revparse: jest.fn().mockResolvedValue('abc123'),
  remote: jest.fn().mockResolvedValue('git@github.com:owner/repo.git'),
};

jest.unstable_mockModule('simple-git', () => ({
  __esModule: true,
  default: jest.fn(() => gitMock),
}));

const workflowStateMock = {
  createNew: jest.fn(),
  load: jest.fn(),
};
jest.unstable_mockModule('../../../src/core/workflow-state.js', () => ({
  __esModule: true,
  WorkflowState: workflowStateMock,
}));

const metadataInstances: any[] = [];
jest.unstable_mockModule('../../../src/core/metadata-manager.js', () => ({
  __esModule: true,
  MetadataManager: class {
    data: any;
    constructor() {
      this.data = {
        target_repository: { repo: 'repo', path: '/tmp/repo' },
      };
      metadataInstances.push(this);
    }
    setDifficultyAnalysis = jest.fn((value) => {
      this.data.difficulty_analysis = value;
    });
    getDifficultyAnalysis = jest.fn(() => this.data.difficulty_analysis ?? null);
    setModelConfig = jest.fn((value) => {
      this.data.model_config = value;
    });
    getModelConfig = jest.fn(() => this.data.model_config ?? null);
    setBaseCommit = jest.fn();
    getLanguage = jest.fn(() => this.data.language ?? null);
    setLanguage = jest.fn((value) => {
      this.data.language = value;
    });
    save = jest.fn();
  },
}));

const gitManagerMock = {
  commitWorkflowInit: jest.fn().mockResolvedValue({ success: true, commit_hash: 'abcdef123456' }),
  pushToRemote: jest.fn().mockResolvedValue({ success: true }),
  commitPhaseOutput: jest.fn().mockResolvedValue({ success: true }),
  getStatus: jest.fn(),
};
jest.unstable_mockModule('../../../src/core/git-manager.js', () => ({
  __esModule: true,
  GitManager: class {
    constructor() {
      return gitManagerMock;
    }
  },
}));

const githubClientMock = {
  getIssue: jest.fn().mockResolvedValue({
    title: 'Test Issue',
    body: 'Issue body',
    labels: [{ name: 'enhancement' }],
  }),
  checkExistingPr: jest.fn().mockResolvedValue({ pr_url: 'https://example.com/pr', pr_number: 99 }),
  getIssueInfo: jest.fn(),
  generatePrBodyTemplate: jest.fn().mockReturnValue(''),
  createPullRequest: jest.fn(),
};
jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {
      return githubClientMock;
    }
  },
}));

const analyzerMock = { analyze: jest.fn() };
jest.unstable_mockModule('../../../src/core/difficulty-analyzer.js', () => ({
  __esModule: true,
  DifficultyAnalyzer: class {
    constructor() {
      return analyzerMock;
    }
  },
}));

const modelOptimizerMock = {
  generateModelConfig: jest.fn().mockReturnValue({
    planning: {
      execute: { claudeModel: 'opus', codexModel: 'max' },
      review: { claudeModel: 'sonnet', codexModel: 'mini' },
      revise: { claudeModel: 'opus', codexModel: 'max' },
    },
  }),
};
jest.unstable_mockModule('../../../src/core/model-optimizer.js', () => ({
  __esModule: true,
  ModelOptimizer: class {
    constructor() {
      return modelOptimizerMock;
    }
  },
  DEFAULT_DIFFICULTY_MODEL_MAPPING: {} as any,
}));

jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: jest.fn(),
  setupAgentClients: jest.fn().mockReturnValue({ codexClient: {}, claudeClient: {} }),
}));

jest.unstable_mockModule('../../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubToken: jest.fn(() => 'token'),
    getReposRoot: jest.fn(() => null),
    getHomeDir: jest.fn(() => '/tmp'),
    getLogLevel: jest.fn(() => 'info'),
    getLogNoColor: jest.fn(() => true),
    getClaudeModel: jest.fn(),
    getCodexModel: jest.fn(),
    getLanguage: jest.fn(() => 'ja'),
  },
}));

jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  parseIssueUrl: jest.fn(() => ({
    owner: 'owner',
    repo: 'repo',
    repositoryName: 'owner/repo',
    issueNumber: 1,
  })),
  resolveLocalRepoPath: jest.fn(() => '/tmp/repo'),
  getRepoRoot: jest.fn(async () => '/tmp/repo'),
  sanitizeGitUrl: jest.fn((url: string) => url),
}));

let handleInitCommand: typeof import('../../../src/commands/init.js').handleInitCommand;

beforeAll(async () => {
  ({ handleInitCommand } = await import('../../../src/commands/init.js'));
});

afterEach(() => {
  jest.clearAllMocks();
  metadataInstances.length = 0;
  analyzerMock.analyze.mockReset();
  fs.removeSync('/tmp/repo/.ai-workflow');
});

describe('init command - auto model selection', () => {
  it('runs difficulty analysis and stores model config when enabled (TC-INIT-002)', async () => {
    // Given
    const tempRepo = path.join(process.cwd(), 'tmp-init-auto');
    await fs.ensureDir(tempRepo);
    analyzerMock.analyze.mockResolvedValue({
      level: 'complex',
      confidence: 0.9,
      factors: { estimated_file_changes: 5, scope: 'single_module', requires_tests: true, requires_architecture_change: false, complexity_score: 0.8 },
      analyzed_at: '2025-01-01T00:00:00Z',
      analyzer_agent: 'claude',
      analyzer_model: 'sonnet',
    });

    // When
    await handleInitCommand('https://github.com/owner/repo/issues/1', undefined, true);

    // Then
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
    expect(metadataInstances[0].data.difficulty_analysis.level).toBe('complex');
    expect(metadataInstances[0].data.model_config.planning.execute).toEqual({ claudeModel: 'opus', codexModel: 'max' });
    expect(gitManagerMock.commitWorkflowInit).toHaveBeenCalled();
  });

  it('skips difficulty analysis when disabled (TC-INIT-001)', async () => {
    // When
    await handleInitCommand('https://github.com/owner/repo/issues/1', undefined, false);

    // Then
    expect(analyzerMock.analyze).not.toHaveBeenCalled();
    expect(metadataInstances[0].data.difficulty_analysis).toBeUndefined();
    expect(metadataInstances[0].data.model_config).toBeUndefined();
  });

  it('continues workflow when analysis fails (TC-INIT-003)', async () => {
    // Given: analysis fails but init should proceed with defaults
    const tempRepo = path.join(process.cwd(), 'tmp-init-auto');
    await fs.ensureDir(tempRepo);
    analyzerMock.analyze.mockRejectedValue(new Error('analysis failed'));

    // When
    await handleInitCommand('https://github.com/owner/repo/issues/1', undefined, true);

    // Then
    expect(analyzerMock.analyze).toHaveBeenCalledTimes(1);
    expect(metadataInstances[0].data.model_config).toBeUndefined();
    expect(gitManagerMock.commitWorkflowInit).toHaveBeenCalled();
  });
});
