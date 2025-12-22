import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import { ReviewCommentAnalyzer } from '../../../src/core/pr-comment/comment-analyzer.js';
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
  let readFileSpy: jest.SpiedFunction<typeof fsp.readFile>;
  let writeFileSpy: jest.SpiedFunction<typeof fsp.writeFile>;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2025-01-20T12:00:00Z'));

    jest.spyOn(fs, 'ensureDir').mockResolvedValue(undefined);
    jest.spyOn(fsp, 'mkdir').mockResolvedValue(undefined as any);
    writeFileSpy = jest.spyOn(fsp, 'writeFile').mockResolvedValue(undefined as any);
    readFileSpy = jest.spyOn(fsp, 'readFile').mockResolvedValue('');

    analyzer = new ReviewCommentAnalyzer(promptsDir, outputDir);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('classifies comments by keyword patterns', () => {
    expect(analyzer.classifyComment('Fix this bug')).toBe('code_change');
    expect(analyzer.classifyComment('WHY is this needed?')).toBe('question');
    expect(analyzer.classifyComment('Looks good for future refactor')).toBe('discussion');
  });

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

  it('throws when resolution type is invalid', async () => {
    readFileSpy.mockResolvedValue('{ "type": "unknown", "confidence": "high", "reply": "ok" }');

    await expect((analyzer as any).parseResult('/tmp/out.json')).rejects.toThrow(
      'Invalid resolution type',
    );
  });

  describe('agent logging', () => {
    const templatePath = path.join(promptsDir, 'pr-comment', 'analyze.txt');
    const baseContext = {
      repoPath: '/repo',
      fileContent: '// file content',
      prDescription: 'PR body',
    };
    let formatAgentLogSpy: jest.SpiedFunction<LogFormatter['formatAgentLog']>;
    let agentOutputContent: string;
    const analysisFile = path.join(outputDir, `analysis-${commentMeta.comment.id}.json`);

    beforeEach(() => {
      agentOutputContent = JSON.stringify({
        type: 'reply',
        confidence: 'high',
        reply: 'Handled.',
      });

      readFileSpy.mockImplementation(async (target: unknown) => {
        const targetPath = String(target);
        if (targetPath === templatePath) {
          return 'PROMPT {comment_id} {output_file_path}';
        }
        if (targetPath === analysisFile) {
          return agentOutputContent;
        }
        return '';
      });

      formatAgentLogSpy = jest
        .spyOn(LogFormatter.prototype, 'formatAgentLog')
        .mockReturnValue('# formatted log');
    });

    // TC-001: コンストラクタでLogFormatterが初期化される
    it('initializes LogFormatter in constructor', () => {
      const testAnalyzer = new ReviewCommentAnalyzer('/prompts', '/output');
      expect(testAnalyzer).toBeDefined();
      // LogFormatterはprivateなので直接検証できないが、
      // インスタンス生成が例外をスローしないことで間接検証
    });

    // TC-002: Codexエージェント成功時にログファイルが作成される
    it('saves agent log on successful Codex execution', async () => {
      const codexMessages = [
        JSON.stringify({
          type: 'result',
          result: agentOutputContent,
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      await analyzer.analyze(commentMeta, baseContext, agent);

      const logCall = writeFileSpy.mock.calls.find((call) =>
        String(call[0]).includes('agent_log_comment_100.md'),
      );

      expect(logCall?.[0]).toContain('agent_log_comment_100.md');
      expect(formatAgentLogSpy).toHaveBeenCalledWith(
        codexMessages,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        null,
        'Codex Agent',
      );
    });

    // TC-003: Claudeエージェント成功時にログファイルが作成される
    it('saves agent log on successful Claude execution', async () => {
      const claudeMessages = [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: agentOutputContent }],
          },
        }),
      ];
      const agent = Object.create(ClaudeAgentClient.prototype) as ClaudeAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(claudeMessages);

      await analyzer.analyze(commentMeta, baseContext, agent);

      const logCall = writeFileSpy.mock.calls.find((call) =>
        String(call[0]).includes('agent_log_comment_100.md'),
      );

      expect(logCall?.[0]).toContain('agent_log_comment_100.md');
      expect(formatAgentLogSpy).toHaveBeenCalledWith(
        claudeMessages,
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        null,
        'Claude Agent',
      );
    });

    // TC-004: ログファイルに実行時間情報が含まれる（LogFormatter経由）
    it('includes execution timing information in log file', async () => {
      // Use real LogFormatter to verify output format
      formatAgentLogSpy.mockRestore();
      const codexMessages = [
        JSON.stringify({
          type: 'thread.started',
          thread_id: 'test-thread',
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      await analyzer.analyze(commentMeta, baseContext, agent);

      const logCall = writeFileSpy.mock.calls.find((call) =>
        String(call[0]).includes('agent_log_comment_'),
      );

      const writtenContent = logCall?.[1] as string;
      expect(writtenContent).toContain('経過時間');
      expect(writtenContent).toContain('開始');
      expect(writtenContent).toContain('終了');
    });

    // TC-005: エージェント実行エラー時にログファイルが作成される
    it('saves agent log when execution fails', async () => {
      const agentError = new Error('Agent execution timeout');
      const agent = Object.create(ClaudeAgentClient.prototype) as ClaudeAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockRejectedValue(agentError);

      await analyzer.analyze(commentMeta, baseContext, agent);

      const logCall = writeFileSpy.mock.calls.find((call) =>
        String(call[0]).includes('agent_log_comment_100.md'),
      );

      expect(logCall?.[0]).toContain('agent_log_comment_100.md');
      expect(formatAgentLogSpy).toHaveBeenCalledWith(
        [],
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ message: 'Agent execution timeout' }),
        'Claude Agent',
      );
    });

    // TC-006: エラー時もエージェント名が正しくログに記録される
    it('records correct agent name in error log for Codex', async () => {
      const agentError = new Error('API rate limit exceeded');
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockRejectedValue(agentError);

      await analyzer.analyze(commentMeta, baseContext, agent);

      expect(formatAgentLogSpy).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ message: 'API rate limit exceeded' }),
        'Codex Agent',
      );
    });

    // TC-007: ログ保存失敗時も分析処理は継続する
    it('continues analysis when log save fails', async () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      const codexMessages = [
        JSON.stringify({
          type: 'result',
          result: agentOutputContent,
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      writeFileSpy.mockImplementation(async (filePath: unknown, data: unknown) => {
        if (String(filePath).includes('agent_log_comment_')) {
          throw new Error('Permission denied');
        }
        return undefined as any;
      });

      const result = await analyzer.analyze(commentMeta, baseContext, agent);

      expect(result.success).toBe(true);
    });

    // TC-008: ログ保存失敗時に警告ログが出力される
    it('outputs warning log when log save fails', async () => {
      const warnSpy = jest.spyOn(logger, 'warn');
      const codexMessages = [
        JSON.stringify({
          type: 'result',
          result: agentOutputContent,
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      writeFileSpy.mockImplementation(async (filePath: unknown, data: unknown) => {
        if (String(filePath).includes('agent_log_comment_')) {
          throw new Error('Disk full');
        }
        return undefined as any;
      });

      await analyzer.analyze(commentMeta, baseContext, agent);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to save agent log'));
    });

    // TC-009: LogFormatter.formatAgentLog()が正しいパラメータで呼び出される
    it('calls LogFormatter.formatAgentLog with correct parameters', async () => {
      const codexMessages = [
        JSON.stringify({
          type: 'result',
          result: agentOutputContent,
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      await analyzer.analyze(commentMeta, baseContext, agent);

      expect(formatAgentLogSpy).toHaveBeenCalledWith(
        codexMessages, // messages
        expect.any(Number), // startTime
        expect.any(Number), // endTime
        expect.any(Number), // duration
        null, // error (成功時はnull)
        'Codex Agent', // agentName
      );

      // 引数の数が正しいことを確認
      expect(formatAgentLogSpy.mock.calls[0]).toHaveLength(6);
    });

    // TC-010: 保存されたログファイルがMarkdown形式である
    it('saves log file in Markdown format', async () => {
      // Use real LogFormatter to verify Markdown format
      formatAgentLogSpy.mockRestore();
      const codexMessages = [
        JSON.stringify({
          type: 'thread.started',
          thread_id: 'test-thread',
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      await analyzer.analyze(commentMeta, baseContext, agent);

      const logCall = writeFileSpy.mock.calls.find((call) =>
        String(call[0]).includes('agent_log_comment_'),
      );

      const writtenContent = logCall?.[1] as string;
      // Markdown形式の検証（見出しが含まれる）
      expect(writtenContent).toMatch(/^#/m);
    });

    // TC-011: ログファイル名にコメントIDが含まれる
    it('includes comment ID in log file name', async () => {
      const codexMessages = [
        JSON.stringify({
          type: 'result',
          result: agentOutputContent,
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      // Use different comment ID
      const commentMetaWithId = {
        ...commentMeta,
        comment: { ...commentMeta.comment, id: 12345 },
      };
      const analysisFileWithId = path.join(outputDir, `analysis-12345.json`);

      readFileSpy.mockImplementation(async (target: unknown) => {
        const targetPath = String(target);
        if (targetPath === templatePath) {
          return 'PROMPT {comment_id} {output_file_path}';
        }
        if (targetPath === analysisFileWithId) {
          return agentOutputContent;
        }
        return '';
      });

      await analyzer.analyze(commentMetaWithId, baseContext, agent);

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringMatching(/agent_log_comment_12345\.md$/),
        expect.any(String),
        'utf-8',
      );
    });

    // TC-012: 複数コメント処理時に個別のログファイルが作成される
    it('creates separate log files for multiple comments', async () => {
      const codexMessages = [
        JSON.stringify({
          type: 'result',
          result: agentOutputContent,
        }),
      ];
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue(codexMessages);

      const commentIds = [100, 200, 300];

      for (const id of commentIds) {
        const meta = { ...commentMeta, comment: { ...commentMeta.comment, id } };
        const analysisFileForId = path.join(outputDir, `analysis-${id}.json`);

        readFileSpy.mockImplementation(async (target: unknown) => {
          const targetPath = String(target);
          if (targetPath === templatePath) {
            return 'PROMPT {comment_id} {output_file_path}';
          }
          if (targetPath === analysisFileForId) {
            return agentOutputContent;
          }
          return '';
        });

        await analyzer.analyze(meta, baseContext, agent);
      }

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringMatching(/agent_log_comment_100\.md$/),
        expect.any(String),
        'utf-8',
      );
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringMatching(/agent_log_comment_200\.md$/),
        expect.any(String),
        'utf-8',
      );
      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringMatching(/agent_log_comment_300\.md$/),
        expect.any(String),
        'utf-8',
      );
    });

    // TC-013: エージェントがnullの場合、ログファイルは作成されない
    it('does not create agent log when agent is null', async () => {
      const result = await analyzer.analyze(commentMeta, baseContext, null);

      const logCalls = writeFileSpy.mock.calls.filter((call) =>
        String(call[0]).includes('agent_log_comment_'),
      );

      expect(logCalls).toHaveLength(0);
      expect(result.success).toBe(true);
    });

    // TC-014: 空のメッセージ配列でもログが保存される
    it('saves log file even with empty messages array', async () => {
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue([]);

      await analyzer.analyze(commentMeta, baseContext, agent);

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('agent_log_comment_'),
        expect.any(String),
        'utf-8',
      );
    });

    // TC-015: 大きなメッセージでもログが正しく保存される
    it('handles large messages without error', async () => {
      const largeContent = 'x'.repeat(5000);
      const agent = Object.create(CodexAgentClient.prototype) as CodexAgentClient & {
        executeTask: jest.Mock;
      };
      agent.executeTask = jest.fn().mockResolvedValue([
        JSON.stringify({
          type: 'result',
          result: largeContent,
        }),
      ]);

      const result = await analyzer.analyze(commentMeta, baseContext, agent);

      expect(writeFileSpy).toHaveBeenCalledWith(
        expect.stringContaining('agent_log_comment_'),
        expect.any(String),
        'utf-8',
      );
      // 処理がエラーなく完了することを確認
      expect(result).toBeDefined();
    });
  });
});
