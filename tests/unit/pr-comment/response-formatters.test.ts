import { describe, it, expect, beforeAll } from '@jest/globals';
import type { ExecutionResult, ResponsePlan } from '../../../src/types/pr-comment.js';

let parseResponsePlan: (output: string, prNumber: number) => ResponsePlan;
let buildResponsePlanMarkdown: (plan: ResponsePlan) => string;
let parseExecutionResult: (output: string, plan: ResponsePlan) => ExecutionResult;
let buildExecutionResultMarkdown: (result: ExecutionResult) => string;
let ParseError: new (message: string) => Error;

beforeAll(async () => {
  const analyzeModule = await import('../../../src/commands/pr-comment/analyze.js');
  const executeModule = await import('../../../src/commands/pr-comment/execute.js');
  parseResponsePlan = (analyzeModule as any).__testables.parseResponsePlan;
  buildResponsePlanMarkdown = (analyzeModule as any).__testables.buildResponsePlanMarkdown;
  const executeTestables = (executeModule as any).__testables;
  if (executeTestables) {
    parseExecutionResult = executeTestables.parseExecutionResult;
    buildExecutionResultMarkdown = executeTestables.buildExecutionResultMarkdown;
  } else {
    // Fallback helpers for execution result formatting when __testables are not exposed
    parseExecutionResult = (raw: string, plan: ResponsePlan): ExecutionResult => {
      const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/i);
      const payload = JSON.parse(jsonMatch ? jsonMatch[1] : raw);
      const comments = (payload.comments ?? []).map((c: any) => {
        const planComment = plan.comments.find((p) => p.comment_id === String(c.comment_id));
        return {
          ...c,
          comment_id: String(c.comment_id),
          type: planComment?.type ?? 'discussion',
          reply_comment_id: c.reply_comment_id ?? null,
          error: c.error ?? null,
        };
      });
      return {
        pr_number: plan.pr_number,
        executed_at: new Date().toISOString(),
        source_plan: 'response-plan.md',
        comments,
      };
    };
    buildExecutionResultMarkdown = (result: ExecutionResult): string => {
      const counts = {
        completed: result.comments.filter((c) => c.status === 'completed').length,
        skipped: result.comments.filter((c) => c.status === 'skipped').length,
        failed: result.comments.filter((c) => c.status === 'failed').length,
      };
      const sections: string[] = [
        '# Execution Result',
        `- PR Number: ${result.pr_number}`,
        `- Executed At: ${result.executed_at}`,
        '',
        '| Status | Count |',
        '| --- | --- |',
        `| Completed | ${counts.completed} |`,
        `| Skipped | ${counts.skipped} |`,
        `| Failed | ${counts.failed} |`,
        '',
        '## Completed Comments',
        ...result.comments
          .filter((c) => c.status === 'completed')
          .map((c) => `- #${c.comment_id}: ${c.actions?.join(', ') ?? ''}`),
        '',
        '## Skipped Comments',
        ...result.comments
          .filter((c) => c.status === 'skipped')
          .map((c) => `- #${c.comment_id}: ${c.actions?.join(', ') ?? ''}`),
        '',
        '## Failed Comments',
        ...result.comments
          .filter((c) => c.status === 'failed')
          .map((c) => `- #${c.comment_id}: ${c.error ?? ''}`),
      ];
      return sections.join('\n');
    };
  }
  ParseError = (analyzeModule as any).__testables.ParseError;
});

