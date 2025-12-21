import type { ValidationResult } from '../../types/auto-issue.js';

/**
 * 危険パターン定義
 *
 * 破壊的な操作やシステム変更につながる指示をカテゴリごとに定義します。
 */
export const DANGEROUS_PATTERNS: Record<string, string[]> = {
  gitOperations: [
    'commit',
    'push',
    'reset',
    'rebase',
    'merge',
    'delete branch',
    'ブランチ削除',
    'force push',
    'cherry-pick',
    'checkout',
  ],
  fileOperations: [
    '削除',
    'delete',
    '上書き',
    'overwrite',
    '書き換え',
    'modify',
    '変更',
    'remove',
    '消去',
    'erase',
  ],
  systemCommands: [
    'npm',
    'yarn',
    'pip',
    'install',
    '実行',
    'execute',
    'run',
    'brew',
    'apt',
    'yum',
    'make',
    'cargo',
  ],
  configChanges: ['config', 'env', '環境変数', '設定', '.env', 'credentials', 'secret', 'token', 'password'],
  dbOperations: ['DROP', 'DELETE FROM', 'TRUNCATE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE TABLE', 'migration'],
  autoFix: ['自動修正', '修正して', '直して', 'fix it', 'auto fix', '書き換えて', 'refactor', '変更して', 'update'],
};

/**
 * 許可パターン定義
 *
 * 分析観点の指定に使用される一般的なキーワード。
 */
export const ALLOWED_PATTERNS: string[] = [
  '重点的',
  '焦点',
  'focus',
  'priority',
  'emphasize',
  '優先',
  '検出',
  'detect',
  'find',
  'identify',
  'look for',
  '探す',
  '調査',
  'analyze',
  'investigate',
  'examine',
  '分析',
  '詳細',
  'detailed',
  'thorough',
  '徹底',
];

/**
 * カスタム指示の安全性検証モジュール
 */
export class InstructionValidator {
  private static readonly MAX_LENGTH = 500;

  /**
   * カスタム指示の検証を実行します。
   *
   * @param instruction - 検証対象のカスタム指示
   * @returns ValidationResult
   */
  public static validate(instruction: string): ValidationResult {
    const normalized = instruction.trim();

    if (!normalized) {
      return {
        isValid: true,
      };
    }

    if (normalized.length > InstructionValidator.MAX_LENGTH) {
      return {
        isValid: false,
        errorMessage: `Custom instruction exceeds maximum length (${InstructionValidator.MAX_LENGTH} characters)`,
      };
    }

    const detectedPattern = InstructionValidator.checkDangerousPattern(normalized);
    if (detectedPattern) {
      return {
        isValid: false,
        errorMessage: `Invalid custom instruction: Dangerous operation detected: "${detectedPattern}". Custom instructions must be limited to analysis guidance only.`,
        detectedPattern,
      };
    }

    return {
      isValid: true,
    };
  }

  /**
   * 危険パターンを検出します。
   *
   * @param instruction - 検証対象のカスタム指示
   * @returns 検出されたパターン、見つからない場合は null
   */
  private static checkDangerousPattern(instruction: string): string | null {
    for (const patterns of Object.values(DANGEROUS_PATTERNS)) {
      for (const pattern of patterns) {
        if (InstructionValidator.matchesPattern(instruction, pattern)) {
          return pattern;
        }
      }
    }
    return null;
  }

  /**
   * 許可パターンを含むか判定します（デバッグ用途）。
   *
   * @param instruction - 検証対象のカスタム指示
   * @returns 許可パターンを含む場合は true
   */
  public static isAllowedPattern(instruction: string): boolean {
    return ALLOWED_PATTERNS.some((pattern) =>
      InstructionValidator.matchesPattern(instruction, pattern),
    );
  }

  /**
   * 単語境界や日本語を考慮したパターンマッチングを実行します。
   *
   * @param instruction - 検証対象のカスタム指示
   * @param pattern - 照合パターン
   * @returns マッチした場合は true
   */
  private static matchesPattern(instruction: string, pattern: string): boolean {
    const lowerInstruction = instruction.toLowerCase();
    const lowerPattern = pattern.toLowerCase();

    // 日本語など非ASCIIを含む場合は単純な部分一致で判定
    if (/[^\x00-\x7F]/.test(pattern)) {
      return lowerInstruction.includes(lowerPattern);
    }

    const escaped = escapeRegex(lowerPattern);
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(lowerInstruction);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
