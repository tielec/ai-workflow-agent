import { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';
import * as fs from 'fs-extra';
import * as path from 'path';
import { jest } from '@jest/globals';

// fs-extraのモック
jest.mock('fs-extra');

/**
 * Issue #140: ReDoS脆弱性修正のインテグレーションテスト
 *
 * このテストスイートは、ClaudeAgentClientのテンプレート処理フロー全体を検証します。
 * - プロンプトファイル読み込み
 * - テンプレート変数の置換
 * - Claude Agent SDKへのプロンプト送信
 */
describe('ClaudeAgentClient - Template Processing Integration Tests', () => {
  let client: ClaudeAgentClient;
  const testWorkspaceDir = '/test/integration/workspace';

  beforeEach(() => {
    client = new ClaudeAgentClient({ workingDir: testWorkspaceDir });
    jest.clearAllMocks();

    // 認証情報のモック
    (fs.existsSync as any) = jest.fn().mockReturnValue(true);
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-integration-token';
  });

  afterEach(() => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  // IS-001: 実際のプロンプトファイル読み込みと変数置換
  describe('IS-001: Prompt File Loading and Variable Substitution', () => {
    it('実際のプロンプトファイルを読み込み、テンプレート変数が正常に置換される', async () => {
      // Given: テスト用プロンプトファイル
      const promptFilePath = path.join(testWorkspaceDir, 'test-prompt.md');
      const templateContent = 'Hello {name}, your role is {role}.';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      // executeTask をモック化
      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue(['result']);

      // When: executeTaskFromFile を呼び出す
      const variables = { name: 'Alice', role: 'Developer' };
      await client.executeTaskFromFile(promptFilePath, variables);

      // Then: プロンプトファイルが読み込まれ、テンプレート変数が置換される
      expect(fs.readFileSync).toHaveBeenCalledWith(promptFilePath, 'utf-8');
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Hello Alice, your role is Developer.',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });

      executeTaskSpy.mockRestore();
    });
  });

  // IS-002: 複数のテンプレート変数を含むプロンプト処理
  describe('IS-002: Multiple Template Variables Processing', () => {
    it('複数のテンプレート変数を含むプロンプトが正常に処理される', async () => {
      // Given: 複数のテンプレート変数を含むプロンプトファイル
      const promptFilePath = path.join(testWorkspaceDir, 'test-multi-vars.md');
      const templateContent = 'Project: {project_name}\nVersion: {version}\nAuthor: {author}\nDescription: {description}';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue(['result']);

      // When: 複数のテンプレート変数を渡す
      const variables = {
        project_name: 'AI Workflow',
        version: '1.0.0',
        author: 'Claude',
        description: 'Automated workflow system',
      };
      await client.executeTaskFromFile(promptFilePath, variables);

      // Then: すべてのテンプレート変数が置換される
      const expectedPrompt = 'Project: AI Workflow\nVersion: 1.0.0\nAuthor: Claude\nDescription: Automated workflow system';
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: expectedPrompt,
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });

      executeTaskSpy.mockRestore();
    });
  });

  // IS-003: 通常のテンプレート変数での正常実行
  describe('IS-003: Normal Template Variables Execution', () => {
    it('通常のテンプレート変数を含むプロンプトでClaude Agent SDKが正常に実行される', async () => {
      // Given: 通常のテンプレート変数を含むプロンプトファイル
      const promptFilePath = path.join(testWorkspaceDir, 'test-normal.md');
      const templateContent = 'Please summarize the following topic: {topic}';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue([
        JSON.stringify({ type: 'text', content: 'Summary result' }),
      ]);

      // When: executeTaskFromFile を呼び出す
      const variables = { topic: 'Artificial Intelligence' };
      const result = await client.executeTaskFromFile(promptFilePath, variables);

      // Then: テンプレート変数が置換され、executeTask が正常に呼び出される
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Please summarize the following topic: Artificial Intelligence',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });
      expect(result).toEqual([JSON.stringify({ type: 'text', content: 'Summary result' })]);

      executeTaskSpy.mockRestore();
    });
  });

  // IS-004: 特殊文字を含むテンプレート変数での正常実行
  describe('IS-004: Special Characters in Template Variables', () => {
    it('特殊文字を含むテンプレート変数を使用してもClaude Agent SDKが正常に実行される', async () => {
      // Given: 特殊文字を含むテンプレート変数
      const promptFilePath = path.join(testWorkspaceDir, 'test-special-chars.md');
      const templateContent = 'Please explain the pattern: {regex_pattern}';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue([
        JSON.stringify({ type: 'text', content: 'Explanation result' }),
      ]);

      // When: 特殊文字を含むテンプレート変数を使用
      const startTime = Date.now();
      const variables = { regex_pattern: '(a+)+b' }; // ReDoSパターン
      const result = await client.executeTaskFromFile(promptFilePath, variables);
      const endTime = Date.now();

      // Then: 特殊文字が文字列リテラルとして扱われ、ReDoS攻撃が発生しない
      expect(endTime - startTime).toBeLessThan(1000); // 1秒以内に完了
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Please explain the pattern: (a+)+b',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });
      expect(result).toEqual([JSON.stringify({ type: 'text', content: 'Explanation result' })]);

      executeTaskSpy.mockRestore();
    });
  });

  // IS-005: ReDoSパターンを含むテンプレート変数での正常実行
  describe('IS-005: ReDoS Pattern in Template Variables', () => {
    it('ReDoSパターンを含むテンプレート変数を使用してもセキュリティ脆弱性が発生しない', async () => {
      // Given: ReDoSパターンを含むテンプレート変数
      const promptFilePath = path.join(testWorkspaceDir, 'test-redos.md');
      const templateContent = 'Pattern: {dangerous_pattern}, Description: {description}';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue([
        JSON.stringify({ type: 'text', content: 'Analysis result' }),
      ]);

      // When: ReDoSパターンを含むテンプレート変数を使用
      const startTime = Date.now();
      const variables = {
        dangerous_pattern: '(a*)*b', // ネストされた繰り返し
        description: 'Nested repetition',
      };
      const result = await client.executeTaskFromFile(promptFilePath, variables);
      const endTime = Date.now();

      // Then: バックトラッキングが発生せず、1秒以内に処理が完了する
      expect(endTime - startTime).toBeLessThan(1000);
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Pattern: (a*)*b, Description: Nested repetition',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });
      expect(result).toEqual([JSON.stringify({ type: 'text', content: 'Analysis result' })]);

      executeTaskSpy.mockRestore();
    });

    it('複数のReDoSパターンを含むテンプレート変数でもセキュリティ脆弱性が発生しない', async () => {
      // Given: 複数のReDoSパターンを含むテンプレート変数
      const promptFilePath = path.join(testWorkspaceDir, 'test-multiple-redos.md');
      const templateContent = 'Pattern1: {pattern1}, Pattern2: {pattern2}, Pattern3: {pattern3}';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue([
        JSON.stringify({ type: 'text', content: 'Multi-pattern result' }),
      ]);

      // When: 複数のReDoSパターンを使用
      const startTime = Date.now();
      const variables = {
        pattern1: '(a+)+b',
        pattern2: '(a|a)*b',
        pattern3: '(a|ab)*c',
      };
      const result = await client.executeTaskFromFile(promptFilePath, variables);
      const endTime = Date.now();

      // Then: すべてのReDoSパターンが安全に処理される
      expect(endTime - startTime).toBeLessThan(1000);
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Pattern1: (a+)+b, Pattern2: (a|a)*b, Pattern3: (a|ab)*c',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });
      expect(result).toEqual([JSON.stringify({ type: 'text', content: 'Multi-pattern result' })]);

      executeTaskSpy.mockRestore();
    });
  });

  // IS-006: 大量のテンプレート変数と長大なテンプレートでのパフォーマンス検証
  describe('IS-006: Performance Test with Large Templates and Many Variables', () => {
    it('大量のテンプレート変数（100個）と長大なテンプレート文字列（10,000文字）が1秒以内に処理される', async () => {
      // Given: 大量のテンプレート変数と長大なテンプレート文字列
      const promptFilePath = path.join(testWorkspaceDir, 'test-performance.md');

      // 100個のテンプレート変数を生成
      const variables: Record<string, string> = {};
      const placeholders: string[] = [];
      for (let i = 0; i < 100; i++) {
        variables[`var${i}`] = `value${i}`;
        placeholders.push(`{var${i}}`);
      }

      // 10,000文字のテンプレート文字列を生成
      const templateContent = 'a'.repeat(5000) + placeholders.join(' ') + 'b'.repeat(5000);
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue([
        JSON.stringify({ type: 'text', content: 'Performance test result' }),
      ]);

      // When: 大量のテンプレート変数で置換
      const startTime = Date.now();
      const result = await client.executeTaskFromFile(promptFilePath, variables);
      const endTime = Date.now();

      // Then: 1秒以内に処理が完了する
      expect(endTime - startTime).toBeLessThan(1000);

      // すべての変数が置換されていることを確認
      const expectedValues = Object.values(variables).join(' ');
      const expectedPrompt = 'a'.repeat(5000) + expectedValues + 'b'.repeat(5000);
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: expectedPrompt,
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });
      expect(result).toEqual([JSON.stringify({ type: 'text', content: 'Performance test result' })]);

      executeTaskSpy.mockRestore();
    });

    it('特殊文字を含む大量のテンプレート変数でもパフォーマンスが維持される', async () => {
      // Given: 特殊文字を含む大量のテンプレート変数
      const promptFilePath = path.join(testWorkspaceDir, 'test-performance-special.md');

      const variables: Record<string, string> = {};
      const placeholders: string[] = [];
      const specialChars = ['*', '+', '.', '?', '^', '$', '|', '(', ')', '[', ']'];

      for (let i = 0; i < 50; i++) {
        const specialChar = specialChars[i % specialChars.length];
        const key = `var${specialChar}${i}`;
        variables[key] = `value${i}`;
        placeholders.push(`{${key}}`);
      }

      const templateContent = placeholders.join(' ');
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue([
        JSON.stringify({ type: 'text', content: 'Special chars performance result' }),
      ]);

      // When: 特殊文字を含む大量の変数で置換
      const startTime = Date.now();
      const result = await client.executeTaskFromFile(promptFilePath, variables);
      const endTime = Date.now();

      // Then: 1秒以内に処理が完了する
      expect(endTime - startTime).toBeLessThan(1000);

      // すべての変数が置換されていることを確認
      const expectedValues = Object.values(variables).join(' ');
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: expectedValues,
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });
      expect(result).toEqual([JSON.stringify({ type: 'text', content: 'Special chars performance result' })]);

      executeTaskSpy.mockRestore();
    });
  });

  // 追加: systemPrompt, maxTurns, verbose オプションのテスト
  describe('Additional Integration Tests: Optional Parameters', () => {
    it('systemPrompt、maxTurns、verboseオプションが正常に渡される', async () => {
      // Given: テンプレート変数とオプションパラメータ
      const promptFilePath = path.join(testWorkspaceDir, 'test-options.md');
      const templateContent = 'Task: {task}';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue(['result']);

      // When: すべてのオプションパラメータを指定
      const variables = { task: 'Analyze code' };
      const systemPrompt = 'You are a code analyzer.';
      const maxTurns = 10;
      const verbose = false;

      await client.executeTaskFromFile(promptFilePath, variables, systemPrompt, maxTurns, verbose);

      // Then: すべてのパラメータが正しく渡される
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Task: Analyze code',
        systemPrompt: 'You are a code analyzer.',
        maxTurns: 10,
        verbose: false,
      });

      executeTaskSpy.mockRestore();
    });

    it('テンプレート変数が未指定でも正常に動作する', async () => {
      // Given: テンプレート変数なしのプロンプトファイル
      const promptFilePath = path.join(testWorkspaceDir, 'test-no-vars.md');
      const templateContent = 'Please analyze the code.';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue(['result']);

      // When: テンプレート変数を省略
      await client.executeTaskFromFile(promptFilePath);

      // Then: テンプレート文字列がそのまま使用される
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Please analyze the code.',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });

      executeTaskSpy.mockRestore();
    });
  });

  // エッジケース: 空のテンプレート変数
  describe('Edge Cases: Empty Template Variables', () => {
    it('空のテンプレート変数オブジェクトでも正常に動作する', async () => {
      // Given: 空のテンプレート変数オブジェクト
      const promptFilePath = path.join(testWorkspaceDir, 'test-empty-vars.md');
      const templateContent = 'Hello, world!';
      (fs.readFileSync as any).mockReturnValue(templateContent);

      const executeTaskSpy = jest.spyOn(client as any, 'executeTask').mockResolvedValue(['result']);

      // When: 空のテンプレート変数オブジェクトを渡す
      await client.executeTaskFromFile(promptFilePath, {});

      // Then: テンプレート文字列がそのまま使用される
      expect(executeTaskSpy).toHaveBeenCalledWith({
        prompt: 'Hello, world!',
        systemPrompt: undefined,
        maxTurns: undefined,
        verbose: undefined,
      });

      executeTaskSpy.mockRestore();
    });
  });
});
