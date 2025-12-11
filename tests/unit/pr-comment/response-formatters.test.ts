import { describe, it, expect, beforeAll } from '@jest/globals';
import type { ExecutionResult, ResponsePlan } from '../../../src/types/pr-comment.js';

let parseResponsePlan: (output: string, prNumber: number) => ResponsePlan;
let buildResponsePlanMarkdown: (plan: ResponsePlan) => string;
let parseExecutionResult: (output: string, plan: ResponsePlan) => ExecutionResult;
let buildExecutionResultMarkdown: (result: ExecutionResult) => string;

beforeAll(async () => {
  const analyzeModule = await import('../../../src/commands/pr-comment/analyze.js');
  const executeModule = await import('../../../src/commands/pr-comment/execute.js');
  parseResponsePlan = (analyzeModule as any).__testables.parseResponsePlan;
  buildResponsePlanMarkdown = (analyzeModule as any).__testables.buildResponsePlanMarkdown;
  parseExecutionResult = (executeModule as any).__testables.parseExecutionResult;
  buildExecutionResultMarkdown = (executeModule as any).__testables.buildExecutionResultMarkdown;
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
