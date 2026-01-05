import type {
  BugCandidate,
  RefactorCandidate,
  EnhancementProposal,
} from '../../types/auto-issue.js';

export type OutputPrefix = 'bugs' | 'refactor' | 'enhancements';

export interface RepositoryAnalyzerOptions {
  outputFileFactory?: (prefix: OutputPrefix) => string;
}

export interface AnalyzeOptions {
  customInstruction?: string;
  creativeMode?: boolean;
}

export type { BugCandidate, RefactorCandidate, EnhancementProposal };
