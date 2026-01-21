import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { logger } from '../../../utils/logger.js';
import { getErrorMessage } from '../../../utils/error-utils.js';
import { config } from '../../../core/config.js';
import { resolveAgentCredentials, setupAgentClients } from '../../execute/agent-setup.js';
import { CodexAgentClient } from '../../../core/codex-agent-client.js';
import { ClaudeAgentClient } from '../../../core/claude-agent-client.js';
import { LogFormatter } from '../../../phases/formatters/log-formatter.js';
import type { PRCommentAnalyzeOptions } from '../../../types/commands.js';

export async function setupAgent(
  agentMode: 'auto' | 'codex' | 'claude',
  repoRoot: string,
): Promise<CodexAgentClient | ClaudeAgentClient | null> {
  const homeDir = config.getHomeDir();
  const credentials = resolveAgentCredentials(homeDir, repoRoot);
  const { codexClient, claudeClient } = setupAgentClients(agentMode, repoRoot, credentials);

  if (!codexClient && !claudeClient) {
    logger.warn('No agent client available. Analyze will use a fallback plan or exit based on environment.');
  }

  return codexClient ?? claudeClient;
}

interface AgentLogContext {
  messages: string[];
  startTime: number;
  endTime: number;
  duration: number;
  agentName: string;
  error: Error | null;
}

export async function persistAgentLog(
  context: AgentLogContext,
  analyzeDir: string,
  options: PRCommentAnalyzeOptions,
  logFormatter: LogFormatter,
): Promise<void> {
  if (options.dryRun) {
    return;
  }

  const agentLogPath = path.join(analyzeDir, 'agent_log.md');

  try {
    const content = logFormatter.formatAgentLog(
      context.messages,
      context.startTime,
      context.endTime,
      context.duration,
      context.error,
      context.agentName,
    );
    await fsp.writeFile(agentLogPath, content, 'utf-8');
  } catch (formatError) {
    logger.warn(`LogFormatter failed: ${getErrorMessage(formatError)}. Falling back to raw output.`);
    await fsp.writeFile(agentLogPath, context.messages.join('\n'), 'utf-8');
  }
}
