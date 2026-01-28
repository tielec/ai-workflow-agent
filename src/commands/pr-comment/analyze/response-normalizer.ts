import { logger } from '../../../utils/logger.js';
import type { PRCommentAnalyzeOptions } from '../../../types/commands.js';
import type {
  ProposedChange,
  ResponsePlan,
  ResponsePlanComment,
} from '../../../types/pr-comment.js';

const MAX_PROPOSED_WARNING = 5;
let missingProposedWarningCount = 0;

export function isValidResponsePlanCandidate(obj: unknown): obj is ResponsePlan {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  if (!('comments' in candidate)) {
    return false;
  }

  if (!Array.isArray(candidate.comments)) {
    return false;
  }

  return true;
}

export function normalizeResponsePlan(parsed: ResponsePlan, prNumber: number): ResponsePlan {
  if (!parsed.pr_number) {
    parsed.pr_number = prNumber;
  }
  parsed.comments = (parsed.comments ?? []).map((c) => normalizePlanComment(c));
  return parsed;
}

export function normalizePlanComment(comment: ResponsePlanComment): ResponsePlanComment {
  const proposed = comment.proposed_changes ?? [];
  const confidence = comment.confidence ?? 'medium';
  const userApproved = comment.user_approved ?? false;
  const normalizedProposed: ProposedChange[] = proposed.map((c) => ({
    action: c.action,
    file: c.file,
    line_range: c.line_range,
    changes: c.changes,
  }));

  const normalized: ResponsePlanComment = {
    comment_id: String(comment.comment_id),
    file: comment.file,
    line: comment.line ?? null,
    author: comment.author,
    body: comment.body,
    type:
      comment.type === 'code_change' && confidence === 'low' && !userApproved
        ? 'discussion'
        : (comment.type ?? 'discussion'),
    confidence,
    rationale: comment.rationale,
    proposed_changes: normalizedProposed,
    reply_message: comment.reply_message,
    user_approved: userApproved,
  };

  validateProposedChanges(normalized);

  return normalized;
}

/**
 * type=code_change かつ proposed_changes が空の場合に警告を出力する。
 */
export function validateProposedChanges(comment: ResponsePlanComment): void {
  if (comment.type !== 'code_change') {
    return;
  }

  if (!comment.proposed_changes || comment.proposed_changes.length === 0) {
    missingProposedWarningCount += 1;
    if (missingProposedWarningCount <= MAX_PROPOSED_WARNING) {
      logger.warn(
        `Comment #${comment.comment_id} has type 'code_change' but no proposed_changes. Reply will be posted without code modifications.`,
      );
    } else if (missingProposedWarningCount === MAX_PROPOSED_WARNING + 1) {
      logger.warn(
        `[parseResponsePlan] Similar warnings exceeded ${MAX_PROPOSED_WARNING} entries; further messages will be suppressed.`,
      );
    }
  }
}

export function applyPlanDefaults(
  plan: ResponsePlan,
  options: PRCommentAnalyzeOptions,
): ResponsePlan {
  return {
    ...plan,
    analyzed_at: plan.analyzed_at ?? new Date().toISOString(),
    analyzer_agent: plan.analyzer_agent ?? (options.agent ?? 'auto'),
  };
}
