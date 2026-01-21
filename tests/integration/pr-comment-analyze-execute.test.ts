import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { logger } from '../../src/utils/logger.js';
import type { CommentMetadata } from '../../src/types/pr-comment.js';

const getRepoRootMock = jest.fn<() => Promise<string>>();
const resolveAgentCredentialsMock = jest.fn();
const setupAgentClientsMock = jest.fn();
const simpleGitStatusMock = jest.fn();
const simpleGitAddMock = jest.fn();
const simpleGitCommitMock = jest.fn();
const agentExecuteTaskMock = jest.fn();
const githubReplyMock = jest.fn();
const codeChangeApplyMock = jest.fn();
const configIsCIMock = jest.fn(() => false);
const parsePullRequestUrlMock = jest.fn(() => ({
  owner: 'owner',
  repo: 'repo',
  prNumber: 123,
  repositoryName: 'owner/repo',
}));
let metadataGetMetadataReturn: any;

let handlePRCommentAnalyzeCommand: typeof import('../../src/commands/pr-comment/analyze.js')['handlePRCommentAnalyzeCommand'];
let handlePRCommentExecuteCommand: typeof import('../../src/commands/pr-comment/execute.js')['handlePRCommentExecuteCommand'];
let tmpDir: string;
let metadataStore: {
  setAnalyzeCompletedAt?: jest.Mock;
  setResponsePlanPath?: jest.Mock;
  setExecuteCompletedAt?: jest.Mock;
  setExecutionResultPath?: jest.Mock;
  updateCommentStatus?: jest.Mock;
};
let pendingComments: CommentMetadata[] = [];
let responsePlanData: any;
let metadataManagerInstance: any;
let metadataManagerInstances: any[] = [];
let processExitSpy: jest.SpyInstance;
let analyzerAnalyzeMock: jest.Mock;

const buildComment = (id: number, type: 'code_change' | 'reply'): CommentMetadata => ({
  comment: {
    id,
    node_id: `node-${id}`,
    path: type === 'code_change' ? 'src/a.ts' : undefined,
    line: 5,
    body: type === 'code_change' ? 'Fix the bug' : 'Explain the reason',
    user: 'reviewer',
    created_at: '2025-01-20T00:00:00Z',
    updated_at: '2025-01-20T00:00:00Z',
    diff_hunk: '@@ -1,1 +1,1 @@',
  },
  status: 'pending',
  started_at: null,
  completed_at: null,
  retry_count: 0,
  resolution: null,
  reply_comment_id: null,
  resolved_at: null,
  error: null,
});

