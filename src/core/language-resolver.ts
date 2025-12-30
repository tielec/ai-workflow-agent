import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../types.js';
import { config } from './config.js';
import type { MetadataManager } from './metadata-manager.js';
import { logger } from '../utils/logger.js';

export interface LanguageResolveOptions {
  /**
   * CLIオプションで指定された言語（最優先）
   */
  cliOption?: SupportedLanguage;
  /**
   * メタデータ管理オブジェクト（メタデータ参照時に使用）
   */
  metadataManager?: MetadataManager;
}

/**
 * 言語設定を優先順位に従って解決する
 *
 * 優先順位: CLIオプション > 環境変数 > メタデータ > デフォルト
 */
export function resolveLanguage(options: LanguageResolveOptions): SupportedLanguage {
  // Priority 1: CLI option (highest priority)
  if (options.cliOption) {
    logger.debug(`Language resolved from CLI option: ${options.cliOption}`);
    return options.cliOption;
  }

  // Priority 2: Environment variable (with validation and fallback to default)
  // config.getLanguage() handles AI_WORKFLOW_LANGUAGE validation and DEFAULT_LANGUAGE fallback
  const envLanguage = config.getLanguage();
  if (envLanguage !== DEFAULT_LANGUAGE) {
    logger.debug(`Language resolved from environment variable: ${envLanguage}`);
    return envLanguage;
  }

  // Priority 3: Metadata (if available)
  if (options.metadataManager) {
    const metadataLanguage = options.metadataManager.getLanguage();
    if (metadataLanguage) {
      logger.debug(`Language resolved from metadata: ${metadataLanguage}`);
      return metadataLanguage;
    }
  }

  // Priority 4: Default
  logger.debug(`Language resolved to default: ${DEFAULT_LANGUAGE}`);
  return DEFAULT_LANGUAGE;
}
