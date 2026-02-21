/**
 * ユニットテスト: rewrite-issue コマンド
 *
 * テスト対象: src/commands/rewrite-issue.ts
 * シナリオ出典: test-scenario.md のユニット系 (TC-UNIT-001〜032)
 */
import { describe, it, beforeEach, afterEach, expect, jest } from '@jest/globals';

// モック関数定義
const mockGetIssueInfo = jest.fn();
const mockUpdateIssue = jest.fn();
const mockLoadPrompt = jest.fn();
const mockResolveAgentCredentials = jest.fn();
const mockSetupAgentClients = jest.fn();
const mockResolveLocalRepoPath = jest.fn();
const mockGetGitHubRepository = jest.fn();
const mockGetHomeDir = jest.fn();
const mockLoggerInfo = jest.fn();
const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockClaudeExecute = jest.fn();
const mockCodexExecute = jest.fn();
const mockAnalyzeWithGrade = jest.fn();
const mockGenerateFrontmatter = jest.fn();
const mockInsertFrontmatter = jest.fn();

// ESMモジュールのモック
await jest.unstable_mockModule('../../../src/core/github-client.js', () => ({
  __esModule: true,
  GitHubClient: class {
    constructor() {}
    getIssueInfo = mockGetIssueInfo;
    updateIssue = mockUpdateIssue;
  },
}));

await jest.unstable_mockModule('../../../src/core/prompt-loader.js', () => ({
  __esModule: true,
  PromptLoader: {
    loadPrompt: mockLoadPrompt,
  },
}));

await jest.unstable_mockModule('../../../src/commands/execute/agent-setup.js', () => ({
  __esModule: true,
  resolveAgentCredentials: mockResolveAgentCredentials,
  setupAgentClients: mockSetupAgentClients,
}));

await jest.unstable_mockModule('../../../src/core/repository-utils.js', () => ({
  __esModule: true,
  resolveLocalRepoPath: mockResolveLocalRepoPath,
}));

await jest.unstable_mockModule('../../../src/core/repository-analyzer.js', () => ({
  __esModule: true,
  RepositoryAnalyzer: jest.fn().mockImplementation(() => ({
    collectRepositoryCode: jest.fn().mockResolvedValue('code block'),
  })),
}));

await jest.unstable_mockModule('../../../src/core/config.js', () => ({
  __esModule: true,
  config: {
    getGitHubRepository: mockGetGitHubRepository,
    getHomeDir: mockGetHomeDir,
  },
}));