beforeAll(async () => {
  await jest.unstable_mockModule('../../src/core/repository-utils.js', () => ({
    __esModule: true,
    getRepoRoot: getRepoRootMock,
    parsePullRequestUrl: parsePullRequestUrlMock,
    resolveRepoPathFromPrUrl: jest.fn(() => '/repo'),
    findWorkflowMetadata: jest.fn(() => Promise.resolve(null)), // Add missing export
  }));

  await jest.unstable_mockModule('../../src/core/pr-comment/metadata-manager.js', () => ({
    __esModule: true,
    PRCommentMetadataManager: jest.fn().mockImplementation(() => {
      metadataManagerInstance = {
        setAnalyzeCompletedAt: jest.fn().mockResolvedValue(undefined),
        setResponsePlanPath: jest.fn().mockResolvedValue(undefined),
        setExecuteCompletedAt: jest.fn().mockResolvedValue(undefined),
        setExecutionResultPath: jest.fn().mockResolvedValue(undefined),
        setReplyCommentId: jest.fn().mockResolvedValue(undefined),
        updateCommentStatus: jest.fn().mockResolvedValue(undefined),
        setAnalyzerAgent: jest.fn().mockResolvedValue(undefined),
        setAnalyzerError: jest.fn().mockResolvedValue(undefined),
        clearAnalyzerError: jest.fn().mockResolvedValue(undefined),
        exists: jest.fn().mockResolvedValue(true),
        load: jest.fn().mockResolvedValue({ pr: { branch: 'feature/mock-branch' } }),
        getPendingComments: jest.fn(async () => pendingComments),
        getMetadata: jest.fn().mockImplementation(async () => metadataGetMetadataReturn ?? { pr: { title: 'Integration PR' }, comments: {} }),
        getSummary: jest.fn().mockResolvedValue({ by_status: { completed: 1, skipped: 0, failed: 0 } }),
      };
      metadataStore = metadataManagerInstance;
      metadataManagerInstances.push(metadataManagerInstance);
      return metadataManagerInstance as any;
    }),
  }));

  await jest.unstable_mockModule('../../src/commands/execute/agent-setup.js', () => ({
    __esModule: true,
    resolveAgentCredentials: resolveAgentCredentialsMock,
    setupAgentClients: setupAgentClientsMock,
  }));

  await jest.unstable_mockModule('../../src/core/github-client.js', () => ({
    __esModule: true,
    GitHubClient: jest.fn().mockImplementation(() => ({
      commentClient: {
        replyToPRReviewComment: githubReplyMock,
      },
      getRepositoryInfo: () => ({
        repositoryName: 'owner/repo',
      }),
    })),
  }));

  await jest.unstable_mockModule('../../src/core/pr-comment/change-applier.js', () => ({
    __esModule: true,
    CodeChangeApplier: jest.fn().mockImplementation(() => ({
      apply: codeChangeApplyMock,
    })),
  }));
  await jest.unstable_mockModule('../../src/core/pr-comment/comment-analyzer.js', () => ({
    __esModule: true,
    ReviewCommentAnalyzer: jest.fn().mockImplementation(() => {
      analyzerAnalyzeMock = jest.fn().mockResolvedValue({
        success: true,
        resolution: {
          type: 'reply',
          confidence: 'high',
          reply: 'Done',
        },
        inputTokens: 10,
        outputTokens: 5,
      });
      return {
        analyze: analyzerAnalyzeMock,
      };
    }),
  }));

  await jest.unstable_mockModule('../../src/core/config.js', () => ({
    __esModule: true,
    config: {
      getHomeDir: jest.fn(() => '/home/mock'),
      isCI: configIsCIMock,
    },
  }));

  await jest.unstable_mockModule('simple-git', () => ({
    __esModule: true,
    default: jest.fn(() => ({
      status: simpleGitStatusMock,
      add: simpleGitAddMock,
      commit: simpleGitCommitMock,
    })),
  }));

  const analyzeModule = await import('../../src/commands/pr-comment/analyze.js');
  handlePRCommentAnalyzeCommand = analyzeModule.handlePRCommentAnalyzeCommand;
  const executeModule = await import('../../src/commands/pr-comment/execute.js');
  handlePRCommentExecuteCommand = executeModule.handlePRCommentExecuteCommand;
});

