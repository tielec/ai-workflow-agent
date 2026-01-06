/**
 * RepositoryAnalyzer - Repository exploration facade
 *
 * Uses Codex/Claude agents to scan a repository and surface issues, refactor candidates,
 * and enhancement proposals.
 */
import path from 'node:path';
import os from 'node:os';
import * as fs from 'node:fs';
import { promises as fsp } from 'node:fs';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from './codex-agent-client.js';
import type { ClaudeAgentClient } from './claude-agent-client.js';
import type {
  AnalyzeOptions,
  BugCandidate,
  EnhancementProposal,
  OutputPrefix,
  RefactorCandidate,
  RepositoryAnalyzerOptions,
} from './analyzer/types.js';
import {
  executeAgentWithFallback as executeWithFallback,
  injectCustomInstruction as injectInstruction,
} from './analyzer/agent-executor.js';
import {
  readBugOutputFile as parseBugOutputFile,
  readRefactorOutputFile as parseRefactorOutputFile,
  readEnhancementOutputFile as parseEnhancementOutputFile,
  parseEnhancementProposals as parseEnhancementProposalsImpl,
} from './analyzer/output-parser.js';
import {
  validateBugCandidate as validateBugCandidateImpl,
  validateRefactorCandidate as validateRefactorCandidateImpl,
  validateEnhancementProposal as validateEnhancementProposalImpl,
  validateAnalysisResult as validateAnalysisResultImpl,
} from './analyzer/candidate-validator.js';
import { isExcludedDirectory, isExcludedFile } from './analyzer/path-exclusion.js';
import { PromptLoader } from './prompt-loader.js';

function generateOutputFilePath(prefix: OutputPrefix = 'bugs'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return path.join(os.tmpdir(), `auto-issue-${prefix}-${timestamp}-${random}.json`);
}

export class RepositoryAnalyzer {
  private readonly codexClient: CodexAgentClient | null;
  private readonly claudeClient: ClaudeAgentClient | null;
  private readonly outputFileFactory?: (prefix: OutputPrefix) => string;

  constructor(
    codexClient: CodexAgentClient | null,
    claudeClient: ClaudeAgentClient | null,
    options: RepositoryAnalyzerOptions = {},
  ) {
    this.codexClient = codexClient;
    this.claudeClient = claudeClient;
    this.outputFileFactory = options.outputFileFactory;
  }

  public async analyze(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<BugCandidate[]> {
    logger.info(`Analyzing repository: ${repoPath}`);

    const promptTemplate = PromptLoader.loadPrompt('auto-issue', 'detect-bugs');
    const outputFilePath = this.outputFileFactory?.('bugs') ?? generateOutputFilePath();
    logger.debug(`Output file path: ${outputFilePath}`);

    try {
      await this.executeAgentWithFallback(promptTemplate, outputFilePath, repoPath, agent, options);
      const candidates = this.readBugOutputFile(outputFilePath);
      this.maybeBackupInvalidJson(outputFilePath, candidates.length);
      const validCandidates = this.validateAnalysisResult(candidates, 'bug');
      return validCandidates;
    } finally {
      this.cleanupOutputFile(outputFilePath);
    }
  }

  public async analyzeForRefactoring(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<RefactorCandidate[]> {
    logger.info(`Analyzing repository for refactoring: ${repoPath}`);

    const promptTemplate = PromptLoader.loadPrompt('auto-issue', 'detect-refactoring');
    const outputFilePath = this.outputFileFactory?.('refactor') ?? generateOutputFilePath('refactor');
    logger.debug(`Output file path: ${outputFilePath}`);

    try {
      await this.executeAgentWithFallback(promptTemplate, outputFilePath, repoPath, agent, options);
      const candidates = this.readRefactorOutputFile(outputFilePath);
      this.maybeBackupInvalidJson(outputFilePath, candidates.length);
      const validCandidates = this.validateAnalysisResult(candidates, 'refactor');
      return validCandidates;
    } finally {
      this.cleanupOutputFile(outputFilePath);
    }
  }

  public async analyzeForEnhancements(
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<EnhancementProposal[]> {
    logger.info(`Analyzing repository for enhancement proposals: ${repoPath}`);

    const promptTemplate = PromptLoader.loadPrompt('auto-issue', 'detect-enhancements');
    const outputFilePath =
      this.outputFileFactory?.('enhancements') ?? generateOutputFilePath('enhancements');
    logger.debug(`Output file path: ${outputFilePath}`);

    try {
      await this.executeAgentWithFallback(promptTemplate, outputFilePath, repoPath, agent, options);
      const proposals = this.readEnhancementOutputFile(outputFilePath);
      this.maybeBackupInvalidJson(outputFilePath, proposals.length);
      const validProposals = proposals.filter((proposal) =>
        this.validateEnhancementProposal(proposal),
      );

      logger.info(
        `Parsed ${proposals.length} enhancement proposals, ${validProposals.length} valid after validation.`,
      );

      return validProposals;
    } finally {
      this.cleanupOutputFile(outputFilePath);
    }
  }

  private async executeAgentWithFallback(
    promptTemplate: string,
    outputFilePath: string,
    repoPath: string,
    agent: 'auto' | 'codex' | 'claude',
    options?: AnalyzeOptions,
  ): Promise<void> {
    await executeWithFallback(
      { codexClient: this.codexClient, claudeClient: this.claudeClient },
      promptTemplate,
      outputFilePath,
      repoPath,
      agent,
      options,
    );
  }

  private injectCustomInstruction(prompt: string, customInstruction?: string): string {
    return injectInstruction(prompt, customInstruction);
  }

  private validateAnalysisResult<T extends BugCandidate | RefactorCandidate>(
    candidates: T[],
    candidateType: 'bug' | 'refactor',
  ): T[] {
    return validateAnalysisResultImpl(candidates, candidateType);
  }

  private readBugOutputFile(filePath: string): BugCandidate[] {
    return parseBugOutputFile(filePath);
  }

  private readRefactorOutputFile(filePath: string): RefactorCandidate[] {
    return parseRefactorOutputFile(filePath);
  }

  private readEnhancementOutputFile(filePath: string): EnhancementProposal[] {
    return parseEnhancementOutputFile(filePath);
  }

  public parseEnhancementProposals(rawContent: string): EnhancementProposal[] {
    return parseEnhancementProposalsImpl(rawContent);
  }

  private cleanupOutputFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath, { force: true });
        logger.debug(`Cleaned up output file: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup output file: ${getErrorMessage(error)}`);
    }
  }

