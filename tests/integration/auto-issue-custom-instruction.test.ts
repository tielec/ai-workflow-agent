/**
 * Integration tests for Issue #466: RepositoryAnalyzer custom instruction prompts
 *
 * Scenarios: IT-001〜IT-006 from .ai-workflow/issue-466/03_test_scenario/output/test-scenario.md
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { RepositoryAnalyzer } from '../../src/core/repository-analyzer.js';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';

jest.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

type OutputPrefix = 'bugs' | 'refactor' | 'enhancements';

describe('Integration: RepositoryAnalyzer custom instruction prompts (Issue #466)', () => {
  let mockCodexClient: jest.Mocked<CodexAgentClient>;
  let mockClaudeClient: jest.Mocked<ClaudeAgentClient>;
  let analyzer: RepositoryAnalyzer;
  let tempDir: string;

  const outputPath = (prefix: OutputPrefix) => path.join(tempDir, `${prefix}-output.json`);
  const prepareOutputFile = async (prefix: OutputPrefix, payload: unknown) => {
    await fs.outputFile(outputPath(prefix), JSON.stringify(payload, null, 2), 'utf-8');
  };

  beforeEach(() => {
    mockCodexClient = { executeTask: jest.fn() } as unknown as jest.Mocked<CodexAgentClient>;
    mockClaudeClient = { executeTask: jest.fn() } as unknown as jest.Mocked<ClaudeAgentClient>;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-analyzer-int-'));

    analyzer = new RepositoryAnalyzer(mockCodexClient, mockClaudeClient, {
      outputFileFactory: (prefix: OutputPrefix) => outputPath(prefix),
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('reflects custom instruction in bug detection prompt (IT-001)', async () => {
    // Validates bug prompts include the priority block and instruction ahead of detection patterns.
    await prepareOutputFile('bugs', { bugs: [] });
    mockCodexClient.executeTask.mockResolvedValue([]);

    await analyzer.analyze('/repo', 'codex', {
      customInstruction: 'セキュリティ脆弱性を優先的に検出してください',
    });

    const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
    expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
    expect(promptArg.prompt).toContain('セキュリティ脆弱性を優先的に検出してください');
    expect(promptArg.prompt).toContain('最優先で実行してください');

    const customIndex = promptArg.prompt.indexOf('## 最優先');
    const detectionIndex = promptArg.prompt.indexOf('# 検出対象パターン');
    expect(customIndex).toBeGreaterThan(-1);
    expect(detectionIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeLessThan(detectionIndex);
  });

  it('reflects custom instruction in refactor detection prompt (IT-002)', async () => {
    // Ensures refactor prompts inject the emphasized custom block before detection patterns.
    await prepareOutputFile('refactor', []);
    mockCodexClient.executeTask.mockResolvedValue([]);

    await analyzer.analyzeForRefactoring('/repo', 'codex', {
      customInstruction: '古いドキュメントを削除対象としてリストアップ',
    });

    const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
    expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
    expect(promptArg.prompt).toContain('古いドキュメントを削除対象としてリストアップ');
    expect(promptArg.prompt).toContain('他のすべての検出ルールよりも優先されます。');

    const customIndex = promptArg.prompt.indexOf('## 最優先');
    const detectionIndex = promptArg.prompt.indexOf('## 検出対象パターン');
    expect(customIndex).toBeGreaterThan(-1);
    expect(detectionIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeLessThan(detectionIndex);
  });

  it('reflects custom instruction in enhancement proposal prompt (IT-003)', async () => {
    // Verifies enhancement prompts place the custom block ahead of the task section.
    await prepareOutputFile('enhancements', []);
    mockCodexClient.executeTask.mockResolvedValue([]);

    await analyzer.analyzeForEnhancements('/repo', 'codex', {
      customInstruction: 'CI/CD改善に焦点を当てた提案を生成',
    });

    const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
    expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
    expect(promptArg.prompt).toContain('CI/CD改善に焦点を当てた提案を生成');
    expect(promptArg.prompt).toContain('直接関連する項目のみを検出し、無関係な項目は出力しないでください。');

    const customIndex = promptArg.prompt.indexOf('## 最優先');
    const taskIndex = promptArg.prompt.indexOf('## タスク');
    expect(customIndex).toBeGreaterThan(-1);
    expect(taskIndex).toBeGreaterThan(-1);
    expect(customIndex).toBeLessThan(taskIndex);
  });

  it('omits custom instruction section when not provided (IT-004)', async () => {
    // Confirms prompts stay backward compatible without custom instructions.
    await prepareOutputFile('bugs', { bugs: [] });
    mockCodexClient.executeTask.mockResolvedValue([]);

    await analyzer.analyze('/repo', 'codex');

    const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
    expect(promptArg.prompt).not.toContain('## 最優先');
    expect(promptArg.prompt).not.toContain('{custom_instruction}');
    expect(promptArg.prompt).toContain('# 検出対象パターン');
  });

  it('maintains backward compatibility across all categories (IT-005)', async () => {
    // Checks all categories skip the priority block when instructions are absent.
    mockCodexClient.executeTask.mockResolvedValue([]);

    await prepareOutputFile('bugs', { bugs: [] });
    await analyzer.analyze('/repo', 'codex');

    await prepareOutputFile('refactor', []);
    await analyzer.analyzeForRefactoring('/repo', 'codex');

    await prepareOutputFile('enhancements', []);
    await analyzer.analyzeForEnhancements('/repo', 'codex');

    const prompts = mockCodexClient.executeTask.mock.calls.map((call) => call[0].prompt);
    expect(prompts).toHaveLength(3);

    prompts.forEach((prompt) => {
      expect(prompt).not.toContain('## 最優先');
      expect(prompt).not.toContain('{custom_instruction}');
    });
  });

  it('preserves custom instruction during Codex to Claude fallback (IT-006)', async () => {
    // Ensures fallback to Claude still carries the injected custom instruction block.
    await prepareOutputFile('bugs', { bugs: [] });
    mockCodexClient.executeTask.mockRejectedValue(new Error('Codex offline'));
    mockClaudeClient.executeTask.mockResolvedValue([]);

    await analyzer.analyze('/repo', 'auto', {
      customInstruction: 'テスト指示',
    });

    expect(mockClaudeClient.executeTask).toHaveBeenCalled();
    const claudePromptArg = mockClaudeClient.executeTask.mock.calls[0][0];
    expect(claudePromptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
    expect(claudePromptArg.prompt).toContain('テスト指示');
  });
});