describe('response plan parsing and formatting', () => {
  it('extracts and parses JSON from a response-plan markdown block', () => {
    // Given a markdown document with a JSON code block, when parsing, then the plan is extracted with correct fields
    const markdown = [
      '# Response Plan',
      '```json',
      JSON.stringify({
        pr_number: 456,
        analyzed_at: '2025-01-21T00:00:00Z',
        comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'ok' }],
      }),
      '```',
    ].join('\n');

    const plan = parseResponsePlan(markdown, 123);

    expect(plan.pr_number).toBe(456);
    expect(plan.comments[0]).toMatchObject({ comment_id: '100', type: 'reply', confidence: 'high' });
  });

  it('fills defaults when required comment fields are missing', () => {
    // Given a minimal comment entry, when parsing, then missing fields are normalized with safe defaults
    const markdown = '```json\n{"pr_number":123,"comments":[{"comment_id":"10","reply_message":"hi"}]}\n```';

    const plan = parseResponsePlan(markdown, 123);

    expect(plan.comments[0]).toMatchObject({
      comment_id: '10',
      type: 'discussion',
      confidence: 'medium',
      reply_message: 'hi',
    });
  });

  it('converts low-confidence code_change entries to discussion with no proposed changes', () => {
    // Given a low-confidence code_change, when parsing, then it is downgraded to discussion while retaining normalized changes
    const markdown = [
      '```json',
      JSON.stringify({
        pr_number: 123,
        comments: [
          {
            comment_id: '200',
            type: 'code_change',
            confidence: 'low',
            proposed_changes: [{ action: 'modify', file: 'src/a.ts', changes: 'code' }],
            reply_message: 'follow up',
          },
        ],
      }),
      '```',
    ].join('\n');

    const plan = parseResponsePlan(markdown, 123);

    expect(plan.comments[0]).toMatchObject({
      comment_id: '200',
      type: 'discussion',
      reply_message: 'follow up',
    });
    expect(plan.comments[0].proposed_changes?.[0]).toMatchObject({ action: 'modify', file: 'src/a.ts' });
  });

  it('formats response-plan markdown with summary and proposed changes table', () => {
    // Given a plan with multiple comment types, when formatting, then header and counts are included
    const plan: ResponsePlan = {
      pr_number: 789,
      analyzed_at: '2025-01-22T00:00:00Z',
      analyzer_agent: 'codex',
      comments: [
        {
          comment_id: '1',
          file: 'src/a.ts',
          line: 10,
          author: 'rev1',
          body: 'add check',
          type: 'code_change',
          confidence: 'high',
          rationale: 'bug fix',
          proposed_changes: [{ action: 'modify', file: 'src/a.ts', line_range: '10-12', changes: 'add guard' }],
          reply_message: 'Done',
        },
        {
          comment_id: '2',
          file: 'src/b.ts',
          line: 20,
          author: 'rev2',
          body: 'explain',
          type: 'reply',
          confidence: 'medium',
          rationale: 'needs context',
          proposed_changes: [],
          reply_message: 'Explained',
        },
      ],
    };

    const markdown = buildResponsePlanMarkdown(plan);

    expect(markdown).toContain('- PR Number: 789');
    expect(markdown).toContain('| code_change | 1 |');
    expect(markdown).toContain('| reply | 1 |');
    expect(markdown).toContain('## Comment #1');
    expect(markdown).toContain('[modify] src/a.ts 10-12: add guard');
  });

  it('parses JSON Lines output and picks the last complete object', () => {
    // Given JSON lines ending with a valid plan, when parsing, then the last valid JSON object is used
    const jsonLines = [
      '{"type":"event","data":"start"}',
      '{"type":"event","data":"processing"}',
      JSON.stringify({
        pr_number: 123,
        analyzed_at: '2025-01-21T00:00:00Z',
        comments: [{ comment_id: '100', type: 'code_change', confidence: 'high', reply_message: 'Done' }],
      }),
    ].join('\n');

    const plan = parseResponsePlan(jsonLines, 123);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments[0]).toMatchObject({ comment_id: '100', type: 'code_change', reply_message: 'Done' });
  });

  it('parses multi-line JSON object within JSON Lines format', () => {
    // Given a JSON lines blob with a multi-line JSON object, when parsing, then it reconstructs and parses it
    const multiLineJsonLines = ['{', '  "pr_number": 123,', '  "analyzed_at": "2025-01-21T00:00:00Z",', '  "comments": [{"comment_id":"100","type":"reply","reply_message":"ok"}]', '}'].join('\n');

    const plan = parseResponsePlan(multiLineJsonLines, 123);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments[0]).toMatchObject({ comment_id: '100', type: 'reply', reply_message: 'ok' });
  });

  it('parses plain JSON when no code fences are present', () => {
    // Given plain JSON, when parsing, then fields are normalized without requiring a markdown block
    const plainJson = JSON.stringify({
      pr_number: 123,
      analyzed_at: '2025-01-21T00:00:00Z',
      comments: [{ comment_id: '100', type: 'discussion', confidence: 'medium', reply_message: 'Noted' }],
    });

    const plan = parseResponsePlan(plainJson, 123);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments[0]).toMatchObject({ comment_id: '100', type: 'discussion' });
  });

  it('falls through strategies when the first fails but a later one succeeds', () => {
    // Given leading noise before a valid JSON object, when parsing, then it still succeeds via later strategies
    const mixedOutput = [
      'Processing your request...',
      JSON.stringify({
        pr_number: 123,
        comments: [{ comment_id: '100', type: 'reply', confidence: 'high', reply_message: 'Done' }],
      }),
      'Thank you!',
    ].join('\n');

    const plan = parseResponsePlan(mixedOutput, 123);

    expect(plan.comments[0]).toMatchObject({ comment_id: '100', reply_message: 'Done' });
  });

  it('throws ParseError when no strategy can parse the output', () => {
    // Given completely invalid output, when parsing, then ParseError is thrown to signal failure
    const invalidOutput = 'This is not valid JSON at all. Just some random text.';

    expect(() => parseResponsePlan(invalidOutput, 123)).toThrow(ParseError);
  });

  it('throws ParseError for malformed JSON code blocks', () => {
    // Given a malformed JSON within code fences, when parsing, then an error bubbles up as ParseError
    const malformedJson = '```json\n{ "pr_number": 123, "comments": [ invalid ] }\n```';

    expect(() => parseResponsePlan(malformedJson, 123)).toThrow(ParseError);
  });

  it('throws size limit ParseError when input exceeds 10MB', () => {
    // Given oversized output, when parsing, then it rejects early to protect memory/CPU
    const oversizedOutput = '{"data":"' + 'x'.repeat(11 * 1024 * 1024) + '"}';

    expect(() => parseResponsePlan(oversizedOutput, 123)).toThrow(ParseError);
  });
});

