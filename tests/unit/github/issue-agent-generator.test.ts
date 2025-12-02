import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import {
  IssueAgentGenerator,
  type FollowUpContext,
  type GeneratedIssue,
} from '../../../src/core/github/issue-agent-generator.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import type { RemainingTask, IssueContext } from '../../../src/types.js';

// Mock agent clients
type CodexMock = jest.Mocked<CodexAgentClient>;
type ClaudeMock = jest.Mocked<ClaudeAgentClient>;

function createCodexMock(): CodexMock {
  return {
    executeTask: jest.fn<(options: { prompt: string }) => Promise<string[]>>(),
  } as unknown as CodexMock;
}

function createClaudeMock(): ClaudeMock {
  return {
    executeTask: jest.fn<(options: { prompt: string }) => Promise<string[]>>(),
  } as unknown as ClaudeMock;
}

// Test data
const NORMAL_REMAINING_TASKS: RemainingTask[] = [
  {
    task: 'ユニットテスト追加',
    phase: 'testing',
    targetFiles: [
      'src/core/github/issue-agent-generator.ts',
      'tests/unit/core/github/issue-agent-generator.test.ts',
    ],
    steps: [
      'テストファイル作成',
      'モック作成（CodexAgentClient, ClaudeAgentClient）',
      'プロンプト生成テスト追加',
      'ファイル読み込みテスト追加',
      'エラーハンドリングテスト追加',
    ],
    priority: 'high',
    estimatedHours: '2',
    acceptanceCriteria: ['すべてのユニットテストが成功する', 'テストカバレッジが80%以上である'],
  },
  {
    task: 'インテグレーションテスト追加',
    phase: 'testing',
    targetFiles: ['tests/integration/followup-issue-agent.test.ts'],
    steps: ['エンドツーエンドテスト作成', 'フォールバック機構テスト追加', 'GitHub APIモック設定'],
    priority: 'medium',
    estimatedHours: '1.5',
    acceptanceCriteria: [
      'エンドツーエンドフローが成功する',
      'フォールバック時もIssue作成が成功する',
    ],
  },
];

const ISSUE_CONTEXT_NORMAL: IssueContext = {
  summary:
    'Issue #123 では FOLLOW-UP Issue 生成機能をエージェントベースに拡張しました。この Issue は、残ったテストとドキュメント作業を完了するためのものです。',
  blockerStatus: 'すべてのブロッカーは解決済み',
  deferredReason: '実装が優先されたため、テストとドキュメント作業を後回しにしました',
};

const VALID_ISSUE_BODY = `## 背景

Issue #123 では FOLLOW-UP Issue 生成機能をエージェントベースに拡張しました。この Issue は、残ったテストとドキュメント作業を完了するためのものです。

## 目的

各残タスクの目的と期待される成果を具体的に記載します。テストとドキュメント作業を完了することで、Issue #174の実装を完全なものにします。

## 実行内容

### Task 1: ユニットテスト追加

**対象ファイル**:
- \`src/core/github/issue-agent-generator.ts\`
- \`tests/unit/core/github/issue-agent-generator.test.ts\`

**必要な作業**:
1. テストファイル作成
2. モック作成（CodexAgentClient, ClaudeAgentClient）
3. プロンプト生成テスト追加
4. ファイル読み込みテスト追加
5. エラーハンドリングテスト追加

### Task 2: インテグレーションテスト追加

**対象ファイル**:
- \`tests/integration/followup-issue-agent.test.ts\`

**必要な作業**:
1. エンドツーエンドテスト作成
2. フォールバック機構テスト追加
3. GitHub APIモック設定

## 受け入れ基準

- [ ] すべてのユニットテストが成功する
- [ ] テストカバレッジが80%以上である
- [ ] エンドツーエンドフローが成功する
- [ ] フォールバック時もIssue作成が成功する

## 参考情報

- 元Issue: #123
- Evaluation Report: \`.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md\`
`;

