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
  if (options.cliOption) {
    logger.debug(`Language resolved from CLI option: ${options.cliOption}`);
    return options.cliOption;
  }

  const envRaw = process.env.AI_WORKFLOW_LANGUAGE;
  const envLanguage = config.getLanguage();
  if (envRaw && SUPPORTED_LANGUAGES.includes(envLanguage as SupportedLanguage)) {
    logger.debug(`Language resolved from environment variable: ${envLanguage}`);
    return envLanguage as SupportedLanguage;
  }

  if (options.metadataManager) {
    const metadataLanguage = options.metadataManager.getLanguage();
    if (metadataLanguage) {
      logger.debug(`Language resolved from metadata: ${metadataLanguage}`);
      return metadataLanguage;
    }
  }

  logger.debug(`Language resolved to default: ${DEFAULT_LANGUAGE}`);
  return DEFAULT_LANGUAGE;
}
