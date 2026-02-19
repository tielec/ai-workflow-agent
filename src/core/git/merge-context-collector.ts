import { promises as fsp } from 'node:fs';
import path from 'node:path';
import simpleGit from 'simple-git';
import { logger } from '../../utils/logger.js';
import { getErrorMessage } from '../../utils/error-utils.js';
import type { GitHubClient } from '../github-client.js';
import type { ConflictBlock, GitLogEntry, MergeContext } from '../../types/conflict.js';
import { __testables as parserTestables } from './conflict-parser.js';

const DEFAULT_LOG_LIMIT = 10;
const SNIPPET_RADIUS = 10;

function extractRelatedIssues(body: string): string[] {
  const matches = body.match(/#\d+/g) ?? [];
  const unique = new Set<string>();
  for (const match of matches) {
    unique.add(match);
  }
  return Array.from(unique);
}

function mapLogEntry(entry: { hash: string; message: string; date: string; author_name?: string; author_email?: string }): GitLogEntry {
  return {
    hash: entry.hash,
    message: entry.message,
    date: entry.date,
    author_name: entry.author_name,
    author_email: entry.author_email,
  };
}

async function loadSnippet(
  repoRoot: string,
  conflict: ConflictBlock,
): Promise<{ filePath: string; startLine: number; endLine: number; content: string } | null> {
  const filePath = path.join(repoRoot, conflict.filePath);
  try {
    const raw = await fsp.readFile(filePath, 'utf-8');
    if (parserTestables.isBinaryContent(raw)) {
      return null;
    }

    const lines = raw.split(/\r?\n/);
    const start = Math.max(1, conflict.startLine - SNIPPET_RADIUS);
    const end = Math.min(lines.length, conflict.endLine + SNIPPET_RADIUS);
    const content = lines.slice(start - 1, end).join('\n');
    return {
      filePath: conflict.filePath,
      startLine: start,
      endLine: end,
      content,
    };
  } catch (error) {
    logger.warn(`Failed to load snippet for ${conflict.filePath}: ${getErrorMessage(error)}`);
    return null;
  }
}

export class MergeContextCollector {
  private readonly repoRoot: string;
  private readonly githubClient: GitHubClient;
  private readonly logLimit: number;

  constructor(repoRoot: string, githubClient: GitHubClient, logLimit = DEFAULT_LOG_LIMIT) {
    this.repoRoot = repoRoot;
    this.githubClient = githubClient;
    this.logLimit = logLimit;
  }

  public async collect(
    baseBranch: string,
    headBranch: string,
    prNumber: number,
    conflictFiles: ConflictBlock[],
  ): Promise<MergeContext> {
    const git = simpleGit({ baseDir: this.repoRoot });

    let prDescription = '';
    try {
      prDescription = await this.githubClient.getPullRequestBody(prNumber);
    } catch (error) {
      logger.warn(`Failed to fetch PR description: ${getErrorMessage(error)}`);
      prDescription = '';
    }

    const relatedIssues = extractRelatedIssues(prDescription);

    let oursLog: GitLogEntry[] = [];
    let theirsLog: GitLogEntry[] = [];

    try {
      const oursLogRaw = await git.log([baseBranch, '-n', String(this.logLimit)]);
      oursLog = oursLogRaw.all.map(mapLogEntry);
    } catch (error) {
      logger.warn(`Failed to collect base branch log: ${getErrorMessage(error)}`);
      oursLog = [];
    }

    try {
      const theirsLogRaw = await git.log([headBranch, '-n', String(this.logLimit)]);
      theirsLog = theirsLogRaw.all.map(mapLogEntry);
    } catch (error) {
      logger.warn(`Failed to collect head branch log: ${getErrorMessage(error)}`);
      theirsLog = [];
    }

    const snippets: Array<{ filePath: string; startLine: number; endLine: number; content: string }> = [];
    for (const conflict of conflictFiles) {
      const snippet = await loadSnippet(this.repoRoot, conflict);
      if (snippet) {
        snippets.push(snippet);
      }
    }

    return {
      conflictFiles,
      oursLog,
      theirsLog,
      prDescription,
      relatedIssues,
      contextSnippets: snippets,
    };
  }
}