describe('IssueAgentGenerator.generate - Codex success', () => {
  let codexClient: CodexMock;
  let claudeClient: ClaudeMock;
  let generator: IssueAgentGenerator;
  let tempFilePath: string;

  beforeEach(() => {
    codexClient = createCodexMock();
    claudeClient = createClaudeMock();
    generator = new IssueAgentGenerator(codexClient, claudeClient);
    tempFilePath = '';
  });

  afterEach(() => {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.removeSync(tempFilePath);
    }
  });

  it('IssueAgentGenerator_generate_正常系_Codex成功', async () => {
    // Given: Codex agent is available and will write a valid Issue body
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
      // Extract output file path from prompt
      const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
      if (match) {
        tempFilePath = match[1];
        fs.writeFileSync(tempFilePath, VALID_ISSUE_BODY);
      }
      return [];
    });

    // When: generate() is called with 'codex' agent
    const result: GeneratedIssue = await generator.generate(context, 'codex');

    // Then: Issue is generated successfully
    expect(result.success).toBe(true);
    expect(result.title).toContain('[FOLLOW-UP]');
    expect(result.title).toContain('#123');
    expect(result.title).toContain('ユニットテスト追加');
    expect(result.body).toContain('## 背景');
    expect(result.body).toContain('## 目的');
    expect(result.body).toContain('## 実行内容');
    expect(result.body).toContain('## 受け入れ基準');
    expect(result.body).toContain('## 参考情報');
    expect(result.body.length).toBeGreaterThan(100);
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClient.executeTask).not.toHaveBeenCalled();
  });
});

describe('IssueAgentGenerator.generate - Claude success', () => {
  let codexClient: CodexMock;
  let claudeClient: ClaudeMock;
  let generator: IssueAgentGenerator;
  let tempFilePath: string;

  beforeEach(() => {
    codexClient = createCodexMock();
    claudeClient = createClaudeMock();
    generator = new IssueAgentGenerator(codexClient, claudeClient);
    tempFilePath = '';
  });

  afterEach(() => {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.removeSync(tempFilePath);
    }
  });

  it('IssueAgentGenerator_generate_正常系_Claude成功', async () => {
    // Given: Only Claude agent is available
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    claudeClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
      // Extract output file path from prompt
      const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
      if (match) {
        tempFilePath = match[1];
        fs.writeFileSync(tempFilePath, VALID_ISSUE_BODY);
      }
      return [];
    });

    // When: generate() is called with 'claude' agent
    const result: GeneratedIssue = await generator.generate(context, 'claude');

    // Then: Issue is generated successfully
    expect(result.success).toBe(true);
    expect(result.title).toContain('[FOLLOW-UP]');
    expect(result.title).toContain('#123');
    expect(result.body).toContain('## 背景');
    expect(result.body).toContain('## 目的');
    expect(result.body).toContain('## 実行内容');
    expect(result.body).toContain('## 受け入れ基準');
    expect(result.body).toContain('## 参考情報');
    expect(claudeClient.executeTask).toHaveBeenCalledTimes(1);
    expect(codexClient.executeTask).not.toHaveBeenCalled();
  });
});

describe('IssueAgentGenerator.generate - auto mode with Codex priority', () => {
  let codexClient: CodexMock;
  let claudeClient: ClaudeMock;
  let generator: IssueAgentGenerator;
  let tempFilePath: string;

  beforeEach(() => {
    codexClient = createCodexMock();
    claudeClient = createClaudeMock();
    generator = new IssueAgentGenerator(codexClient, claudeClient);
    tempFilePath = '';
  });

  afterEach(() => {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.removeSync(tempFilePath);
    }
  });

  it('IssueAgentGenerator_generate_正常系_auto_Codex優先', async () => {
    // Given: Both agents are available
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
      const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
      if (match) {
        tempFilePath = match[1];
        fs.writeFileSync(tempFilePath, VALID_ISSUE_BODY);
      }
      return [];
    });

    // When: generate() is called with 'auto' agent
    const result: GeneratedIssue = await generator.generate(context, 'auto');

    // Then: Codex is used (prioritized)
    expect(result.success).toBe(true);
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClient.executeTask).not.toHaveBeenCalled();
  });
});

