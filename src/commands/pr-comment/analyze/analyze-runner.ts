import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { logger } from '../../../utils/logger.js';
import { getErrorMessage } from '../../../utils/error-utils.js';
import { CodexAgentClient } from '../../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../../core/claude-agent-client.js';
import { LogFormatter } from '../../../phases/formatters/log-formatter.js';
import type { PRCommentMetadataManager } from '../../../core/pr-comment/metadata-manager.js';
import type { PRCommentAnalyzeOptions } from '../../../types/commands.js';
import type {
  CommentMetadata,
  ResponsePlan,
} from '../../../types/pr-comment.js';
import { persistAgentLog, setupAgent } from './agent-utils.js';
import { buildAnalyzePrompt } from './prompt-builder.js';
import {
  handleAgentError,
  handleEmptyOutputError,
} from './error-handlers.js';
import { applyPlanDefaults } from './response-normalizer.js';
import { resolveResponsePlan } from './response-plan-loader.js';

export async function analyzeComments(
  prNumber: number,
  repoRoot: string,
  metadataManager: PRCommentMetadataManager,
  comments: CommentMetadata[],
  options: PRCommentAnalyzeOptions,
): Promise<ResponsePlan> {
  const persistMetadata = !options.dryRun;
  const agent = await setupAgent(options.agent ?? 'auto', repoRoot);
  const analyzeDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'analyze');
  const outputDir = path.join(repoRoot, '.ai-workflow', `pr-${prNumber}`, 'output');
  const outputFilePath = path.join(outputDir, 'response-plan.json');
  const prompt = await buildAnalyzePrompt(
    prNumber,
    repoRoot,
    metadataManager,
    comments,
    outputFilePath,
  );

  if (!options.dryRun) {
    await fsp.mkdir(analyzeDir, { recursive: true });
    await fsp.mkdir(outputDir, { recursive: true });
    await fsp.writeFile(path.join(analyzeDir, 'prompt.txt'), prompt, 'utf-8');
  }

  if (!agent) {
    const fallbackPlan = await handleAgentError(
      'No agent client available (Codex and Claude both unavailable)',
      'agent_execution_error',
      metadataManager,
      prNumber,
      comments,
      persistMetadata,
    );

    if (fallbackPlan) {
      return applyPlanDefaults(fallbackPlan, options);
    }

    throw new Error('Unexpected state: agent error handler did not exit or return fallback plan');
  }

  const logFormatter = new LogFormatter();
  const agentName = agent instanceof CodexAgentClient ? 'Codex Agent' : 'Claude Agent';
  let rawOutput = '';
  let messages: string[] = [];
  const startTime = Date.now();
  let endTime = startTime;

  try {
    messages = await agent.executeTask({
      prompt,
      maxTurns: 1,
      verbose: false,
      workingDirectory: repoRoot,
    });
    endTime = Date.now();
    rawOutput = messages.join('\n');

    await persistAgentLog(
      {
        messages,
        startTime,
        endTime,
        duration: endTime - startTime,
        agentName,
        error: null,
      },
      analyzeDir,
      options,
      logFormatter,
    );
  } catch (agentError) {
    endTime = Date.now();
    const duration = endTime - startTime;
    const normalizedError =
      agentError instanceof Error ? agentError : new Error(getErrorMessage(agentError));

    await persistAgentLog(
      {
        messages,
        startTime,
        endTime,
        duration,
        agentName,
        error: normalizedError,
      },
      analyzeDir,
      options,
      logFormatter,
    );

    const fallbackPlan = await handleAgentError(
      getErrorMessage(agentError),
      'agent_execution_error',
      metadataManager,
      prNumber,
      comments,
      persistMetadata,
    );

    if (fallbackPlan) {
      return applyPlanDefaults(fallbackPlan, options);
    }

    throw new Error('Unexpected state: agent error handler did not exit or return fallback plan');
  }

  if (rawOutput.trim().length === 0) {
    const fallbackPlan = await handleEmptyOutputError(
      metadataManager,
      prNumber,
      comments,
      persistMetadata,
    );

    if (fallbackPlan) {
      return applyPlanDefaults(fallbackPlan, options);
    }

    throw new Error('Unexpected state: empty output handler did not exit or return fallback plan');
  }

  const plan = await resolveResponsePlan({
    rawOutput,
    prNumber,
    outputFilePath,
    metadataManager,
    comments,
    persistMetadata,
  });
  return applyPlanDefaults(plan, options);
}
