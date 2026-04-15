import type { ImpactAnalysisOptions } from '../../types/impact-analysis.js';

/**
 * Scoperステージの出力
 */
export interface ScopeResult {
  investigationPoints: InvestigationPoint[];
  matchedPatterns: string[];
  skippedPatterns: string[];
  reasoning: string;
}

/**
 * 調査観点（Scoper → Investigator間の単位）
 */
export interface InvestigationPoint {
  id: string;
  patternName: string;
  description: string;
  targetFiles: string[];
  searchKeywords: string[];
  instructions: string;
}

/**
 * Investigatorステージの出力
 */
export interface InvestigationResult {
  findings: Finding[];
  completedPoints: string[];
  incompletePoints: string[];
  guardrailsReached: boolean;
  guardrailDetails?: string;
  reasoning: string;
  toolCallCount: number;
  tokenUsage: number;
}

/**
 * 発見事項
 */
export interface Finding {
  investigationPointId: string;
  patternName: string;
  description: string;
  evidence: Evidence[];
  severity: 'info' | 'warning';
}

/**
 * 証拠
 */
export interface Evidence {
  type: 'code_reference' | 'file_content' | 'git_history' | 'search_result';
  filePath: string;
  lineNumber?: number;
  content: string;
  context?: string;
}

/**
 * Reporterステージの出力
 */
export interface ImpactReport {
  markdown: string;
  findingsCount: number;
  patternsMatched: string[];
  guardrailsReached: boolean;
  commentResult?: CommentResult;
  localFilePath?: string;
}

/**
 * PRコメント投稿結果
 */
export interface CommentResult {
  success: boolean;
  commentId: number | null;
  commentUrl: string | null;
  error?: string | null;
}

/**
 * GitHub API diff取得結果
 */
export interface DiffResult {
  diff: string;
  truncated: boolean;
  filesChanged: number;
}

/**
 * ガードレール設定
 */
export interface GuardrailsConfig {
  maxTokens: number;
  timeoutSeconds: number;
  maxToolCalls: number;
}

/**
 * ガードレール状態
 */
export interface GuardrailsState {
  tokenUsage: number;
  elapsedSeconds: number;
  toolCallCount: number;
  reached: boolean;
  reachedType?: 'token' | 'timeout' | 'tool_calls';
  details?: string;
}

/**
 * パイプライン実行コンテキスト
 */
export interface PipelineContext {
  options: ImpactAnalysisOptions;
  diff: DiffResult;
  playbook: string;
  guardrails: GuardrailsConfig;
  guardrailsState: GuardrailsState;
  logDir: string;
}
