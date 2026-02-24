import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { config } from './config.js';
import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../types.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const promptsRoot = path.resolve(moduleDir, '..', 'prompts');
const templatesRoot = path.resolve(moduleDir, '..', 'templates');

export type PromptCategory =
  | 'auto-issue'
  | 'auto-close'
  | 'pr-comment'
  | 'rollback'
  | 'difficulty'
  | 'followup'
  | 'squash'
  | 'content_parser'
  | 'validation'
  | 'rewrite-issue'
  | 'create-sub-issue'
  | 'split-issue'
  | 'conflict';

export class PromptLoader {
  static loadPrompt(
    category: PromptCategory,
    name: string,
    language?: SupportedLanguage,
  ): string {
    const resolvedLanguage = this.resolveLanguage(language);
    const promptPath = this.resolvePromptPath(category, name, resolvedLanguage);
    return fs.readFileSync(promptPath, 'utf-8');
  }

  static resolvePromptPath(
    category: PromptCategory,
    name: string,
    language: SupportedLanguage,
  ): string {
    const primaryPath = path.join(promptsRoot, category, language, `${name}.txt`);
    if (fs.existsSync(primaryPath)) {
      return primaryPath;
    }

    const fallbackPath = path.join(promptsRoot, category, DEFAULT_LANGUAGE, `${name}.txt`);
    logger.warn(
      `Prompt not found for language '${language}', falling back to '${DEFAULT_LANGUAGE}': ${primaryPath}`,
    );
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }

    throw new Error(
      `Prompt file not found: ${primaryPath} (fallback also not found: ${fallbackPath})`,
    );
  }

  static loadTemplate(name: string, language?: SupportedLanguage): string {
    const resolvedLanguage = this.resolveLanguage(language);
    const templatePath = this.resolveTemplatePath(name, resolvedLanguage);
    return fs.readFileSync(templatePath, 'utf-8');
  }

  static resolveTemplatePath(name: string, language: SupportedLanguage): string {
    const primaryPath = path.join(templatesRoot, language, name);
    if (fs.existsSync(primaryPath)) {
      return primaryPath;
    }

    const fallbackPath = path.join(templatesRoot, DEFAULT_LANGUAGE, name);
    logger.warn(
      `Template not found for language '${language}', falling back to '${DEFAULT_LANGUAGE}': ${primaryPath}`,
    );
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }

    throw new Error(
      `Template file not found: ${primaryPath} (fallback also not found: ${fallbackPath})`,
    );
  }

  static promptExists(
    category: PromptCategory,
    name: string,
    language: SupportedLanguage,
  ): boolean {
    const promptPath = path.join(promptsRoot, category, language, `${name}.txt`);
    return fs.existsSync(promptPath);
  }

  static templateExists(name: string, language: SupportedLanguage): boolean {
    const templatePath = path.join(templatesRoot, language, name);
    return fs.existsSync(templatePath);
  }

  private static resolveLanguage(language?: SupportedLanguage): SupportedLanguage {
    if (language) {
      return language;
    }

    try {
      const configured = (config as Partial<typeof config>).getLanguage?.();
      if (configured) {
        return configured;
      }
      logger.warn(
        `config.getLanguage is not available, falling back to default language '${DEFAULT_LANGUAGE}'`,
      );
    } catch (error) {
      logger.warn(
        `Failed to resolve language from config, using default '${DEFAULT_LANGUAGE}': ${getErrorMessage(error)}`,
      );
    }

    return DEFAULT_LANGUAGE;
  }
}
