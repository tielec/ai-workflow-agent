export type ResolutionStrategy = 'both' | 'ours' | 'theirs' | 'manual-merge';

export type ConflictResolutionStatus =
  | 'initialized'
  | 'analyzed'
  | 'executed'
  | 'finalized'
  | 'failed';

export interface GitLogEntry {
  hash: string;
  message: string;
  date: string;
  author_name?: string;
  author_email?: string;
}

export interface ConflictBlock {
  filePath: string;
  startLine: number;
  endLine: number;
  oursContent: string;
  theirsContent: string;
  baseContent?: string;
}

export interface ConflictResolution {
  filePath: string;
  strategy: ResolutionStrategy;
  resolvedContent: string;
  notes?: string;
}

export interface MergeContext {
  conflictFiles: ConflictBlock[];
  oursLog: GitLogEntry[];
  theirsLog: GitLogEntry[];
  prDescription: string;
  relatedIssues: string[];
  contextSnippets: Array<{ filePath: string; startLine: number; endLine: number; content: string }>;
}

export interface ConflictResolutionPlan {
  prNumber: number;
  baseBranch: string;
  headBranch: string;
  generatedAt: string;
  resolutions: ConflictResolution[];
  skippedFiles: string[];
  warnings: string[];
}

export interface ConflictMetadata {
  version: '1.0.0';
  prNumber: number;
  repository: { owner: string; repo: string };
  status: ConflictResolutionStatus;
  mergeable: boolean | null;
  mergeableState?: string;
  conflictFiles: string[];
  resolutionPlanPath?: string;
  resolutionResultPath?: string;
  baseBranch?: string;
  headBranch?: string;
  createdAt: string;
  updatedAt: string;
}