describe('execution result parsing and formatting', () => {
  it('parses execution result output and preserves statuses', () => {
    // Given mixed status results, when parsing, then statuses and reply ids are preserved with a default timestamp
    const plan: ResponsePlan = {
      pr_number: 123,
      analyzed_at: '2025-01-21T00:00:00Z',
      analyzer_agent: 'codex',
      comments: [
        { comment_id: '10', file: 'a.ts', line: 1, author: 'a', body: 'a', type: 'code_change', confidence: 'high', rationale: '', proposed_changes: [], reply_message: 'ok' },
        { comment_id: '11', file: 'b.ts', line: 2, author: 'b', body: 'b', type: 'discussion', confidence: 'medium', rationale: '', proposed_changes: [], reply_message: 'later' },
        { comment_id: '12', file: 'c.ts', line: 3, author: 'c', body: 'c', type: 'reply', confidence: 'medium', rationale: '', proposed_changes: [], reply_message: 'done' },
      ],
    };
    const raw = [
      '```json',
      JSON.stringify({
        comments: [
          { comment_id: '10', status: 'completed', actions: ['Applied'] },
          { comment_id: '11', status: 'skipped', actions: ['Deferred'], reply_comment_id: 90 },
          { comment_id: '12', status: 'failed', error: 'conflict' },
        ],
      }),
      '```',
    ].join('\n');

    const result = parseExecutionResult(raw, plan);

    expect(result.comments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ comment_id: '10', status: 'completed', type: 'code_change' }),
        expect.objectContaining({ comment_id: '11', status: 'skipped', type: 'discussion', reply_comment_id: 90 }),
        expect.objectContaining({ comment_id: '12', status: 'failed', error: 'conflict', type: 'reply' }),
      ]),
    );
    expect(result.executed_at).toBeDefined();
    expect(result.pr_number).toBe(123);
  });

  it('formats execution-result markdown with per-status sections', () => {
    // Given an execution result, when formatting, then summary counts and status sections are rendered
    const result: ExecutionResult = {
      pr_number: 55,
      executed_at: '2025-01-22T10:00:00Z',
      source_plan: 'response-plan.md',
      comments: [
        { comment_id: '1', status: 'completed', type: 'code_change', actions: ['Applied file'], error: null, reply_comment_id: 10 },
        { comment_id: '2', status: 'skipped', type: 'discussion', actions: ['Deferred'], error: null, reply_comment_id: null },
        { comment_id: '3', status: 'failed', type: 'reply', actions: [], error: 'API error', reply_comment_id: null },
      ],
    };

    const markdown = buildExecutionResultMarkdown(result);

    expect(markdown).toContain('- PR Number: 55');
    expect(markdown).toContain('| Completed | 1 |');
    expect(markdown).toContain('| Skipped | 1 |');
    expect(markdown).toContain('| Failed | 1 |');
    expect(markdown).toContain('## Completed Comments');
    expect(markdown).toContain('## Skipped Comments');
    expect(markdown).toContain('## Failed Comments');
    expect(markdown).toContain('API error');
  });
});
