import { describe, it, expect, beforeAll } from '@jest/globals';
import type { ResponsePlan, ResponsePlanComment } from '../../../src/types/pr-comment.js';

let parseResponsePlan: (output: string, prNumber: number) => ResponsePlan;
let findAllJsonObjectBoundaries: (text: string) => Array<{ start: number; end: number }>;
let isValidResponsePlanCandidate: (obj: unknown) => obj is ResponsePlan;
let normalizePlanComment: (comment: ResponsePlanComment) => ResponsePlanComment;

beforeAll(async () => {
  const analyzeModule = await import('../../../src/commands/pr-comment/analyze.js');
  parseResponsePlan = (analyzeModule as any).__testables.parseResponsePlan;
  findAllJsonObjectBoundaries = (analyzeModule as any).__testables.findAllJsonObjectBoundaries;
  isValidResponsePlanCandidate = (analyzeModule as any).__testables.isValidResponsePlanCandidate;
  normalizePlanComment = (analyzeModule as any).__testables.normalizePlanComment;
});

describe('parseResponsePlan strategies', () => {
  it('parses markdown code block JSON (TC-UNIT-001)', () => {
    const output = [
      '# Response Plan',
      '```json',
      JSON.stringify({
        pr_number: 123,
        analyzer_agent: 'codex',
        comments: [
          {
            comment_id: '100',
            file: 'src/a.ts',
            line: 10,
            type: 'code_change',
            confidence: 'high',
            reply_message: 'Fixed',
          },
        ],
      }),
      '```',
    ].join('\n');

    const plan = parseResponsePlan(output, 999);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments[0]).toMatchObject({ comment_id: '100', type: 'code_change', confidence: 'high' });
  });

  it('parses single-line JSON Lines output (TC-UNIT-002)', () => {
    const output = [
      '{"event":"start","timestamp":"2025-01-21T00:00:00Z"}',
      '{"event":"progress","data":"analyzing comment 1"}',
      '{"pr_number":123,"comments":[{"comment_id":"100","type":"reply","confidence":"high","reply_message":"OK"}]}',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments).toHaveLength(1);
    expect(plan.comments[0]).toMatchObject({ comment_id: '100', type: 'reply', reply_message: 'OK' });
  });

  it('uses the last valid JSON Lines object when multiple are present (TC-UNIT-003)', () => {
    const output = [
      '{"pr_number":100,"comments":[{"comment_id":"x","type":"discussion","reply_message":"first"}]}',
      '{"pr_number":123,"comments":[{"comment_id":"200","type":"discussion","confidence":"medium","reply_message":"Noted"}]}',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments[0]).toMatchObject({ comment_id: '200', type: 'discussion' });
  });

  it('extracts plain JSON surrounded by prose (TC-UNIT-004)', () => {
    const output = [
      'Here is the analysis result:',
      '',
      '{',
      '  "pr_number": 456,',
      '  "analyzer_agent": "claude",',
      '  "comments": [',
      '    {',
      '      "comment_id": "300",',
      '      "type": "code_change",',
      '      "confidence": "high",',
      '      "reply_message": "Applied fix"',
      '    }',
      '  ]',
      '}',
      '',
      'Please review the above plan.',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.pr_number).toBe(456);
    expect(plan.comments[0]).toMatchObject({ comment_id: '300', type: 'code_change', reply_message: 'Applied fix' });
  });

  it('picks the last plain JSON object that contains comments (TC-UNIT-005)', () => {
    const output = [
      'Processing status: {"status": "complete"}',
      '',
      'Result: {"pr_number": 789, "comments": [{"comment_id": "400", "type": "reply", "confidence": "medium", "reply_message": "Thanks"}]}',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.pr_number).toBe(789);
    expect(plan.comments[0]).toMatchObject({ comment_id: '400', type: 'reply', reply_message: 'Thanks' });
  });

  it('fills missing pr_number from the argument (TC-UNIT-006)', () => {
    const output = '{"comments": [{"comment_id": "500", "type": "discussion", "confidence": "low", "reply_message": "Will review"}]}';

    const plan = parseResponsePlan(output, 999);

    expect(plan.pr_number).toBe(999);
    expect(plan.comments[0]).toMatchObject({ comment_id: '500', type: 'discussion', confidence: 'low' });
  });

  it('throws when JSON inside markdown is invalid (TC-UNIT-007)', () => {
    const output = '```json\n{ "pr_number": 123, "comments": [{ invalid json syntax }] }\n```';

    expect(() => parseResponsePlan(output, 123)).toThrow('Failed to parse agent response');
  });

  it('throws when comments field is missing (TC-UNIT-008)', () => {
    const output = '{"pr_number": 123, "status": "completed"}';

    expect(() => parseResponsePlan(output, 123)).toThrow('Failed to parse agent response');
  });

  it('throws when comments is not an array (TC-UNIT-009)', () => {
    const output = '{"pr_number": 123, "comments": "not an array"}';

    expect(() => parseResponsePlan(output, 123)).toThrow('Failed to parse agent response');
  });

  it('throws on empty output (TC-UNIT-010)', () => {
    expect(() => parseResponsePlan('', 1)).toThrow('Failed to parse agent response');
  });

  it('throws on whitespace-only output (TC-UNIT-011)', () => {
    expect(() => parseResponsePlan('   \n\n   \t   ', 1)).toThrow('Failed to parse agent response');
  });

  it('parses JSON Lines with empty lines mixed in (TC-UNIT-012)', () => {
    const output = [
      '{"event":"start"}',
      '',
      '',
      '{"pr_number":123,"comments":[{"comment_id":"600","type":"reply","confidence":"high","reply_message":"Done"}]}',
      '',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.comments[0]).toMatchObject({ comment_id: '600', reply_message: 'Done' });
  });

  it('skips invalid JSON lines and uses the valid one (TC-UNIT-013)', () => {
    const output = [
      '{"invalid json without closing brace',
      '{"pr_number":123,"comments":[{"comment_id":"700","type":"discussion","confidence":"medium","reply_message":"Noted"}]}',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.pr_number).toBe(123);
    expect(plan.comments[0]).toMatchObject({ comment_id: '700', type: 'discussion' });
  });

  it('retains nested JSON content (TC-UNIT-014)', () => {
    const output = [
      '{',
      '  "pr_number": 123,',
      '  "comments": [',
      '    {',
      '      "comment_id": "800",',
      '      "type": "code_change",',
      '      "confidence": "high",',
      '      "proposed_changes": [',
      '        {',
      '          "action": "modify",',
      '          "file": "src/utils.ts",',
      '          "changes": "export const config = { \\"nested\\": { \\"value\\": true } };"',
      '        }',
      '      ],',
      '      "reply_message": "Applied"',
      '    }',
      '  ]',
      '}',
    ].join('\n');

    const plan = parseResponsePlan(output, 0);

    expect(plan.comments[0].proposed_changes?.[0]).toMatchObject({
      action: 'modify',
      file: 'src/utils.ts',
      changes: 'export const config = { "nested": { "value": true } };',
    });
  });

  it('handles escaped characters in reply_message (TC-UNIT-015)', () => {
    const json = JSON.stringify({
      pr_number: 123,
      comments: [
        {
          comment_id: '900',
          type: 'reply',
          confidence: 'high',
          reply_message: 'Fixed the "bug" in line 10.\nNew line here.\tTab here.',
        },
      ],
    });
    const output = `\`\`\`json\n${json}\n\`\`\``;

    const plan = parseResponsePlan(output, 0);

    expect(plan.comments[0].reply_message).toBe('Fixed the "bug" in line 10.\nNew line here.\tTab here.');
  });

  it('parses large output within reasonable time (TC-UNIT-016)', () => {
    const generateLargeResponsePlan = (commentCount: number): string => {
      const comments = Array.from({ length: commentCount }, (_, i) => ({
        comment_id: String(i + 1),
        file: `src/file${i}.ts`,
        line: i * 10,
        author: `reviewer${i % 5}`,
        body: `Comment body for item ${i}`.repeat(10),
        type: i % 3 === 0 ? 'code_change' : i % 3 === 1 ? 'reply' : 'discussion',
        confidence: i % 2 === 0 ? 'high' : 'medium',
        reply_message: `Reply for comment ${i}`.repeat(5),
      }));

      return JSON.stringify({
        pr_number: 123,
        analyzed_at: new Date().toISOString(),
        analyzer_agent: 'codex',
        comments,
      });
    };

    const largePlanJson = generateLargeResponsePlan(50);
    const output = `\`\`\`json\n${largePlanJson}\n\`\`\``;

    const start = Date.now();
    const plan = parseResponsePlan(output, 0);
    const durationMs = Date.now() - start;

    expect(plan.comments).toHaveLength(50);
    expect(durationMs).toBeLessThanOrEqual(150);
  });
});

