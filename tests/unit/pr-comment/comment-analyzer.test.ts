import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { ReviewCommentAnalyzer } from '../../../src/core/pr-comment/comment-analyzer.js';
import { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import { LogFormatter } from '../../../src/phases/formatters/log-formatter.js';
import { logger } from '../../../src/utils/logger.js';
import type { CommentMetadata } from '../../../src/types/pr-comment.js';

describe('ReviewCommentAnalyzer', () => {
  const promptsDir = '/repo/src/prompts';
  const outputDir = '/repo/.ai-workflow/pr-1/analysis';
  const commentMeta: CommentMetadata = {
    comment: {
      id: 100,
      node_id: 'N100',
      path: 'src/core/config.ts',
      line: 10,
      body: 'Please fix this typo',
      user: 'alice',
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
  };

  let analyzer: ReviewCommentAnalyzer;
  let readFileSpy: jest.SpiedFunction<typeof fs.readFile>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2025-01-20T12:00:00Z'));

    jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    readFileSpy = jest.spyOn(fs, 'readFile');

    analyzer = new ReviewCommentAnalyzer(promptsDir, outputDir);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Given various comment texts; When classifying; Then expected categories are returned
  it('classifies comments by keyword patterns', () => {
    expect(analyzer.classifyComment('Fix this bug')).toBe('code_change');
    expect(analyzer.classifyComment('WHY is this needed?')).toBe('question');
    expect(analyzer.classifyComment('Looks good for future refactor')).toBe('discussion');
  });

  // Given a prompt template; When placeholders are replaced; Then prompt contains provided values
  it('builds prompt by replacing placeholders and embedding provided content', async () => {
    const template = [
      'ID:{comment_id}',
      'BODY:{comment_body}',
      'FILE:{file_content}',
      'DESC:{pr_description}',
      'OUTPUT:{output_file_path}',
    ].join('\n');
    readFileSpy.mockResolvedValueOnce(template);

    const prompt = await (analyzer as any).buildPrompt(
      commentMeta,
      { repoPath: '/repo', fileContent: '// test content', prDescription: 'PR body' },
      '/tmp/out.json',
    );

    expect(readFileSpy).toHaveBeenCalledWith(
      path.join(promptsDir, 'pr-comment', 'analyze.txt'),
      'utf-8',
    );
    expect(prompt).toContain('ID:100');
    expect(prompt).toContain('BODY:Please fix this typo');
    expect(prompt).toContain('FILE:// test content');
    expect(prompt).toContain('DESC:PR body');
    expect(prompt).toContain('OUTPUT:/tmp/out.json');
  });

  // Given missing file content; When building prompt; Then placeholder text is injected
  it('falls back to placeholder text when target file is missing', async () => {
    const template = '{file_content}';
    readFileSpy.mockImplementation(async (target: unknown) =>
      String(target).endsWith('analyze.txt') ? template : Promise.reject(new Error('ENOENT')),
    );

    const prompt = await (analyzer as any).buildPrompt(
      { ...commentMeta, comment: { ...commentMeta.comment, path: 'missing.ts' } },
      { repoPath: '/repo' },
      '/tmp/out.json',
    );

    expect(prompt).toContain('(File not found)');
  });

  // Given a low confidence code_change result; When parsing; Then it downgrades to discussion
  it('parses code-block JSON and converts low confidence code_change to discussion', async () => {
    const agentOutput = [
      '```json',
      JSON.stringify({
        type: 'code_change',
        confidence: 'low',
        changes: [{ path: 'src/a.ts', change_type: 'modify', content: 'test' }],
        reply: 'Handled.',
      }),
      '```',
    ].join('\n');
    readFileSpy.mockResolvedValue(agentOutput);

    const result = await (analyzer as any).parseResult('/tmp/out.json');

    expect(result.type).toBe('discussion');
    expect(result.changes).toBeUndefined();
    expect(result.reply).toBe('Handled.');
  });

  // Given unknown resolution type; When parsing; Then it throws validation error
  it('throws when resolution type is invalid', async () => {
    readFileSpy.mockResolvedValue('{ "type": "unknown", "confidence": "high", "reply": "ok" }');

    await expect((analyzer as any).parseResult('/tmp/out.json')).rejects.toThrow(
      'Invalid resolution type',
    );
  });

  // Given agent log context with comment id; When persisting; Then formatter output is written to file
  it('persistAgentLog writes formatted log with comment id', async () => {
    const formatter: LogFormatter = {
      formatAgentLog: jest.fn().mockReturnValue('# formatted log'),
    } as unknown as LogFormatter;

    const context = {
      messages: ['m1', 'm2'],
      startTime: 1,
      endTime: 2,
      duration: 1,
      agentName: 'Codex Agent',
      error: null,
      commentId: 123,
    };

    await (analyzer as any).persistAgentLog(context, '/repo/output', false, formatter);

    expect(fs.ensureDir).toHaveBeenCalledWith('/repo/output');
    expect(formatter.formatAgentLog).toHaveBeenCalledWith(
      context.messages,
      context.startTime,
      context.endTime,
      context.duration,
      context.error,
      context.agentName,
    );
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.normalize('/repo/output/agent_log_comment_123.md'),
      '# formatted log',
      'utf-8',
    );
  });

  // Given Claude agent log; When persisting; Then markdown includes timing and timestamps
  it('persistAgentLog writes markdown content including timing', async () => {
    const formatter = new LogFormatter();
    const context = {
      messages: [
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          duration_ms: 1500,
          num_turns: 2,
          result: 'done',
        }),
      ],
      startTime: 1705747200000,
      endTime: 1705747201500,
      duration: 1500,
      agentName: 'Claude Agent',
      error: null,
      commentId: 321,
    };

    await (analyzer as any).persistAgentLog(context, '/repo/output', false, formatter);

    const [, content] = (fs.writeFile as jest.Mock).mock.calls[0];
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.normalize('/repo/output/agent_log_comment_321.md'),
      expect.any(String),
      'utf-8',
    );
    expect(String(content)).toContain('# Claude Agent 実行ログ');
    expect(String(content)).toContain('**経過時間**: 1500ms');
    // Locale-aware timestamp formatting (ja-JP uses YYYY/M/D format)
    expect(String(content)).toMatch(/\*\*開始\*\*: (2024\/1\/20|2024-01-20)/);
    expect(String(content)).toMatch(/\*\*終了\*\*: (2024\/1\/20|2024-01-20)/);
  });

  // Given formatter failure; When persisting; Then raw messages are saved and warning is logged
  it('persistAgentLog falls back to raw output when formatting fails', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const formatter: LogFormatter = {
      formatAgentLog: jest.fn().mockImplementation(() => {
        throw new Error('format failed');
      }),
    } as unknown as LogFormatter;

    const context = {
      messages: ['msg1', 'msg2', 'msg3'],
      startTime: 10,
      endTime: 20,
      duration: 10,
      agentName: 'Claude Agent',
      error: null,
      commentId: 456,
    };

    await (analyzer as any).persistAgentLog(context, '/repo/output', false, formatter);

    expect(warnSpy).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledWith(
      path.normalize('/repo/output/agent_log_comment_456.md'),
      'msg1\nmsg2\nmsg3',
      'utf-8',
    );
  });

  // Given file write failure; When persisting; Then warning is logged but no throw
  it('persistAgentLog logs warning when file writing fails', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();
    const formatter: LogFormatter = {
      formatAgentLog: jest.fn().mockReturnValue('# formatted log'),
    } as unknown as LogFormatter;
    (fs.writeFile as jest.Mock).mockRejectedValue(new Error('EACCES'));

    const context = {
      messages: ['only message'],
      startTime: 1,
      endTime: 2,
      duration: 1,
      agentName: 'Codex Agent',
      error: null,
      commentId: 777,
    };

    await expect(
      (analyzer as any).persistAgentLog(context, '/repo/output', false, formatter),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to persist agent log: EACCES'),
    );
  });

  // Given dryRun flag; When persisting; Then formatter and writes are skipped
  it('persistAgentLog skips writing when dryRun is true', async () => {
    const formatter: LogFormatter = {
      formatAgentLog: jest.fn(),
    } as unknown as LogFormatter;

    const context = {
      messages: ['skip'],
      startTime: 0,
      endTime: 0,
      duration: 0,
      agentName: 'Codex Agent',
      error: null,
      commentId: 999,
    };

    await (analyzer as any).persistAgentLog(context, '/repo/output', true, formatter);

    expect(formatter.formatAgentLog).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  // Given agent throws; When runAgent executes; Then null result and error persisted with duration
  it('runAgent propagates agent errors to persisted log context', async () => {
    const persistSpy = jest
      .spyOn<any, any>(analyzer as any, 'persistAgentLog')
      .mockResolvedValue(undefined);
    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(2500);

    const agent: CodexAgentClient = { executeTask: jest.fn() } as unknown as CodexAgentClient;
    Object.setPrototypeOf(agent, CodexAgentClient.prototype);
    (agent.executeTask as jest.Mock).mockRejectedValue(new Error('Agent execution failed'));

    const result = await (analyzer as any).runAgent(agent, 'prompt', '/repo', {
      commentId: 5,
      outputDir: '/repo/output',
      dryRun: false,
    });

    expect(result).toBeNull();
    expect(persistSpy).toHaveBeenCalledTimes(1);

    const [context, outputDir, dryRun] = persistSpy.mock.calls[0];
    expect(outputDir).toBe('/repo/output');
    expect(dryRun).toBe(false);
    expect(context.agentName).toBe('Codex Agent');
    expect(context.error).toBeInstanceOf(Error);
    expect((context.error as Error).message).toBe('Agent execution failed');
    expect(context.duration).toBe(1500);

    dateNowSpy.mockRestore();
  });

  // Given successful agent response; When runAgent executes; Then it persists duration and returns result
  it('runAgent persists log with duration on success', async () => {
    const persistSpy = jest
      .spyOn<any, any>(analyzer as any, 'persistAgentLog')
      .mockResolvedValue(undefined);
    const dateNowSpy = jest.spyOn(Date, 'now');
    dateNowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_105);

    const agent: CodexAgentClient = { executeTask: jest.fn() } as unknown as CodexAgentClient;
    Object.setPrototypeOf(agent, CodexAgentClient.prototype);
    (agent.executeTask as jest.Mock).mockResolvedValue([
      JSON.stringify({ type: 'result', result: 'handled' }),
    ]);

    const result = await (analyzer as any).runAgent(agent, 'prompt', '/repo', {
      commentId: 7,
      outputDir: '/repo/output',
      dryRun: false,
    });

    expect(result).toBe('handled');
    expect(persistSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [JSON.stringify({ type: 'result', result: 'handled' })],
        startTime: 1_000,
        endTime: 1_105,
        duration: 105,
        agentName: 'Codex Agent',
        error: null,
        commentId: 7,
      }),
      '/repo/output',
      false,
      expect.any(LogFormatter),
    );

    dateNowSpy.mockRestore();
  });

  // Given Claude agent; When runAgent executes; Then agentName is set accordingly
  it('runAgent sets agentName for Claude agent logs', async () => {
    const persistSpy = jest
      .spyOn<any, any>(analyzer as any, 'persistAgentLog')
      .mockResolvedValue(undefined);
    const agent: ClaudeAgentClient = { executeTask: jest.fn() } as unknown as ClaudeAgentClient;
    Object.setPrototypeOf(agent, ClaudeAgentClient.prototype);
    (agent.executeTask as jest.Mock).mockResolvedValue([
      JSON.stringify({ type: 'result', result: 'done' }),
    ]);

    await (analyzer as any).runAgent(agent, 'prompt', '/repo', {
      commentId: 9,
      outputDir: '/repo/output',
      dryRun: false,
    });

    const [context] = persistSpy.mock.calls[0];
    expect(context.agentName).toBe('Claude Agent');
  });

  // Given omitted options; When runAgent executes; Then log persistence is skipped
  it('runAgent skips persisting log when options are omitted', async () => {
    const persistSpy = jest
      .spyOn<any, any>(analyzer as any, 'persistAgentLog')
      .mockResolvedValue(undefined);
    const agent: CodexAgentClient = { executeTask: jest.fn() } as unknown as CodexAgentClient;
    Object.setPrototypeOf(agent, CodexAgentClient.prototype);
    (agent.executeTask as jest.Mock).mockResolvedValue([
      JSON.stringify({ type: 'result', result: 'ok' }),
    ]);

    const result = await (analyzer as any).runAgent(agent, 'prompt', '/repo');

    expect(result).toBe('ok');
    expect(persistSpy).not.toHaveBeenCalled();
  });

  // Given empty agent messages; When runAgent executes; Then it persists empty log and returns blank string
  it('runAgent persists log even when agent returns empty messages', async () => {
    const persistSpy = jest
      .spyOn<any, any>(analyzer as any, 'persistAgentLog')
      .mockResolvedValue(undefined);
    const agent: CodexAgentClient = { executeTask: jest.fn() } as unknown as CodexAgentClient;
    Object.setPrototypeOf(agent, CodexAgentClient.prototype);
    (agent.executeTask as jest.Mock).mockResolvedValue([]);

    const result = await (analyzer as any).runAgent(agent, 'prompt', '/repo', {
      commentId: 222,
      outputDir: '/repo/output',
      dryRun: false,
    });

    expect(result).toBe('');
    expect(persistSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [],
        commentId: 222,
      }),
      '/repo/output',
      false,
      expect.any(LogFormatter),
    );
  });

  // Given analyze is invoked; When runAgent is called; Then commentId is propagated
  it('analyze propagates commentId to runAgent', async () => {
    jest
      .spyOn(fs, 'readFile')
      .mockResolvedValue('{ "type": "reply", "confidence": "high", "reply": "ok" }');
    const runAgentSpy = jest
      .spyOn<any, any>(analyzer as any, 'runAgent')
      .mockResolvedValue(JSON.stringify({ type: 'reply', confidence: 'high', reply: 'ok' }));
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

    await analyzer.analyze(commentMeta, { repoPath: '/repo' }, {} as CodexAgentClient);

    expect(runAgentSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      '/repo',
      expect.objectContaining({ commentId: 100 }),
    );
  });

  // Given custom outputDir; When analyze is invoked; Then runAgent receives configured path
  it('analyze passes configured outputDir to runAgent', async () => {
    const customAnalyzer = new ReviewCommentAnalyzer(promptsDir, '/custom/output');
    jest
      .spyOn(fs, 'readFile')
      .mockResolvedValue('{ "type": "reply", "confidence": "high", "reply": "ok" }');
    const runAgentSpy = jest
      .spyOn<any, any>(customAnalyzer as any, 'runAgent')
      .mockResolvedValue(null);
    jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);

    await customAnalyzer.analyze(commentMeta, { repoPath: '/repo' }, {} as CodexAgentClient);

    expect(runAgentSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      '/repo',
      expect.objectContaining({ outputDir: '/custom/output' }),
    );
  });
});