  private validateBugCandidate(candidate: BugCandidate): boolean {
    return validateBugCandidateImpl(candidate);
  }

  private validateRefactorCandidate(candidate: RefactorCandidate): boolean {
    return validateRefactorCandidateImpl(candidate);
  }

  private validateEnhancementProposal(proposal: EnhancementProposal): boolean {
    return validateEnhancementProposalImpl(proposal);
  }

  private maybeBackupInvalidJson(filePath: string, parsedLength: number): void {
    try {
      if (parsedLength > 0 || !fs.existsSync(filePath)) {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8').trim();
      if (!content || content === '[]') {
        return;
      }

      this.saveInvalidJsonBackup(filePath);
    } catch (error) {
      logger.error(`Failed to inspect output file for backup: ${getErrorMessage(error)}`);
    }
  }

  private saveInvalidJsonBackup(originalPath: string): string | null {
    try {
      if (!fs.existsSync(originalPath)) {
        return null;
      }

      const backupPath = originalPath.replace(/\.json$/, '.invalid.json');
      fs.copyFileSync(originalPath, backupPath);
      logger.warn(`Saved invalid JSON to ${backupPath} for debugging`);
      return backupPath;
    } catch (error) {
      logger.error(`Failed to save invalid JSON backup: ${getErrorMessage(error)}`);
      return null;
    }
  }

  private async collectRepositoryCode(repoPath: string): Promise<string> {
    const codeFiles: string[] = [];

    const collectFiles = async (dir: string): Promise<void> => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(repoPath, fullPath);

        if (entry.isDirectory()) {
          if (!isExcludedDirectory(relativePath)) {
            await collectFiles(fullPath);
          }
        } else if (entry.isFile()) {
          if (!isExcludedFile(relativePath)) {
            const ext = path.extname(entry.name);
            if (
              [
                '.ts',
                '.tsx',
                '.js',
                '.jsx',
                '.py',
                '.go',
                '.java',
                '.c',
                '.cpp',
                '.h',
                '.hpp',
                '.rs',
                '.rb',
                '.php',
              ].includes(ext)
            ) {
              try {
                const content = await fsp.readFile(fullPath, 'utf-8');
                codeFiles.push(`\n// File: ${relativePath}\n${content}`);
              } catch (error) {
                logger.warn(`Failed to read file ${relativePath}: ${getErrorMessage(error)}`);
              }
            }
          }
        }
      }
    };

    await collectFiles(repoPath);

    const totalChars = codeFiles.reduce((sum, file) => sum + file.length, 0);
    logger.info(
      `Collected ${codeFiles.length} source files (${totalChars.toLocaleString()} chars)`,
    );

    return codeFiles.join('\n\n');
  }
}

export { isExcludedDirectory, isExcludedFile } from './analyzer/path-exclusion.js';
