import type { CommentMetadata, ResponsePlan } from '../../../types/pr-comment.js';

export function buildResponsePlanMarkdown(plan: ResponsePlan): string {
  const counts = {
    code_change: plan.comments.filter((c) => c.type === 'code_change').length,
    reply: plan.comments.filter((c) => c.type === 'reply').length,
    discussion: plan.comments.filter((c) => c.type === 'discussion').length,
    skip: plan.comments.filter((c) => c.type === 'skip').length,
  };

  let md = '# Response Plan\n\n';
  md += `- PR Number: ${plan.pr_number}\n`;
  md += `- Analyzed At: ${plan.analyzed_at}\n`;
  md += `- Analyzer Agent: ${plan.analyzer_agent}\n\n`;

  md += '| Type | Count |\n| --- | --- |\n';
  md += `| code_change | ${counts.code_change} |\n`;
  md += `| reply | ${counts.reply} |\n`;
  md += `| discussion | ${counts.discussion} |\n`;
  md += `| skip | ${counts.skip} |\n`;
  md += `| total | ${plan.comments.length} |\n\n`;

  for (const comment of plan.comments) {
    md += `## Comment #${comment.comment_id}\n`;
    md += `- File: ${comment.file ?? 'N/A'}\n`;
    md += `- Line: ${comment.line ?? 'N/A'}\n`;
    md += `- Author: ${comment.author ?? 'N/A'}\n`;
    md += `- Type: ${comment.type} (confidence: ${comment.confidence})\n`;
    md += `- Rationale: ${comment.rationale ?? 'N/A'}\n`;
    md += `- Reply Message: ${comment.reply_message}\n`;
    if (comment.proposed_changes && comment.proposed_changes.length > 0) {
      md += '- Proposed Changes:\n';
      for (const change of comment.proposed_changes) {
        md += `  - [${change.action}] ${change.file} ${change.line_range ?? ''}: ${change.changes}\n`;
      }
    } else {
      md += '- Proposed Changes: (none)\n';
    }
    md += '\n';
  }

  return md;
}

export function buildFallbackPlan(prNumber: number, comments: CommentMetadata[]): ResponsePlan {
  const now = new Date().toISOString();
  return {
    pr_number: prNumber,
    analyzed_at: now,
    analyzer_agent: 'fallback',
    comments: comments.map((c) => ({
      comment_id: String(c.comment.id),
      file: c.comment.path,
      line: c.comment.line ?? null,
      author: c.comment.user,
      body: c.comment.body,
      type: 'discussion',
      confidence: 'low',
      rationale: 'Fallback plan used because agent output was unavailable.',
      proposed_changes: [],
      reply_message:
        'Thanks for the feedback. This requires manual follow-up. We will review and respond shortly.',
    })),
  };
}
