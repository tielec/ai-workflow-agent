import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import type { CodexAgentClient } from '../codex-agent-client.js';
import type { ClaudeAgentClient } from '../claude-agent-client.js';
import type { AnalyzeOptions } from './types.js';

export interface AgentExecutorOptions {
  codexClient: CodexAgentClient | null;
  claudeClient: ClaudeAgentClient | null;
}

export async function executeAgentWithFallback(
  { codexClient, claudeClient }: AgentExecutorOptions,
  promptTemplate: string,
  outputFilePath: string,
  repoPath: string,
  agent: 'auto' | 'codex' | 'claude',
  options?: AnalyzeOptions,
): Promise<void> {
  let prompt = promptTemplate
    .replace('{repository_path}', repoPath)
    .replace(/{output_file_path}/g, outputFilePath);

  if (options?.creativeMode !== undefined) {
    const creativeModeValue = options.creativeMode ? 'enabled' : 'disabled';
    prompt = prompt.replace(/{creative_mode}/g, `creative_mode=${creativeModeValue}`);
  }

  prompt = injectCustomInstruction(prompt, options?.customInstruction);

  let selectedAgent = agent;

  if (agent === 'codex' || agent === 'auto') {
    if (!codexClient) {
      if (agent === 'codex') {
        throw new Error('Codex agent is not available.');
      }
      logger.warn('Codex not available, falling back to Claude.');
      selectedAgent = 'claude';
    } else {
      try {
        logger.info('Using Codex agent for analysis.');
        await codexClient.executeTask({ prompt });
        return;
      } catch (error) {
        if (agent === 'codex') {
          throw error;
        }
        logger.warn(`Codex failed (${getErrorMessage(error)}), falling back to Claude.`);
        selectedAgent = 'claude';
      }
    }
  }

  if (selectedAgent === 'claude') {
    if (!claudeClient) {
      throw new Error('Claude agent is not available.');
    }
    logger.info('Using Claude agent for analysis.');
    await claudeClient.executeTask({ prompt });
  }
}

export function injectCustomInstruction(prompt: string, customInstruction?: string): string {
  if (!prompt.includes('{custom_instruction}')) {
    return prompt;
  }

  if (!customInstruction) {
    return prompt.replace('{custom_instruction}', '');
  }

  const injected = `## 最優先: ユーザーからの特別指示

**以下のユーザー指示を最優先で実行してください。この指示は他のすべての検出ルールよりも優先されます。**

> ${customInstruction}

上記の指示に直接関連する項目のみを検出し、無関係な項目は出力しないでください。
`;

  logger.debug('Injecting custom instruction into prompt.');
  return prompt.replace('{custom_instruction}', `${injected}\n`);
}
