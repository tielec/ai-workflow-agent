import { DEFAULT_LANGUAGE, type SupportedLanguage } from '../types.js';

// Shared language instruction lines to keep prompts, tests, and tooling in sync.
export const PROMPT_LANGUAGE_INSTRUCTIONS: Record<SupportedLanguage, string> = {
  en: '**IMPORTANT: Write all document content in English. All sections, descriptions, and explanations must be in English.**',
  ja: '**重要: すべてのドキュメント内容を日本語で記述してください。すべてのセクション、説明、解説は日本語で書いてください。**',
};

export const getPromptLanguageInstruction = (language: SupportedLanguage): string =>
  PROMPT_LANGUAGE_INSTRUCTIONS[language] ?? PROMPT_LANGUAGE_INSTRUCTIONS[DEFAULT_LANGUAGE];
