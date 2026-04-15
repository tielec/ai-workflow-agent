/**
 * CLIから受け取る生のオプション（文字列ベース）
 */
export interface RawImpactAnalysisOptions {
  pr?: string;
  prUrl?: string;
  customInstruction?: string;
  agent?: string;
  dryRun?: boolean;
  language?: string;
}

/**
 * パース・バリデーション済みのオプション
 */
export interface ImpactAnalysisOptions {
  prNumber: number;
  owner: string;
  repo: string;
  customInstruction?: string;
  agent: 'auto' | 'codex' | 'claude';
  dryRun: boolean;
  language: 'ja' | 'en';
}