describe('helper functions', () => {
  it('findAllJsonObjectBoundaries detects a single object (TC-UNIT-017)', () => {
    const json = '{"key": "value"}';
    const boundaries = findAllJsonObjectBoundaries(json);

    expect(boundaries).toEqual([{ start: 0, end: json.length - 1 }]);
  });

  it('findAllJsonObjectBoundaries detects multiple objects (TC-UNIT-018)', () => {
    const text = 'text {"a":1} more {"b":2} end';
    const firstStart = text.indexOf('{"a":1}');
    const secondStart = text.indexOf('{"b":2}');
    const boundaries = findAllJsonObjectBoundaries(text);

    expect(boundaries).toEqual([
      { start: firstStart, end: firstStart + '{"a":1}'.length - 1 },
      { start: secondStart, end: secondStart + '{"b":2}'.length - 1 },
    ]);
  });

  it('findAllJsonObjectBoundaries ignores braces inside strings (TC-UNIT-019)', () => {
    const text = '{"message": "Use {brackets} here"}';
    const boundaries = findAllJsonObjectBoundaries(text);

    expect(boundaries).toEqual([{ start: 0, end: text.length - 1 }]);
  });

  it('isValidResponsePlanCandidate returns true for valid structures (TC-UNIT-020)', () => {
    const candidate = { pr_number: 1, comments: [] };
    expect(isValidResponsePlanCandidate(candidate)).toBe(true);
  });

  it('isValidResponsePlanCandidate returns false without comments (TC-UNIT-021)', () => {
    const candidate = { pr_number: 1, status: 'ok' };
    expect(isValidResponsePlanCandidate(candidate)).toBe(false);
  });

  it('isValidResponsePlanCandidate returns false when comments is not an array (TC-UNIT-022)', () => {
    const candidate = { pr_number: 1, comments: 'oops' };
    expect(isValidResponsePlanCandidate(candidate)).toBe(false);
  });

  it('normalizePlanComment fills defaults (TC-UNIT-023)', () => {
    const normalized = normalizePlanComment({ comment_id: '1', reply_message: 'ok' } as any);

    expect(normalized).toMatchObject({
      comment_id: '1',
      type: 'discussion',
      confidence: 'medium',
      line: null,
    });
    expect(normalized.proposed_changes).toEqual([]);
  });

  it('normalizePlanComment downgrades low-confidence code_change to discussion (TC-UNIT-024)', () => {
    const normalized = normalizePlanComment({
      comment_id: '1',
      type: 'code_change',
      confidence: 'low',
      reply_message: 'maybe',
    } as any);

    expect(normalized.type).toBe('discussion');
    expect(normalized.confidence).toBe('low');
  });
});