await jest.unstable_mockModule('../../../src/utils/logger.js', () => ({
  __esModule: true,
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

await jest.unstable_mockModule('../../../src/core/difficulty-analyzer.js', () => ({
  __esModule: true,
  DifficultyAnalyzer: class {
    constructor() {}
    analyzeWithGrade = mockAnalyzeWithGrade;
  },
}));

await jest.unstable_mockModule('../../../src/utils/frontmatter.js', () => ({
  __esModule: true,
  generateFrontmatter: mockGenerateFrontmatter,
  insertFrontmatter: mockInsertFrontmatter,
}));

const { handleRewriteIssueCommand } = await import('../../../src/commands/rewrite-issue.js');

describe('rewrite-issue command (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetGitHubRepository.mockReturnValue('owner/repo');
    mockGetHomeDir.mockReturnValue('/home/test');
    mockResolveLocalRepoPath.mockReturnValue('/tmp/repo');
    mockLoadPrompt.mockReturnValue(
      '{"title":"{ORIGINAL_TITLE}-new","body":"{ORIGINAL_BODY}\\nCTX:{REPOSITORY_CONTEXT}"}\n{CUSTOM_INSTRUCTION}',
    );
    mockGetIssueInfo.mockResolvedValue({
      number: 123,
      title: 'Old Title',
      body: 'Old Body',
      url: 'https://example.com/issue/123',
    });
    mockUpdateIssue.mockResolvedValue({ success: true, error: null });
    mockResolveAgentCredentials.mockReturnValue({});
    mockSetupAgentClients.mockReturnValue({
      codexClient: { executeTask: mockCodexExecute },
      claudeClient: { executeTask: mockClaudeExecute },
    });
    mockClaudeExecute.mockResolvedValue([
      '{"title":"New Title","body":"## 概要\\n新しい本文","metrics":{"completeness":80,"specificity":70}}',
    ]);
    mockCodexExecute.mockResolvedValue([
      '{"title":"Codex Title","body":"Codex Body","metrics":{"completeness":70,"specificity":60}}',
    ]);
    mockGenerateFrontmatter.mockReturnValue('---\ndifficulty: C\ndifficulty_label: moderate\n---');
    mockInsertFrontmatter.mockImplementation((body: string, frontmatter: string) => {
      return `${frontmatter}\n\n${body}`;
    });
    mockAnalyzeWithGrade.mockResolvedValue({
      grade: 'C',
      label: 'moderate',
      bug_risk: { expected_bugs: 1, probability: 20, risk_score: 0.2 },
      rationale: 'Test',
      assessed_by: 'claude',
      assessed_at: '2026-02-20T00:00:00.000Z',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('デフォルトオプションでdry-runプレビューとデフォルトメトリクス計算が行われる (TC-UNIT-001/015/021)', async () => {
    mockClaudeExecute.mockResolvedValueOnce(['{"title":"New","body":"## 概要\\n本文"}']); // metricsなし

    await handleRewriteIssueCommand({ issue: '123' });

    expect(mockGetIssueInfo).toHaveBeenCalledWith(123);
    expect(mockUpdateIssue).not.toHaveBeenCalled();
    expect(mockLoggerInfo).toHaveBeenCalledWith('  REWRITE-ISSUE PREVIEW (dry-run)');
    const metricsLog = mockLoggerInfo.mock.calls
      .map((c) => c[0])
      .find((m) => typeof m === 'string' && m.includes('Completeness Score'));
    expect(metricsLog).toMatch(/Completeness Score: \d+\/100/);
  });

  it('apply指定時にupdateIssueが呼ばれる (TC-INT-004 相当)', async () => {
    await handleRewriteIssueCommand({ issue: 456, apply: true, agent: 'codex' });

    expect(mockUpdateIssue).toHaveBeenCalledWith(456, {
      title: 'Codex Title',
      body: expect.stringContaining('difficulty: C'),
    });
    expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully updated issue #456');
  });

  it('難易度判定結果がfrontmatterに挿入される (TC-INT-013)', async () => {
    await handleRewriteIssueCommand({ issue: 999, apply: true });

    const updatePayload = mockUpdateIssue.mock.calls[0][1] as { title: string; body: string };
    expect(updatePayload.body.startsWith('---')).toBe(true);
    expect(updatePayload.body).toContain('difficulty: C');
    expect(updatePayload.body).toContain('difficulty_label: moderate');
    expect(updatePayload.body).toContain('## 概要');
  });

  it('難易度判定が失敗してもfrontmatterなしで続行する (TC-INT-014)', async () => {
    mockAnalyzeWithGrade.mockRejectedValueOnce(new Error('grade failed'));

    await handleRewriteIssueCommand({ issue: 1000, apply: true });

    const updatePayload = mockUpdateIssue.mock.calls[0][1] as { title: string; body: string };
    expect(updatePayload.body.startsWith('---')).toBe(false);
    expect(mockGenerateFrontmatter).not.toHaveBeenCalled();
    expect(mockInsertFrontmatter).not.toHaveBeenCalled();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Difficulty assessment failed'),
    );
  });

  describe('frontmatter挿入フロー', () => {
    it('dry-runでfrontmatter付き差分プレビューが表示される (TC-RW-FM-001)', async () => {
      // Given
      mockGenerateFrontmatter.mockReturnValue('---\ndifficulty: C\ndifficulty_label: moderate\n---');
      mockInsertFrontmatter.mockReturnValue(
        '---\ndifficulty: C\ndifficulty_label: moderate\n---\n\n## 概要\n新しい本文',
      );

      // When
      await handleRewriteIssueCommand({ issue: 123 });

      // Then
      expect(mockUpdateIssue).not.toHaveBeenCalled();
      expect(mockGenerateFrontmatter).toHaveBeenCalledWith(
        expect.objectContaining({ grade: 'C', label: 'moderate' }),
      );
      expect(mockInsertFrontmatter).toHaveBeenCalledWith(
        '## 概要\n新しい本文',
        '---\ndifficulty: C\ndifficulty_label: moderate\n---',
      );
      const infoLogs = mockLoggerInfo.mock.calls.map((call) => call[0]);
      expect(
        infoLogs.some((log) => typeof log === 'string' && log.includes('difficulty: C')),
      ).toBe(true);
      expect(
        infoLogs.some(
          (log) => typeof log === 'string' && log.includes('Difficulty assessment: grade=C'),
        ),
      ).toBe(true);
    });

    it('applyモードでfrontmatter付きbodyが更新される (TC-RW-FM-002)', async () => {
      // Given
      mockGenerateFrontmatter.mockReturnValue('---\ndifficulty: C\ndifficulty_label: moderate\n---');
      mockInsertFrontmatter.mockReturnValue(
        '---\ndifficulty: C\ndifficulty_label: moderate\n---\n\n## 概要\n新しい本文',
      );

      // When
      await handleRewriteIssueCommand({ issue: 456, apply: true });

      // Then
      expect(mockUpdateIssue).toHaveBeenCalledWith(456, {
        title: 'New Title',
        body: expect.stringContaining('difficulty: C'),
      });
      expect(mockInsertFrontmatter).toHaveBeenCalled();
    });

    it('難易度判定失敗時はfrontmatterなしで継続する (TC-RW-FM-003)', async () => {
      // Given
      mockAnalyzeWithGrade.mockRejectedValueOnce(new Error('Assessment failed'));

      // When
      await handleRewriteIssueCommand({ issue: 789 });

      // Then
      expect(mockUpdateIssue).not.toHaveBeenCalled();
      expect(mockGenerateFrontmatter).not.toHaveBeenCalled();
      expect(mockInsertFrontmatter).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('Difficulty assessment failed'),
      );
    });
  });

  it('無効なIssue番号でバリデーションエラー (TC-UNIT-004/005/006/007)', async () => {
    await expect(handleRewriteIssueCommand({})).rejects.toThrow('--issue option is required.');
    await expect(handleRewriteIssueCommand({ issue: 'abc' })).rejects.toThrow(
      'Invalid issue number: "abc"',
    );
    await expect(handleRewriteIssueCommand({ issue: -1 })).rejects.toThrow(
      'Invalid issue number: "-1"',
    );
    await expect(handleRewriteIssueCommand({ issue: 0 })).rejects.toThrow(
      'Invalid issue number: "0"',
    );
  });

  it('無効なlanguage/agentでエラー (TC-UNIT-008/009)', async () => {
    await expect(handleRewriteIssueCommand({ issue: 1, language: 'fr' as any })).rejects.toThrow(
      'Invalid language: "fr". Allowed values: ja, en',
    );
    await expect(handleRewriteIssueCommand({ issue: 1, agent: 'gpt4' as any })).rejects.toThrow(
      'Invalid agent: "gpt4". Allowed values: auto, codex, claude',
    );
  });

  it('GITHUB_REPOSITORY未設定でエラー (TC-UNIT-012)', async () => {
    mockGetGitHubRepository.mockReturnValueOnce(undefined);
    await expect(handleRewriteIssueCommand({ issue: 10 })).rejects.toThrow(
      'GITHUB_REPOSITORY environment variable is required.',
    );
  });

  it('Claude失敗時にCodexへフォールバックする (TC-INT-006)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('claude down'));
    mockCodexExecute.mockResolvedValueOnce([
      '{"title":"Codex Fallback","body":"Codex Body Fallback"}',
    ]);

    await handleRewriteIssueCommand({ issue: 77, agent: 'auto' });

    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.stringContaining('Claude agent failed'));
    expect(mockCodexExecute).toHaveBeenCalledTimes(1);
    expect(mockUpdateIssue).not.toHaveBeenCalled();
  });

  it('すべてのエージェントが失敗すると例外 (TC-INT-007)', async () => {
    mockClaudeExecute.mockRejectedValueOnce(new Error('c fail'));
    mockCodexExecute.mockRejectedValueOnce(new Error('x fail'));

    await expect(handleRewriteIssueCommand({ issue: 88 })).rejects.toThrow(
      'All agents failed to generate rewritten issue content.',
    );
  });

  it('リポジトリコンテキスト取得に失敗してもフォールバックで継続 (TC-INT-012)', async () => {
    mockResolveLocalRepoPath.mockReturnValue('/path/does/not/exist');

    await handleRewriteIssueCommand({ issue: 5 });

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get repository context'),
    );
  });

  describe('custom-instruction オプション', () => {
    describe('正常系', () => {
      it('カスタムインストラクション指定時にプロンプトに追加指示が含まれる (TC-CI-001)', async () => {
        // Given: カスタムインストラクション指定時に追加指示セクションが注入されること
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: 'セキュリティ観点を重視してください',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('追加の指示');
        expect(callArgs.prompt).toContain('セキュリティ観点を重視してください');
        expect(callArgs.prompt).not.toContain('{CUSTOM_INSTRUCTION}');
      });

      it('カスタムインストラクション未指定時に追加指示セクションが含まれない (TC-CI-002)', async () => {
        // Given: カスタムインストラクション未指定時に追加指示セクションが含まれないこと
        await handleRewriteIssueCommand({ issue: '42' });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).not.toContain('追加の指示');
        expect(callArgs.prompt).not.toContain('Additional Instructions');
        expect(callArgs.prompt).not.toContain('{CUSTOM_INSTRUCTION}');
      });

      it('英語モードでのカスタムインストラクション注入 (TC-CI-003)', async () => {
        // Given: 英語モード時に英語ヘッダで追加指示が注入されること
        await handleRewriteIssueCommand({
          issue: '42',
          language: 'en',
          customInstruction: 'Focus on security aspects',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('Additional Instructions');
        expect(callArgs.prompt).toContain('Focus on security aspects');
        expect(callArgs.prompt).not.toContain('{CUSTOM_INSTRUCTION}');
      });

      it('dry-runモードでカスタムインストラクション付きプレビューが行われる (TC-CI-004)', async () => {
        // Given: dry-run では更新せずプレビューのみ行われること
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: 'パフォーマンス改善に焦点を当ててください',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('パフォーマンス改善に焦点を当ててください');
        expect(mockUpdateIssue).not.toHaveBeenCalled();
        expect(mockLoggerInfo).toHaveBeenCalledWith('  REWRITE-ISSUE PREVIEW (dry-run)');
      });

      it('applyモードでカスタムインストラクション付きでIssueが更新される (TC-CI-005)', async () => {
        // Given: apply 指定時は更新が実行されること
        await handleRewriteIssueCommand({
          issue: '42',
          apply: true,
          customInstruction: '初心者向けに書き直してください',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('初心者向けに書き直してください');
        expect(mockUpdateIssue).toHaveBeenCalledWith(42, {
          title: 'New Title',
          body: expect.stringContaining('## 概要\n新しい本文'),
        });
        expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully updated issue #42');
      });

      it('前後空白がtrimされたインストラクションがプロンプトに含まれる (TC-CI-006)', async () => {
        // Given: trim 後の文字列がプロンプトに含まれること
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: '  セキュリティ重視  ',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('セキュリティ重視');
        expect(callArgs.prompt).not.toContain('  セキュリティ重視  ');
      });

      it('500文字のカスタムインストラクションが受け入れられる (TC-CI-007)', async () => {
        // Given: 最大長ちょうどの入力が受け入れられること
        const instruction = 'a'.repeat(500);
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: instruction,
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain(instruction);
      });

      it('カスタムインストラクション使用時に適切なログが出力される (TC-CI-008)', async () => {
        // Given: 指定時にカスタムインストラクションのログが出力されること
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: 'テスト指示',
        });

        const logs = mockLoggerInfo.mock.calls.map((call) => call[0]);
        expect(logs.some((log) => typeof log === 'string' && log.includes('customInstruction=provided'))).toBe(true);
        expect(logs.some((log) => log === 'Custom instruction: テスト指示')).toBe(true);
      });
    });

    describe('異常系', () => {
      it('空文字のカスタムインストラクションでエラーがスローされる (TC-CI-009)', async () => {
        // Given: 空文字はバリデーションエラーになること
        await expect(
          handleRewriteIssueCommand({ issue: '42', customInstruction: '' }),
        ).rejects.toThrow('custom-instruction must not be empty.');
        expect(mockClaudeExecute).not.toHaveBeenCalled();
      });

      it('空白のみのカスタムインストラクションでエラーがスローされる (TC-CI-010)', async () => {
        // Given: 空白のみはバリデーションエラーになること
        await expect(
          handleRewriteIssueCommand({ issue: '42', customInstruction: '   ' }),
        ).rejects.toThrow('custom-instruction must not be empty.');
        expect(mockClaudeExecute).not.toHaveBeenCalled();
      });

      it('501文字のカスタムインストラクションでエラーがスローされる (TC-CI-011)', async () => {
        // Given: 最大長超過はバリデーションエラーになること
        await expect(
          handleRewriteIssueCommand({ issue: '42', customInstruction: 'a'.repeat(501) }),
        ).rejects.toThrow('Custom instruction exceeds maximum length (500 characters).');
        expect(mockClaudeExecute).not.toHaveBeenCalled();
      });
    });

    describe('境界値', () => {
      it('499文字のカスタムインストラクションが受け入れられる (TC-CI-012)', async () => {
        // Given: 最大長-1 は許容されること
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: 'a'.repeat(499),
        });

        expect(mockClaudeExecute).toHaveBeenCalled();
      });

      it('1文字のカスタムインストラクションが受け入れられる (TC-CI-014)', async () => {
        // Given: 最小長1文字は許容されること
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: 'x',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('x');
      });

      it('trim後に500文字のカスタムインストラクションが受け入れられる (TC-CI-015)', async () => {
        // Given: trim後に最大長内であれば許容されること
        const instruction = `  ${'a'.repeat(500)}  `;
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: instruction,
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).toContain('a'.repeat(500));
      });
    });

    describe('プロンプト品質', () => {
      it('カスタムインストラクション指定時に{CUSTOM_INSTRUCTION}がプロンプトに残存しない (TC-CI-016)', async () => {
        // Given: 指定時にプレースホルダーが残らないこと
        await handleRewriteIssueCommand({
          issue: '42',
          customInstruction: 'テスト指示',
        });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).not.toContain('{CUSTOM_INSTRUCTION}');
      });

      it('カスタムインストラクション未指定時に{CUSTOM_INSTRUCTION}がプロンプトに残存しない (TC-CI-017)', async () => {
        // Given: 未指定時にプレースホルダーが残らないこと
        await handleRewriteIssueCommand({ issue: '42' });

        const callArgs = mockClaudeExecute.mock.calls[0][0];
        expect(callArgs.prompt).not.toContain('{CUSTOM_INSTRUCTION}');
      });
    });
  });
});
