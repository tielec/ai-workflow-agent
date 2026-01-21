import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { CommentMetadata, CommentResolutionMetadata } from '../../../types/pr-comment.js';

export function groupCommentsByThread(comments: CommentMetadata[]): Map<string, CommentMetadata[]> {
  const threadGroups = new Map<string, CommentMetadata[]>();

  for (const meta of comments) {
    const threadId = meta.comment.thread_id ?? `unknown-${meta.comment.id}`;
    if (!threadGroups.has(threadId)) {
      threadGroups.set(threadId, []);
    }
    threadGroups.get(threadId)!.push(meta);
  }

  return threadGroups;
}

export function getAllThreadComments(
  metadata: CommentResolutionMetadata,
  threadId: string,
): CommentMetadata[] {
  const comments = Object.values(metadata.comments ?? {});
  const toTimestamp = (value: string): number => {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? 0 : time;
  };

  return comments
    .filter((commentMeta) => {
      const commentThreadId = commentMeta.comment.thread_id ?? `unknown-${commentMeta.comment.id}`;
      return commentThreadId === threadId;
    })
    .sort(
      (a, b) =>
        toTimestamp(a.comment.created_at ?? '') -
        toTimestamp(b.comment.created_at ?? ''),
    );
}

export function formatThreadBlock(
  threadId: string,
  comments: CommentMetadata[],
  repoRoot: string,
): string {
  const blocks: string[] = [`### Thread #${threadId}`];

  for (const meta of comments) {
    const comment = meta.comment;
    const isAIReply = meta.reply_comment_id !== null && meta.reply_comment_id !== undefined;
    const label = isAIReply ? '[AI Reply]' : '[User Comment]';
    const lineInfo = comment.line ?? comment.end_line ?? comment.start_line ?? 'N/A';
    const fileInfo = comment.path && comment.path.length > 0 ? comment.path : 'N/A';

    blocks.push(`\n#### Comment #${comment.id} ${label}`);
    blocks.push(`- Author: ${comment.user}`);
    blocks.push(`- Created: ${comment.created_at}`);
    blocks.push(`- File: ${fileInfo}`);
    blocks.push(`- Line: ${lineInfo}`);
    blocks.push('- Body:');
    blocks.push('```');
    blocks.push(comment.body ?? '');
    blocks.push('```');
  }

  return blocks.join('\n');
}

export async function formatThreadBlockWithFiles(
  threadId: string,
  comments: CommentMetadata[],
  repoRoot: string,
): Promise<string> {
  const blocks: string[] = [`### Thread #${threadId}`];

  for (const meta of comments) {
    const commentBlock = await formatCommentBlock(meta, repoRoot);
    const isAIReply = meta.reply_comment_id !== null && meta.reply_comment_id !== undefined;
    const label = isAIReply ? '[AI Reply]' : '[User Comment]';
    const labeledBlock = commentBlock.replace(
      /^### Comment #[^\n]+/m,
      `### Comment #${meta.comment.id} ${label}`,
    );
    blocks.push(labeledBlock);
  }

  return blocks.join('\n\n');
}

export async function formatCommentBlock(meta: CommentMetadata, repoRoot: string): Promise<string> {
  const comment = meta.comment;
  const filePath = comment.path ? path.join(repoRoot, comment.path) : '';
  let fileContent = '(No file content)';
  if (filePath) {
    try {
      fileContent = await fsp.readFile(filePath, 'utf-8');
    } catch {
      fileContent = '(File not found)';
    }
  }

  return [
    `### Comment #${comment.id}`,
    `- File: ${comment.path}`,
    `- Line: ${comment.line ?? comment.end_line ?? 'N/A'}`,
    `- Author: ${comment.user}`,
    '- Body:',
    '```',
    comment.body,
    '```',
    '- Diff:',
    '```diff',
    comment.diff_hunk ?? '(No diff context)',
    '```',
    '- File Content:',
    '```',
    fileContent,
    '```',
  ].join('\n');
}
