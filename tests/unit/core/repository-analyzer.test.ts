import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import type { CodexAgentClient } from '../../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../../src/core/claude-agent-client.js';
import type {
  BugCandidate,
  RefactorCandidate,
  EnhancementProposal,
} from '../../../src/types/auto-issue.js';

jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

type OutputPrefix = 'bugs' | 'refactor' | 'enhancements';

describe('RepositoryAnalyzer', () => {
  let mockCodexClient: jest.Mocked<CodexAgentClient>;
  let mockClaudeClient: jest.Mocked<ClaudeAgentClient>;
  let analyzer: RepositoryAnalyzer;
  let tempDir: string;
  let outputPaths: Record<OutputPrefix, string>;

  const ensureOutputDir = () => {
    fs.ensureDirSync(tempDir);
  };

  const writeOutput = async (prefix: OutputPrefix, payload: unknown) => {
    ensureOutputDir();
    const serialized =
      typeof payload === 'string' ? (payload as string) : JSON.stringify(payload, null, 2);
    await fs.outputFile(outputPaths[prefix], serialized, 'utf-8');
  };

  const mockCodexSuccess = (prefix: OutputPrefix, payload: unknown) => {
    mockCodexClient.executeTask.mockImplementation(async () => {
      await writeOutput(prefix, payload);
      return [];
    });
  };

  const mockClaudeSuccess = (prefix: OutputPrefix, payload: unknown) => {
    mockClaudeClient.executeTask.mockImplementation(async () => {
      await writeOutput(prefix, payload);
      return [];
    });
  };

  beforeEach(() => {
    mockCodexClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<CodexAgentClient>;

    mockClaudeClient = {
      executeTask: jest.fn(),
    } as unknown as jest.Mocked<ClaudeAgentClient>;

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-analyzer-test-'));
    outputPaths = {
      bugs: path.join(tempDir, 'bugs-output.json'),
      refactor: path.join(tempDir, 'refactor-output.json'),
      enhancements: path.join(tempDir, 'enhancements-output.json'),
    };

    analyzer = new RepositoryAnalyzer(mockCodexClient, mockClaudeClient, {
      outputFileFactory: (prefix: OutputPrefix) => outputPaths[prefix],
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(tempDir);
  });

  it('analyze returns bug candidates when Codex writes output file', async () => {
    const bugCandidate: BugCandidate = {
      title: 'エラーハンドリングの欠如による重大なクラッシュ',
      file: 'src/core/codex-agent-client.ts',
      line: 42,
      severity: 'high',
      description:
        'executeTask() で child_process.spawn のエラーがハンドリングされておらず、プロセス失敗時にアプリケーションがクラッシュする恐れがあります。',
      suggestedFix:
        'spawn からのエラーイベントを監視し、Promise を reject して呼び出し側がリカバリーできるようにしてください。',
      category: 'bug',
    };

    mockCodexSuccess('bugs', { bugs: [bugCandidate] });

    const result = await analyzer.analyze('/repo', 'codex');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: bugCandidate.title,
      file: bugCandidate.file,
      severity: 'high',
    });
    expect(mockCodexClient.executeTask).toHaveBeenCalledTimes(1);
    const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
    expect(promptArg.prompt).toContain(outputPaths.bugs);
  });

  it('analyze falls back to Claude when Codex fails in auto mode', async () => {
    mockCodexClient.executeTask.mockRejectedValue(new Error('Codex offline'));

    mockClaudeSuccess('bugs', {
      bugs: [
        {
          title: 'ログ出力不足により障害調査が困難',
          file: 'src/utils/logger.ts',
          line: 10,
          severity: 'medium',
          description:
            'アプリケーション全体で logger.warn がサイレントに失敗する構成があり、障害発生時にイベントを追跡できません。',
          suggestedFix:
            'logger.warn 実行時に例外を握りつぶさず、fallback ハンドラで stderr へ出力してください。',
          category: 'bug',
        },
      ],
    });

    const result = await analyzer.analyze('/repo', 'auto');

    expect(result).toHaveLength(1);
    expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
  });

  it('analyze throws when Codex fails in forced mode', async () => {
    mockCodexClient.executeTask.mockRejectedValue(new Error('fatal Codex error'));

    await expect(analyzer.analyze('/repo', 'codex')).rejects.toThrow('fatal Codex error');
    expect(mockClaudeClient.executeTask).not.toHaveBeenCalled();
  });

  it('excludes invalid bug candidates from validation result', async () => {
    mockCodexSuccess('bugs', {
      bugs: [
        {
          title: 'short', // invalid: too short
          file: 'src/main.ts',
          line: 1,
          severity: 'high',
          description: 'a'.repeat(60),
          suggestedFix: 'Add validation around input payload to avoid runtime errors.',
          category: 'bug',
        },
      ],
    });

    const result = await analyzer.analyze('/repo', 'codex');

    expect(result).toEqual([]);
  });

  it('returns empty array when output file contains invalid JSON', async () => {
    mockCodexSuccess('bugs', '{ invalid json }');

    const result = await analyzer.analyze('/repo', 'codex');

    expect(result).toEqual([]);
  });

  it('analyzeForRefactoring returns validated candidates', async () => {
    const refactorCandidate: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/services/report-service.ts',
      description: '1,000 行を超える巨大ファイルであり、責務分離が必要です。',
      suggestion: '集計ロジックとプレゼンテーションロジックを別ファイルに切り出してください。',
      priority: 'high',
      lineRange: { start: 10, end: 900 },
    };

    jest
      .spyOn(
        analyzer as unknown as { collectRepositoryCode: () => Promise<string> },
        'collectRepositoryCode',
      )
      .mockResolvedValue('mock repo code');
    mockCodexSuccess('refactor', [refactorCandidate]);

    const result = await analyzer.analyzeForRefactoring('/repo', 'codex');

    expect(result).toHaveLength(1);
    expect(result[0].filePath).toBe(refactorCandidate.filePath);
  });

  it('analyzeForRefactoring filters invalid entries', async () => {
    jest
      .spyOn(
        analyzer as unknown as { collectRepositoryCode: () => Promise<string> },
        'collectRepositoryCode',
      )
      .mockResolvedValue('mock repo code');
    mockCodexSuccess('refactor', [
      {
        type: 'invalid-type',
        filePath: 'src/app.ts',
        description: 'Does not matter',
        suggestion: 'Still invalid',
        priority: 'low',
      },
    ]);

    const result = await analyzer.analyzeForRefactoring('/repo', 'codex');

    expect(result).toEqual([]);
  });

  it('analyzeForEnhancements returns proposals and honors creative mode', async () => {
    const proposal: EnhancementProposal = {
      type: 'improvement',
      title: 'A'.repeat(60),
      description: 'B'.repeat(150),
      rationale: 'C'.repeat(80),
      implementation_hints: ['ora ライブラリでスピナー実装', 'chalk で色分け'],
      expected_impact: 'high',
      effort_estimate: 'small',
      related_files: ['src/main.ts'],
    };

    mockCodexSuccess('enhancements', [proposal]);

    const result = await analyzer.analyzeForEnhancements('/repo', 'codex', { creativeMode: true });

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('improvement');

    const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
    expect(promptArg.prompt).toContain('creative_mode');
    expect(promptArg.prompt).toContain('enabled');
  });

  it('filters invalid enhancement proposals', async () => {
    mockCodexSuccess('enhancements', [
      {
        type: 'improvement',
        title: '短い', // invalid
        description: 'a'.repeat(120),
        rationale: 'a'.repeat(60),
        implementation_hints: ['hint'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['src/main.ts'],
      },
    ]);

    const result = await analyzer.analyzeForEnhancements('/repo', 'codex');

    expect(result).toEqual([]);
  });

  describe('custom instruction injection', () => {
    const invokeInjection = (prompt: string, instruction?: string) =>
      (analyzer as unknown as { injectCustomInstruction: (p: string, c?: string) => string }).injectCustomInstruction(
        prompt,
        instruction,
      );

    it('injects custom instruction with priority emphasis', () => {
      // Ensures the priority block is injected with emphasis and placeholder removal.
      const prompt = 'Header\n{custom_instruction}\n# 重要な注意事項';
      const result = invokeInjection(prompt, 'セキュリティ脆弱性を重点的に検出してください');

      expect(result).toContain('## 最優先: ユーザーからの特別指示');
      expect(result).toContain('**以下のユーザー指示を最優先で実行してください。');
      expect(result).toContain('他のすべての検出ルールよりも優先されます。**');
      expect(result).toContain('直接関連する項目のみを検出');
      expect(result).toContain('> セキュリティ脆弱性を重点的に検出してください');
      expect(result).not.toContain('{custom_instruction}');
    });

    it('injects long custom instruction correctly', () => {
      // Verifies a 500-character instruction stays intact inside the quoted block.
      const prompt = 'Header\n{custom_instruction}\n# 検出対象パターン';
      const longInstruction = 'テ'.repeat(500);
      const result = invokeInjection(prompt, longInstruction);

      expect(result).toContain('## 最優先: ユーザーからの特別指示');
      expect(result).toContain(`> ${longInstruction}`);
    });

    it('injects custom instruction with special characters', () => {
      // Confirms multi-line instructions with bullet-like lines remain preserved.
      const prompt = 'Header\n{custom_instruction}\n# 検出対象パターン';
      const specialInstruction = 'テスト指示\n- 項目1\n- 項目2';
      const result = invokeInjection(prompt, specialInstruction);

      expect(result).toContain('## 最優先: ユーザーからの特別指示');
      expect(result).toContain(`> ${specialInstruction}`);
    });

    it('contains all priority keywords in custom instruction section', () => {
      // Checks that all emphasis phrases remain in the injected section.
      const prompt = 'Header\n{custom_instruction}\n# パターン';
      const result = invokeInjection(prompt, 'テスト指示');

      expect(result).toContain('最優先');
      expect(result).toContain('最優先で実行してください');
      expect(result).toContain('他のすべての検出ルールよりも優先されます。');
      expect(result).toContain('直接関連する項目のみを検出');
      expect(result).toContain('無関係な項目は出力しないでください。');
    });

    it('removes placeholder when custom instruction is not provided', () => {
      // Treats undefined instruction as removal of the placeholder block.
      const prompt = 'Header\n{custom_instruction}\n# 重要な注意事項';
      const result = invokeInjection(prompt);

      expect(result).toBe('Header\n\n# 重要な注意事項');
      expect(result).not.toContain('## 最優先');
    });

    it('treats empty string instruction as no instruction', () => {
      // Ensures empty string behaves the same as undefined.
      const prompt = 'Header\n{custom_instruction}\n# 重要な注意事項';
      const result = invokeInjection(prompt, '');

      expect(result).toBe('Header\n\n# 重要な注意事項');
      expect(result).not.toContain('## 最優先');
    });

    it('leaves prompt unchanged when placeholder is missing', () => {
      // Confirms prompts without a placeholder are returned untouched.
      const prompt = 'Header\n# 重要な注意事項';
      const result = invokeInjection(prompt, 'テスト指示');

      expect(result).toBe(prompt);
    });

    it('passes injected prompt to bug analysis and places it before detection patterns', async () => {
      // Validates bug prompt includes the injected section before detection patterns.
      mockCodexSuccess('bugs', { bugs: [] });

      await analyzer.analyze('/repo', 'codex', {
        customInstruction: 'CI/CD改善に焦点を当ててください',
      });

      const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
      expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
      expect(promptArg.prompt).toContain('> CI/CD改善に焦点を当ててください');
      expect(promptArg.prompt).not.toContain('{custom_instruction}');

      const customInstructionIndex = promptArg.prompt.indexOf('## 最優先');
      const detectionPatternsIndex = promptArg.prompt.indexOf('# 検出対象パターン');
      expect(customInstructionIndex).toBeGreaterThan(-1);
      expect(detectionPatternsIndex).toBeGreaterThan(-1);
      expect(customInstructionIndex).toBeLessThan(detectionPatternsIndex);
    });

    it('places custom instruction before detection patterns in refactor analysis', async () => {
      // Checks refactor prompts place the custom block ahead of detection patterns.
      jest
        .spyOn(
          analyzer as unknown as { collectRepositoryCode: () => Promise<string> },
          'collectRepositoryCode',
        )
        .mockResolvedValue('mock repo code');
      mockCodexSuccess('refactor', []);

      await analyzer.analyzeForRefactoring('/repo', 'codex', {
        customInstruction: 'コード重複を検出',
      });

      const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
      expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
      const customInstructionIndex = promptArg.prompt.indexOf('## 最優先');
      const detectionPatternsIndex = promptArg.prompt.indexOf('## 検出対象パターン');
      expect(customInstructionIndex).toBeGreaterThan(-1);
      expect(detectionPatternsIndex).toBeGreaterThan(-1);
      expect(customInstructionIndex).toBeLessThan(detectionPatternsIndex);
    });

    it('places custom instruction before task description in enhancement analysis', async () => {
      // Ensures enhancement prompts show the custom block ahead of task description.
      mockCodexSuccess('enhancements', []);

      await analyzer.analyzeForEnhancements('/repo', 'codex', {
        customInstruction: 'CI/CD改善を提案',
      });

      const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
      expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
      const customInstructionIndex = promptArg.prompt.indexOf('## 最優先');
      const taskDescriptionIndex = promptArg.prompt.indexOf('## タスク');
      expect(customInstructionIndex).toBeGreaterThan(-1);
      expect(taskDescriptionIndex).toBeGreaterThan(-1);
      expect(customInstructionIndex).toBeLessThan(taskDescriptionIndex);
    });

    it('omits custom section when custom instruction is undefined', async () => {
      // Confirms no custom section is included when instruction is absent.
      mockCodexSuccess('bugs', { bugs: [] });

      await analyzer.analyze('/repo', 'codex');

      const promptArg = mockCodexClient.executeTask.mock.calls[0][0];
      expect(promptArg.prompt).not.toContain('## 最優先');
      expect(promptArg.prompt).not.toContain('{custom_instruction}');
    });

    it('preserves custom instruction when falling back from Codex to Claude', async () => {
      // Ensures fallback flow still receives the injected custom instruction block.
      mockCodexClient.executeTask.mockRejectedValue(new Error('Codex offline'));
      mockClaudeSuccess('bugs', { bugs: [] });

      await analyzer.analyze('/repo', 'auto', {
        customInstruction: 'ネットワーク周辺の不具合を優先',
      });

      expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
      const promptArg = mockClaudeClient.executeTask.mock.calls[0][0];
      expect(promptArg.prompt).toContain('## 最優先: ユーザーからの特別指示');
      expect(promptArg.prompt).toContain('> ネットワーク周辺の不具合を優先');
    });
  });

  it('can analyze using Claude when Codex client is null', async () => {
    const claudeOnly = new RepositoryAnalyzer(null, mockClaudeClient, {
      outputFileFactory: (prefix: OutputPrefix) => outputPaths[prefix],
    });

    mockClaudeSuccess('enhancements', [
      {
        type: 'dx',
        title: 'D'.repeat(70),
        description: 'E'.repeat(150),
        rationale: 'F'.repeat(90),
        implementation_hints: ['bash/zsh 用の補完スクリプトを生成', 'README に利用方法を追加'],
        expected_impact: 'medium',
        effort_estimate: 'small',
        related_files: ['README.md'],
      },
    ]);

    const result = await claudeOnly.analyzeForEnhancements('/repo', 'claude');

    expect(result).toHaveLength(1);
    expect(mockClaudeClient.executeTask).toHaveBeenCalledTimes(1);
  });

  it('throws when no agents are available', async () => {
    const analyzerWithoutAgents = new RepositoryAnalyzer(null, null, {
      outputFileFactory: (prefix: OutputPrefix) => outputPaths[prefix],
    });

    await expect(analyzerWithoutAgents.analyze('/repo', 'auto')).rejects.toThrow(
      'Claude agent is not available.',
    );
  });
});