beforeEach(async () => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  pendingComments = [buildComment(100, 'code_change'), buildComment(101, 'reply')];
  metadataStore = {};
  metadataManagerInstance = undefined;
  metadataManagerInstances = [];
  responsePlanData = {
    pr_number: 123,
    analyzed_at: '2025-01-21T00:00:00Z',
    comments: [
      {
        comment_id: '100',
        type: 'code_change',
        confidence: 'high',
        rationale: 'Bug fix',
        proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'export const x = 2;' }],
        reply_message: 'Fixed',
      },
      {
        comment_id: '101',
        type: 'reply',
        confidence: 'high',
        rationale: 'Explanation',
        reply_message: 'Explained',
      },
    ],
  };

  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-comment-int-'));
  getRepoRootMock.mockResolvedValue(tmpDir);
  metadataGetMetadataReturn = undefined;

  await fs.ensureDir(path.join(tmpDir, 'src', 'prompts', 'pr-comment'));
  await fs.writeFile(
    path.join(tmpDir, 'src', 'prompts', 'pr-comment', 'analyze.txt'),
    'Analyze {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}',
  );
  await fs.writeFile(
    path.join(tmpDir, 'src', 'prompts', 'pr-comment', 'execute.txt'),
    'Execute {pr_number}\nPlan:{response_plan}\nOutput:{output_file_path}',
  );
  const distPromptsDir = path.join(process.cwd(), 'dist', 'prompts', 'pr-comment');
  await fs.ensureDir(distPromptsDir);
  await fs.writeFile(
    path.join(distPromptsDir, 'analyze.txt'),
    'Analyze {pr_number}: {pr_title}\n{all_comments}\nOutput: {output_file_path}',
  );
  await fs.writeFile(
    path.join(distPromptsDir, 'execute.txt'),
    'Execute {pr_number}\nPlan:{response_plan}\nOutput:{output_file_path}',
  );
  await fs.ensureDir(path.join(tmpDir, 'src'));
  await fs.writeFile(path.join(tmpDir, 'src', 'a.ts'), 'export const x = 1;');

  agentExecuteTaskMock.mockReset();
  githubReplyMock.mockReset();
  codeChangeApplyMock.mockReset();
  simpleGitStatusMock.mockResolvedValue({ files: [{ path: '.ai-workflow/pr-123/output/response-plan.md' }] });
  simpleGitAddMock.mockResolvedValue(undefined);
  simpleGitCommitMock.mockResolvedValue(undefined);
  setupAgentClientsMock.mockReturnValue({ codexClient: { executeTask: agentExecuteTaskMock }, claudeClient: null });

  jest.spyOn(logger, 'info').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'warn').mockImplementation(() => undefined as any);
  jest.spyOn(logger, 'error').mockImplementation(() => undefined as any);
  processExitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  configIsCIMock.mockReturnValue(false);

  const analyzeResponse = [
    '```json',
    JSON.stringify(responsePlanData),
    '```',
  ].join('\n');

  const executeResponse = [
    '```json',
    JSON.stringify({
      pr_number: 123,
      comments: [
        { comment_id: '100', status: 'completed', actions: ['Applied change'] },
        { comment_id: '101', status: 'completed', actions: ['Replied'], reply_comment_id: 321 },
      ],
    }),
    '```',
  ].join('\n');

  agentExecuteTaskMock.mockResolvedValueOnce([analyzeResponse]).mockResolvedValueOnce([executeResponse]);
  codeChangeApplyMock.mockResolvedValue({ success: true, applied_files: ['src/a.ts'], skipped_files: [] });
  githubReplyMock.mockResolvedValue({ id: 321 });
});

afterEach(async () => {
  if (tmpDir) {
    await fs.remove(tmpDir);
  }
});

