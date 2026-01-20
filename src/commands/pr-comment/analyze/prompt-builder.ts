import { PromptLoader } from '../../../core/prompt-loader.js';
import type { PRCommentMetadataManager } from '../../../core/pr-comment/metadata-manager.js';
import type { CommentMetadata } from '../../../types/pr-comment.js';
import {
  formatCommentBlock,
  formatThreadBlockWithFiles,
  getAllThreadComments,
  groupCommentsByThread,
} from './comment-formatter.js';

/**
 * Build analyze prompt with context and output file path instructions.
 */
export async function buildAnalyzePrompt(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  outputFilePath: string,
): Promise<string> {
  const template = PromptLoader.loadPrompt('pr-comment', 'analyze');
  const metadata = await metadataManager.getMetadata();

  const threadGroups = groupCommentsByThread(comments);
  const threadBlocks: string[] = [];

  for (const [threadId] of threadGroups) {
    const allThreadComments = getAllThreadComments(metadata, threadId);
    const formatted = await formatThreadBlockWithFiles(
      threadId,
      allThreadComments.length > 0 ? allThreadComments : threadGroups.get(threadId) ?? [],
      repoRoot,
    );
    threadBlocks.push(formatted);
  }

  let commentSection = '';
  if (threadBlocks.length > 0) {
    commentSection = threadBlocks.join('\n\n');
  } else {
    const commentBlocks: string[] = [];
    for (const meta of comments) {
      commentBlocks.push(await formatCommentBlock(meta, repoRoot));
    }
    commentSection = commentBlocks.join('\n\n');
  }

  const metadataSummary = [`PR ${prNumber}: ${metadata.pr.title}`, `Repo: ${repoRoot}`, `Output: ${outputFilePath}`].join('\n');

  const filledTemplate = template
    .replace('{pr_number}', String(prNumber))
    .replace('{pr_title}', metadata.pr.title)
    .replace('{repo_path}', repoRoot)
    .replace('{all_comments}', commentSection)
    .replace('{output_file_path}', outputFilePath);

  return `${metadataSummary}\n\n${filledTemplate}`;
}