describe('IssueAgentGenerator.generate - error handling', () => {
  let codexClient: CodexMock;
  let claudeClient: ClaudeMock;
  let generator: IssueAgentGenerator;

  beforeEach(() => {
    codexClient = createCodexMock();
    claudeClient = createClaudeMock();
    generator = new IssueAgentGenerator(codexClient, claudeClient);
  });

  it('IssueAgentGenerator_generate_異常系_エージェント失敗', async () => {
    // Given: Codex agent throws an error, auto mode
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    codexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));
    claudeClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
      // Extract output file path from prompt
      const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
      if (match) {
        const tempFilePath = match[1];
        fs.writeFileSync(tempFilePath, VALID_ISSUE_BODY);
      }
      return [];
    });

    // When: generate() is called with 'auto' agent
    const result: GeneratedIssue = await generator.generate(context, 'auto');

    // Then: Fallback to Claude succeeds
    expect(result.success).toBe(true);
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClient.executeTask).toHaveBeenCalledTimes(1);
  });

  it('IssueAgentGenerator_generate_異常系_Codexモード失敗', async () => {
    // Given: Codex agent throws an error, codex mode (no fallback)
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    codexClient.executeTask.mockRejectedValue(new Error('Codex API failed'));

    // When: generate() is called with 'codex' agent (no fallback)
    const result: GeneratedIssue = await generator.generate(context, 'codex');

    // Then: Error is returned
    expect(result.success).toBe(false);
    expect(result.error).toContain('Codex failed');
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClient.executeTask).not.toHaveBeenCalled();
  });

  it('IssueAgentGenerator_generate_異常系_出力ファイル不在', async () => {
    // Given: Agent executes but doesn't create output file
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    codexClient.executeTask.mockResolvedValue([]);

    // When: generate() is called
    const result: GeneratedIssue = await generator.generate(context, 'codex');

    // Then: Fallback body is used
    expect(result.success).toBe(true);
    expect(result.body).toContain('## 背景');
    expect(result.body).toContain('## 目的');
    expect(result.body).toContain('## 実行内容');
    expect(result.body).toContain('## 受け入れ基準');
    expect(result.body).toContain('## 参考情報');
    expect(result.body).toContain('フォールバックテンプレート使用');
  });

  it('IssueAgentGenerator_generate_異常系_出力ファイル空', async () => {
    // Given: Output file exists but is empty
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    let tempFilePath = '';
    codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
      const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
      if (match) {
        tempFilePath = match[1];
        fs.writeFileSync(tempFilePath, ''); // Empty file
      }
      return [];
    });

    // When: generate() is called
    const result: GeneratedIssue = await generator.generate(context, 'codex');

    // Then: Fallback body is used
    expect(result.success).toBe(true);
    expect(result.body).toContain('フォールバックテンプレート使用');

    // Cleanup
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.removeSync(tempFilePath);
    }
  });

  it('IssueAgentGenerator_generate_異常系_必須セクション欠落', async () => {
    // Given: Output file exists but missing required sections
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    const invalidBody = `## 背景\n\nテキスト\n\n## 目的\n\nテキスト`;

    let tempFilePath = '';
    codexClient.executeTask.mockImplementation(async (options: { prompt: string }) => {
      const match = options.prompt.match(/output_file_path[^\n]*?([/\\]tmp[/\\]followup-issue-\d+-\w+\.md)/);
      if (match) {
        tempFilePath = match[1];
        fs.writeFileSync(tempFilePath, invalidBody);
      }
      return [];
    });

    // When: generate() is called
    const result: GeneratedIssue = await generator.generate(context, 'codex');

    // Then: Fallback body is used due to validation failure
    expect(result.success).toBe(true);
    expect(result.body).toContain('フォールバックテンプレート使用');

    // Cleanup
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.removeSync(tempFilePath);
    }
  });
});