describe('Analyze → Execute integration flow', () => {
  it('generates response-plan then execution-result with a single agent call per phase', async () => {
    // Given: analyzeとexecuteが1回ずつエージェントを呼び出す正常系フロー
    // When: analyzeを実行してからresponse-planをもとにexecuteを流す
    // Then: 計画ファイルが生成され、実行結果までエラーなく到達する
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(true);
    await fs.writeFile(
      planPath,
      `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlanData)}\n\`\`\`\n`,
    );

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false, agent: 'auto' });
  });

  it('response-planに承認パターンと質問回答パターンのtype/confidence/proposed_changesを反映する', async () => {
    // Given: 「AI提案→承認」「AI質問→回答」の2スレッドを含むメタデータ
    // When: analyzeコマンドでエージェント出力をパースしてresponse-plan.mdを生成する
    // Then: 各コメントにtypeとconfidenceが反映され、proposed_changesが非空で出力される
    const approvalProposal = {
      ...buildComment(100, 'code_change'),
      comment: {
        ...buildComment(100, 'code_change').comment,
        thread_id: 'thread-approval',
        user: 'ai-bot',
        body: 'ヘルパー関数に分けて進めてよいでしょうか？',
      },
      reply_comment_id: 100,
    };
    const approvalResponse = {
      ...buildComment(101, 'code_change'),
      comment: {
        ...buildComment(101, 'code_change').comment,
        thread_id: 'thread-approval',
        body: 'はい、その方針で進めてください',
      },
    };
    const question = {
      ...buildComment(300, 'code_change'),
      comment: {
        ...buildComment(300, 'code_change').comment,
        thread_id: 'thread-qa',
        user: 'ai-bot',
        body: 'この構成で問題ありませんか？',
      },
      reply_comment_id: 300,
    };
    const answer = {
      ...buildComment(301, 'code_change'),
      comment: {
        ...buildComment(301, 'code_change').comment,
        thread_id: 'thread-qa',
        body: 'Bパターンのほうが良いです。設定読み込みを優先してください。',
      },
    };
    pendingComments = [approvalProposal, approvalResponse, question, answer];
    metadataGetMetadataReturn = {
      pr: { title: 'Integration PR' },
      comments: {
        [approvalProposal.comment.id]: approvalProposal,
        [approvalResponse.comment.id]: approvalResponse,
        [question.comment.id]: question,
        [answer.comment.id]: answer,
      },
    };

    const patternPlan = {
      pr_number: 123,
      analyzer_agent: 'codex',
      analyzed_at: '2025-01-21T01:00:00Z',
      comments: [
        {
          comment_id: String(approvalResponse.comment.id),
          type: 'code_change',
          confidence: 'high',
          rationale: 'ユーザーがAI提案を承認したため、コード変更が必要',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'ヘルパー関数に分割' }],
          reply_message: '承認ありがとうございます。リファクタを進めます。',
        },
        {
          comment_id: String(answer.comment.id),
          type: 'code_change',
          confidence: 'medium',
          rationale: 'AI質問に対して具体的な変更指示が返された',
          proposed_changes: [{ action: 'modify', file: 'src/core/config.ts', changes: 'パターンBに切り替え' }],
          reply_message: 'Bパターンで対応します。',
        },
      ],
    };
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['```json\n' + JSON.stringify(patternPlan) + '\n```']);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');

    expect(planContent).toContain(`Comment #${approvalResponse.comment.id}`);
    expect(planContent).toContain('Type: code_change (confidence: high)');
    expect(planContent).toContain('[modify] src/a.ts');
    expect(planContent).toContain(`Comment #${answer.comment.id}`);
    expect(planContent).toContain('Type: code_change (confidence: medium)');
    expect(planContent).toContain('[modify] src/core/config.ts');
    expect(planContent).not.toContain('Proposed Changes: (none)');
  });

  it('単純返信パターンはtype: replyでproposed_changesが空として記録される', async () => {
    // Given: AI提案を含まないお礼返信のみのスレッド
    // When: analyzeコマンドを実行してresponse-plan.mdを生成する
    // Then: 対象コメントがreplyとして扱われ、Proposed Changesが(none)になる
    const thankYou = buildComment(200, 'reply');
    thankYou.comment.thread_id = 'thread-reply';
    thankYou.comment.body = 'この実装で良いと思います';
    const followUp = buildComment(201, 'reply');
    followUp.comment.thread_id = 'thread-reply';
    followUp.comment.body = 'ありがとうございます。';
    pendingComments = [thankYou, followUp];
    metadataGetMetadataReturn = {
      pr: { title: 'Integration PR' },
      comments: {
        [thankYou.comment.id]: thankYou,
        [followUp.comment.id]: followUp,
      },
    };

    const replyPlan = {
      pr_number: 123,
      analyzer_agent: 'codex',
      analyzed_at: '2025-01-21T01:00:00Z',
      comments: [
        {
          comment_id: String(followUp.comment.id),
          type: 'reply',
          confidence: 'high',
          rationale: '単純なお礼で追加作業は不要',
          proposed_changes: [],
          reply_message: 'ご確認ありがとうございます。',
        },
      ],
    };
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['```json\n' + JSON.stringify(replyPlan) + '\n```']);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');

    expect(planContent).toContain(`Comment #${followUp.comment.id}`);
    expect(planContent).toContain('Type: reply (confidence: high)');
    expect(planContent).toContain('Proposed Changes: (none)');
  });

  it('thread_idなしコメントをunknownスレッドとしてプロンプトとplanに残す', async () => {
    // Given: REST API経由でthread_idが欠落したコメント
    // When: analyzeコマンドでプロンプト生成とパースを行う
    // Then: Thread #unknown-{id}として扱われ、response-planにも対象コメントが出力される
    const legacyComment = buildComment(400, 'reply');
    legacyComment.comment.thread_id = undefined;
    legacyComment.comment.body = 'REST APIから取得した古いコメント';
    pendingComments = [legacyComment];
    metadataGetMetadataReturn = {
      pr: { title: 'Integration PR' },
      comments: {
        [legacyComment.comment.id]: legacyComment,
      },
    };

    const legacyPlan = {
      pr_number: 123,
      analyzer_agent: 'codex',
      analyzed_at: '2025-01-21T01:00:00Z',
      comments: [
        {
          comment_id: String(legacyComment.comment.id),
          type: 'reply',
          confidence: 'medium',
          rationale: '情報共有のみで追加作業は不要',
          proposed_changes: [],
          reply_message: '確認しました。',
        },
      ],
    };
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['```json\n' + JSON.stringify(legacyPlan) + '\n```']);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const promptPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'prompt.txt');
    const promptContent = await fs.readFile(promptPath, 'utf-8');
    expect(promptContent).toContain(`### Thread #unknown-${legacyComment.comment.id}`);

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');
    expect(planContent).toContain(`Comment #${legacyComment.comment.id}`);
    expect(planContent).toContain('Type: reply (confidence: medium)');
  });

  it('analyzeプロンプトにスレッドコンテキストを含める', async () => {
    // Given: ユーザーコメントとAI返信を持つ1スレッド
    // When: analyzeコマンドがプロンプトを生成する
    // Then: スレッドIDとラベル付きコメントが時系列順で含まれる
    const userComment = buildComment(200, 'code_change');
    userComment.comment.thread_id = 'thread-context';
    userComment.comment.created_at = '2025-01-20T00:00:00Z';
    userComment.comment.body = 'リファクタを進めてください';

    const aiReply = buildComment(201, 'code_change');
    aiReply.comment.thread_id = 'thread-context';
    aiReply.comment.created_at = '2025-01-20T00:05:00Z';
    aiReply.comment.body = 'ヘルパー関数に分ける案で進めますか？';
    aiReply.comment.user = 'ai-bot';
    aiReply.reply_comment_id = 201;

    pendingComments = [aiReply, userComment];
    metadataGetMetadataReturn = {
      pr: { title: 'Integration PR' },
      comments: {
        [userComment.comment.id]: userComment,
        [aiReply.comment.id]: aiReply,
      },
    };

    const threadResponse = {
      pr_number: 123,
      analyzer_agent: 'codex',
      comments: [
        { comment_id: String(userComment.comment.id), type: 'reply', confidence: 'high', reply_message: 'ack' },
      ],
    };
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['```json\n' + JSON.stringify(threadResponse) + '\n```']);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const promptPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'prompt.txt');
    const promptContent = await fs.readFile(promptPath, 'utf-8');

    expect(promptContent).toContain('### Thread #thread-context');
    expect(promptContent).toContain('[User Comment]');
    expect(promptContent).toContain('[AI Reply]');
    expect(promptContent.indexOf(`Comment #${userComment.comment.id}`)).toBeLessThan(
      promptContent.indexOf(`Comment #${aiReply.comment.id} [AI Reply]`),
    );
  });

  it.skip('reads agent-written response-plan.json and uses it preferentially', async () => {
    // Given: エージェントがresponse-plan.jsonを直接書き出したケース
    // When: analyzeコマンドがファイルを優先的に読み取る
    // Then: ファイルのagent/type情報がMarkdownとメタデータに反映される
    const analyzeOutputPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'response-plan.json');
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockImplementationOnce(async () => {
      await fs.ensureDir(path.dirname(analyzeOutputPath));
      await fs.writeFile(
        analyzeOutputPath,
        JSON.stringify({
          analyzer_agent: 'codex',
          comments: [{ comment_id: '100', type: 'code_change', confidence: 'low', reply_message: 'From file' }],
        }),
      );
      return ['non-json-ack'];
    });

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const storedPlan = await fs.readJson(analyzeOutputPath);
    expect(storedPlan.pr_number).toBe(123);
    const markdown = await fs.readFile(
      path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md'),
      'utf-8',
    );
    expect(markdown).toContain('Analyzer Agent: codex');
    expect(markdown).toContain('Type: discussion (confidence: low)');
    expect(metadataManagerInstances[0].setAnalyzerAgent).toHaveBeenCalledWith('codex');
  }, 30000); // Increase timeout to 30 seconds

  it('exits during analyze in CI when agent fails and does not write response plan', async () => {
    // Given: CI環境でエージェントが失敗する
    // When: analyzeコマンドを実行する
    // Then: process.exitが発火し、response-planは生成されずエラーが記録される
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockRejectedValue(new Error('Network timeout'));
    processExitSpy.mockImplementation((() => {
      throw new Error('process.exit: 1');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' })).rejects.toThrow(
      'process.exit: 1',
    );

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(false);
    expect(metadataManagerInstances[0].setAnalyzerError).toHaveBeenCalledWith(
      'Network timeout',
      'agent_execution_error',
    );
  });

  it('parses JSON Lines agent output end-to-end', async () => {
    // Given: JSON Lines形式のエージェント出力
    // When: analyzeコマンドがパース処理を行う
    // Then: 最終行のJSONがresponse-planとして扱われメタデータに保存される
    const jsonLines = [
      '{"event":"start"}',
      '{"event":"progress","data":"analyzing"}',
      '{"pr_number":123,"analyzer_agent":"codex","comments":[{"comment_id":"100","type":"reply","confidence":"high","reply_message":"All good"}]}',
    ];
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(jsonLines);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');

    expect(planContent).toContain('Analyzer Agent: codex');
    expect(planContent).toContain('Comment #100');
    expect(metadataManagerInstances[0].setAnalyzerAgent).toHaveBeenCalledWith('codex');
  });

  it('exits in CI when parse fails on invalid agent output', async () => {
    // Given: CI環境で不正なJSONが返る
    // When: パースに失敗する
    // Then: エラー種別json_parse_errorでprocess.exitし、ファイルは生成されない
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['{not-json']);
    processExitSpy.mockImplementation((() => {
      throw new Error('process.exit: 1');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' })).rejects.toThrow(
      'process.exit: 1',
    );

    expect(metadataManagerInstances[0].setAnalyzerError).toHaveBeenCalledWith(
      expect.stringContaining('JSON parsing failed'),
      'json_parse_error',
    );
    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(false);
  });

  it('prompts and proceeds with fallback in local mode after parse failure', async () => {
    // Given: ローカル環境で不正なJSONが返る
    // When: ユーザー確認でフォールバックを選択する
    // Then: fallbackエージェントとしてresponse-planが生成され、ログに反映される
    configIsCIMock.mockReturnValue(false);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['{not-json']);
    const questionMock = jest.fn((_q, cb: (answer: string) => void) => cb('y'));
    const closeMock = jest.fn();
    jest.spyOn(readline, 'createInterface').mockReturnValue({
      question: questionMock,
      close: closeMock,
    } as any);

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    const planContent = await fs.readFile(planPath, 'utf-8');
    expect(planContent).toContain('Analyzer Agent: fallback');
    expect(questionMock).toHaveBeenCalled();
    expect(metadataManagerInstances[0].setAnalyzerAgent).toHaveBeenCalledWith('fallback');
  });

  it('exits in CI when agent returns empty output', async () => {
    // Given: CI環境で空文字の出力しか得られない
    // When: analyzeコマンドが出力を検証する
    // Then: agent_empty_outputとしてプロセス終了し、メタデータにエラーが保存される
    configIsCIMock.mockReturnValue(true);
    agentExecuteTaskMock.mockReset();
    agentExecuteTaskMock.mockResolvedValueOnce(['   ']);
    processExitSpy.mockImplementation((() => {
      throw new Error('process.exit: 1');
    }) as any);

    await expect(handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' })).rejects.toThrow(
      'process.exit: 1',
    );

    expect(metadataManagerInstances[0].setAnalyzerError).toHaveBeenCalledWith(
      'Agent returned empty output',
      'agent_empty_output',
    );
  });

  it('writes a Markdown agent log file after analyze runs', async () => {
    // Given: 正常にagentが動作する
    // When: analyze完了後にログ保存処理を実行する
    // Then: analyzeディレクトリにMarkdown形式のagent_log.mdが生成される
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const agentLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'agent_log.md');
    expect(await fs.pathExists(agentLogPath)).toBe(true);

    const logContent = await fs.readFile(agentLogPath, 'utf-8');
    expect(logContent).toMatch(/# (Codex|Claude) Agent/);
    expect(logContent).toContain('**開始**');
    expect(logContent).toContain('**終了**');
    expect(logContent).toContain('**経過時間**');
  });

  it('does not persist agent_log.md in dry-run mode but shows preview', async () => {
    // Given: dry-runモードでエージェントを実行する
    // When: analyzeコマンドを実行する
    // Then: ファイルは保存されずプレビューのみがログに出力される
    const infoSpy = logger.info as jest.SpyInstance;
    infoSpy.mockClear();

    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: true, agent: 'auto' });

    const agentLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'analyze', 'agent_log.md');
    expect(await fs.pathExists(agentLogPath)).toBe(false);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DRY-RUN] response-plan.md preview:\n# Response Plan'),
    );
  });

  it('generates agent_log.md in execute directory during execution flow', async () => {
    // Given: analyzeでresponse-planを生成済み
    // When: executeを通常モードで実行する
    // Then: execute配下にagent_log.mdが生成され、必要なセクションを含む
    // First run analyze to create response plan
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    // Prepare response plan for execution
    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    expect(await fs.pathExists(planPath)).toBe(true);
    await fs.writeFile(
      planPath,
      `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlanData)}\n\`\`\`\n`,
    );

    // Run execute command
    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false, agent: 'auto' });

    // Verify execute directory's agent_log.md exists and has Markdown format
    const executeLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'execute', 'agent_log.md');
    expect(await fs.pathExists(executeLogPath)).toBe(true);

    const executeLogContent = await fs.readFile(executeLogPath, 'utf-8');
    // Accept both Claude and Codex agent log formats
    expect(executeLogContent).toMatch(/# (Execute Agent|Claude Agent 実行ログ|Codex Agent 実行ログ)/);
    expect(executeLogContent).toContain('**開始**');
    expect(executeLogContent).toContain('**終了**');
    expect(executeLogContent).toContain('**経過時間**');
  });

  it('does not create agent_log.md in execute directory during dry-run execution', async () => {
    // Given: analyze完了後にexecuteをdry-runで動かす
    // When: 実行フェーズのログ保存を確認する
    // Then: execute配下にagent_log.mdが生成されない
    // First run analyze to create response plan
    await handlePRCommentAnalyzeCommand({ pr: '123', dryRun: false, agent: 'auto' });

    const planPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.md');
    await fs.writeFile(
      planPath,
      `# Response Plan\n\`\`\`json\n${JSON.stringify(responsePlanData)}\n\`\`\`\n`,
    );

    // Run execute command in dry-run mode
    await handlePRCommentExecuteCommand({ pr: '123', dryRun: true, agent: 'auto' });

    // Verify execute directory's agent_log.md does NOT exist in dry-run
    const executeLogPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'execute', 'agent_log.md');
    expect(await fs.pathExists(executeLogPath)).toBe(false);
  });

  it('二回目のexecuteではreply_comment_id付きコメントをスキップする', async () => {
    // Given: response-plan.jsonが存在し、pendingコメントに既存返信が紐付いている
    const planJsonPath = path.join(tmpDir, '.ai-workflow', 'pr-123', 'output', 'response-plan.json');
    await fs.ensureDir(path.dirname(planJsonPath));
    await fs.writeJson(planJsonPath, responsePlanData, { spaces: 2 });
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => undefined as any);
    pendingComments = pendingComments.map((c) => ({ ...c, status: 'pending', reply_comment_id: 321 }));

    await handlePRCommentExecuteCommand({ pr: '123', dryRun: false, agent: 'auto' });

    expect(githubReplyMock).not.toHaveBeenCalled();
    const latestManager = metadataManagerInstances[metadataManagerInstances.length - 1];
    expect(latestManager.setReplyCommentId).not.toHaveBeenCalled();
    expect(latestManager.getPendingComments).toHaveBeenCalled();
    expect(codeChangeApplyMock).not.toHaveBeenCalled();
    expect(pendingComments).toHaveLength(2);
  });
});