describe('IssueAgentGenerator.generateTitle', () => {
  let generator: IssueAgentGenerator;

  beforeEach(() => {
    generator = new IssueAgentGenerator(null, null);
  });

  it('IssueAgentGenerator_generateTitle_正常系_キーワード抽出', () => {
    // Given: Remaining tasks with keywords
    const tasks: RemainingTask[] = [
      { task: 'ユニットテスト追加（issue-agent-generator）', phase: 'testing', priority: 'high' },
      { task: 'インテグレーションテスト追加（エンドツーエンド）', phase: 'testing', priority: 'medium' },
      { task: 'ドキュメント更新（README）', phase: 'documentation', priority: 'low' },
    ];

    // When: generateTitle() is called
    const title = (generator as any).generateTitle(123, tasks);

    // Then: Title contains extracted keywords
    expect(title).toContain('[FOLLOW-UP]');
    expect(title).toContain('#123');
    expect(title).toContain('ユニットテスト追加');
    expect(title.length).toBeLessThanOrEqual(80);
  });

  it('IssueAgentGenerator_generateTitle_正常系_長さ制限', () => {
    // Given: Tasks with very long names
    const tasks: RemainingTask[] = [
      { task: '非常に長いタスク名で80文字を超える可能性がある場合のテスト（詳細説明部分）', phase: 'implementation', priority: 'high' },
      { task: '別の長いタスク名（追加説明）', phase: 'implementation', priority: 'medium' },
    ];

    // When: generateTitle() is called
    const title = (generator as any).generateTitle(123, tasks);

    // Then: Title is truncated
    expect(title.length).toBeLessThanOrEqual(80);
    if (title.length === 80) {
      expect(title).toMatch(/\.\.\.$/);
    }
  });

  it('IssueAgentGenerator_generateTitle_異常系_キーワードなし', () => {
    // Given: Tasks with empty or null task names
    const tasks: RemainingTask[] = [
      { task: '', phase: 'implementation', priority: 'low' },
      { task: null as any, phase: 'implementation', priority: 'low' }
    ];

    // When: generateTitle() is called
    const title = (generator as any).generateTitle(123, tasks);

    // Then: Fallback title is used
    expect(title).toBe('[FOLLOW-UP] Issue #123 - 残タスク');
  });
});

describe('IssueAgentGenerator.isValidIssueContent', () => {
  let generator: IssueAgentGenerator;

  beforeEach(() => {
    generator = new IssueAgentGenerator(null, null);
  });

  it('IssueAgentGenerator_isValidIssueContent_正常系', () => {
    // Given: Valid issue content with all required sections
    const validContent = VALID_ISSUE_BODY;

    // When: isValidIssueContent() is called
    const isValid = (generator as any).isValidIssueContent(validContent);

    // Then: Returns true
    expect(isValid).toBe(true);
  });

  it('IssueAgentGenerator_isValidIssueContent_異常系_セクション欠落', () => {
    // Given: Content missing required sections
    const invalidContent = `## 背景\n\nテキスト\n\n## 目的\n\nテキスト\n\n## 実行内容\n\nテキスト`;

    // When: isValidIssueContent() is called
    const isValid = (generator as any).isValidIssueContent(invalidContent);

    // Then: Returns false
    expect(isValid).toBe(false);
  });

  it('IssueAgentGenerator_isValidIssueContent_異常系_文字数不足', () => {
    // Given: Content too short
    const shortContent = `## 背景\n短い\n## 目的\n短い`;

    // When: isValidIssueContent() is called
    const isValid = (generator as any).isValidIssueContent(shortContent);

    // Then: Returns false
    expect(isValid).toBe(false);
  });
});

describe('IssueAgentGenerator.createFallbackBody', () => {
  let generator: IssueAgentGenerator;

  beforeEach(() => {
    generator = new IssueAgentGenerator(null, null);
  });

  it('IssueAgentGenerator_createFallbackBody_正常系', () => {
    // Given: Context with remaining tasks
    const context: FollowUpContext = {
      remainingTasks: NORMAL_REMAINING_TASKS,
      issueContext: ISSUE_CONTEXT_NORMAL,
      issueNumber: 123,
      evaluationReportPath: '.ai-workflow/issue-123/09_evaluation/output/evaluation_report.md',
    };

    // When: createFallbackBody() is called
    const body = (generator as any).createFallbackBody(context);

    // Then: Body contains all required sections
    expect(body).toContain('## 背景');
    expect(body).toContain('## 目的');
    expect(body).toContain('## 実行内容');
    expect(body).toContain('## 受け入れ基準');
    expect(body).toContain('## 参考情報');
    expect(body).toContain('元Issue: #123');
    expect(body).toContain('フォールバックテンプレート使用');
    expect(body).toContain('ユニットテスト追加');
    expect(body).toContain('インテグレーションテスト追加');
  });
});
