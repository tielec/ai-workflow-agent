/**
 * BasePhase.executePhaseTemplate() - プロンプトテンプレート実行のテスト (Issue #47)
 *
 * 目的: executePhaseTemplate() メソッドの動作を検証
 *
 * 重要: ESM環境でのテストのため、実ファイルシステムを使用する戦略を採用
 * - jest.unstable_mockModule()は使用しない（ESM immutable binding問題を回避）
 * - os.tmpdir()に実ディレクトリ構造を作成
 * - 実ファイルを作成・削除
 *
 * テスト戦略: UNIT_INTEGRATION - ユニット部分
 */

import { describe, test, expect, jest, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import fs from 'fs-extra';
import os from 'node:os';
import { BasePhase } from '../../../src/phases/base-phase.js';
import type { PhaseExecutionResult } from '../../../src/types.js';

type BasePhaseConstructorParams = {
  phaseName: string;
  workingDir: string;
  metadataManager: any;
  githubClient: any;
  skipDependencyCheck?: boolean;
};

class TestPhase extends BasePhase {
  constructor(params: BasePhaseConstructorParams) {
    super(params);
  }

  public async testExecutePhaseTemplate<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
  ): Promise<PhaseExecutionResult> {
    return this.executePhaseTemplate(phaseOutputFile, templateVariables, options);
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true };
  }
}

describe('BasePhase.executePhaseTemplate() - Issue #47', () => {
  let testPhase: TestPhase;
  let mockMetadata: any;
  let mockGithub: any;
  let testRootDir: string;
  let testWorkingDir: string;
  let testWorkflowDir: string;
  let testPromptsDir: string;

  beforeAll(() => {
    // Create real test directory structure (avoid ESM mocking issues)
    testRootDir = path.join(os.tmpdir(), 'ai-workflow-test-base-phase-template-' + Date.now());
    testWorkingDir = path.join(testRootDir, 'workspace');
    testWorkflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-47');
    testPromptsDir = path.join(testRootDir, 'prompts');

    // Create prompts directory structure
    const promptsRequirementsDir = path.join(testPromptsDir, 'requirements');
    fs.ensureDirSync(promptsRequirementsDir);
    fs.writeFileSync(
      path.join(promptsRequirementsDir, 'execute.txt'),
      'Execute phase template: {var1} and {var2}',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(promptsRequirementsDir, 'review.txt'),
      'Review phase template',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(promptsRequirementsDir, 'revise.txt'),
      'Revise phase template',
      'utf-8'
    );

    // Create workflow directory structure
    const requirementsOutputDir = path.join(testWorkflowDir, '01_requirements', 'output');
    fs.ensureDirSync(requirementsOutputDir);
  });

  afterAll(() => {
    // Cleanup test directory
    if (testRootDir && fs.existsSync(testRootDir)) {
      fs.removeSync(testRootDir);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // MetadataManager のモック
    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '47' },
      updatePhaseStatus: jest.fn<any>(),
      getPhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      save: jest.fn<any>(),
      getLanguage: jest.fn<any>().mockReturnValue('ja'),
    };

    // GitHubClient のモック
    mockGithub = {
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
    };

    // TestPhase インスタンス作成（実パスを使用）
    testPhase = new TestPhase({
      phaseName: 'requirements',
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // Override promptsRoot to use real test prompt directory
    (testPhase as any).promptsRoot = testPromptsDir;

    // loadPrompt() のモック（実プロンプトファイルを読み込む）
    jest.spyOn(testPhase as any, 'loadPrompt').mockImplementation((promptType: string) => {
      const promptPath = path.join(testPromptsDir, 'requirements', `${promptType}.txt`);
      if (fs.existsSync(promptPath)) {
        return fs.readFileSync(promptPath, 'utf-8');
      }
      return `Mock ${promptType} prompt`;
    });

    // executeWithAgent() のモック（最小限のモック戦略）
    jest.spyOn(testPhase as any, 'executeWithAgent').mockResolvedValue([]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ========================================
  // UT-001: 正常系 - 基本的な変数置換
  // ========================================
  describe('UT-001: 正常系 - 基本的な変数置換', () => {
    test('プロンプト内の変数が正しく置換され、エージェント実行が成功する', async () => {
      // Given: テンプレート変数
      const templateVariables = {
        var1: 'value1',
        var2: 'value2',
      };
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, '# Test Output', 'utf-8');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: 変数が置換されたプロンプトでエージェントが実行される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Execute phase template: value1 and value2',
        { maxTurns: 30, verbose: undefined, logDir: path.join(testWorkflowDir, '01_requirements', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });

  // ========================================
  // UT-002: 正常系 - オプション引数なし（デフォルト値）
  // ========================================
  describe('UT-002: 正常系 - オプション引数なし（デフォルト値）', () => {
    test('オプション引数が指定されない場合、maxTurns のデフォルト値（30）が使用される', async () => {
      // Given: オプション引数なし
      const templateVariables = {};
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, '# Test Output', 'utf-8');

      // When: executePhaseTemplate() をオプションなしで呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: maxTurns が 30 でエージェントが実行される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Execute phase template: {var1} and {var2}',
        { maxTurns: 30, verbose: undefined, logDir: path.join(testWorkflowDir, '01_requirements', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });

  // ========================================
  // UT-003: 正常系 - オプション引数あり（カスタム値）
  // ========================================
  describe('UT-003: 正常系 - オプション引数あり（カスタム値）', () => {
    test('オプション引数が指定された場合、その値が使用される', async () => {
      // Given: カスタムオプション
      const templateVariables = {};
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, '# Test Output', 'utf-8');

      // When: executePhaseTemplate() をカスタムオプション付きで呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables, {
        maxTurns: 50,
        verbose: true,
      });

      // Then: カスタム値でエージェントが実行される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Execute phase template: {var1} and {var2}',
        { maxTurns: 50, verbose: true, logDir: path.join(testWorkflowDir, '01_requirements', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });

  // ========================================
  // UT-004: 正常系 - 複数変数の置換
  // ========================================
  describe('UT-004: 正常系 - 複数変数の置換', () => {
    test('複数のテンプレート変数（3つ以上）が正しく置換される', async () => {
      // Given: 3つの変数を持つカスタムプロンプト
      const customPromptsDir = path.join(testPromptsDir, 'custom-phase');
      fs.ensureDirSync(customPromptsDir);
      fs.writeFileSync(
        path.join(customPromptsDir, 'execute.txt'),
        'Multi-variable template: {alpha}, {beta}, {gamma}',
        'utf-8'
      );

      // カスタムPhaseインスタンス作成
      const customPhase = new TestPhase({
        phaseName: 'custom-phase',
        workingDir: testWorkingDir,
        metadataManager: {
          ...mockMetadata,
          workflowDir: path.join(testWorkingDir, '.ai-workflow', 'issue-47'),
        },
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });
      (customPhase as any).promptsRoot = testPromptsDir;
      // loadPrompt() のモック（custom-phase用）
      jest.spyOn(customPhase as any, 'loadPrompt').mockImplementation((promptType: string) => {
        const promptPath = path.join(testPromptsDir, 'custom-phase', `${promptType}.txt`);
        if (fs.existsSync(promptPath)) {
          return fs.readFileSync(promptPath, 'utf-8');
        }
        return `Mock ${promptType} prompt`;
      });
      jest.spyOn(customPhase as any, 'executeWithAgent').mockResolvedValue([]);

      const templateVariables = {
        alpha: 'A',
        beta: 'B',
        gamma: 'C',
      };
      const outputFile = 'multi-var.md';
      const customPhaseOutputDir = path.join(testWorkflowDir, 'undefined_custom-phase', 'output');
      const outputFilePath = path.join(customPhaseOutputDir, outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(customPhaseOutputDir);
      fs.writeFileSync(outputFilePath, '# Multi-var Output', 'utf-8');

      // When: executePhaseTemplate() を呼び出す
      const result = await customPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: すべての変数が置換されたプロンプトでエージェントが実行される
      expect((customPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Multi-variable template: A, B, C',
        { maxTurns: 30, verbose: undefined, logDir: path.join(testWorkflowDir, 'undefined_custom-phase', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });

  // ========================================
  // UT-005: 異常系 - 出力ファイル不在
  // ========================================
  describe('UT-005: 異常系 - 出力ファイル不在', () => {
    test('エージェント実行後に出力ファイルが存在しない場合、エラーが返される', async () => {
      // Given: 出力ファイルが存在しない
      const templateVariables = {};
      const outputFile = 'non-existent.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを作成しない（存在しない状態）

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: 失敗が返される
      expect(result.success).toBe(false);
      expect(result.error).toContain(outputFile);
      expect(result.error).toContain('が見つかりません');
    });
  });

  // ========================================
  // UT-006: 異常系 - executeWithAgent がエラーをスロー
  // ========================================
  describe('UT-006: 異常系 - executeWithAgent がエラーをスロー', () => {
    test('executeWithAgent() がエラーをスローした場合、例外が伝播される', async () => {
      // Given: executeWithAgent がエラーをスロー
      jest.spyOn(testPhase as any, 'executeWithAgent').mockRejectedValue(new Error('Agent execution failed'));

      const templateVariables = {};
      const outputFile = 'test.md';

      // When/Then: executePhaseTemplate() がエラーをスローする
      await expect(testPhase.testExecutePhaseTemplate(outputFile, templateVariables)).rejects.toThrow(
        'Agent execution failed'
      );
    });
  });

  // ========================================
  // UT-007: 境界値 - 空文字列の変数置換
  // ========================================
  describe('UT-007: 境界値 - 空文字列の変数置換', () => {
    test('変数値が空文字列の場合でも正しく置換される', async () => {
      // Given: 空文字列の変数
      const templateVariables = {
        var1: '',
        var2: 'value2',
      };
      const outputFile = 'empty-var.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, '# Empty Var Output', 'utf-8');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: 空文字列が置換される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Execute phase template:  and value2',
        { maxTurns: 30, verbose: undefined, logDir: path.join(testWorkflowDir, '01_requirements', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });

  // ========================================
  // UT-008: 境界値 - 変数なし（空オブジェクト）
  // ========================================
  describe('UT-008: 境界値 - 変数なし（空オブジェクト）', () => {
    test('templateVariables が空オブジェクトの場合でも正常に動作する', async () => {
      // Given: 空のテンプレート変数
      const templateVariables = {};
      const outputFile = 'no-vars.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, '# No Vars Output', 'utf-8');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: プロンプトがそのまま使用される（変数置換なし）
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Execute phase template: {var1} and {var2}',
        { maxTurns: 30, verbose: undefined, logDir: path.join(testWorkflowDir, '01_requirements', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });

  // ========================================
  // UT-009: 境界値 - maxTurns が 0
  // ========================================
  describe('UT-009: 境界値 - maxTurns が 0', () => {
    test('maxTurns が 0 の場合でもエラーなく動作する', async () => {
      // Given: maxTurns が 0
      const templateVariables = {};
      const outputFile = 'zero-turns.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルを実際に作成
      fs.ensureDirSync(path.dirname(outputFilePath));
      fs.writeFileSync(outputFilePath, '# Zero Turns Output', 'utf-8');

      // When: executePhaseTemplate() を maxTurns=0 で呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables, { maxTurns: 0 });

      // Then: maxTurns=0 でエージェントが実行される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Execute phase template: {var1} and {var2}',
        { maxTurns: 0, verbose: undefined, logDir: path.join(testWorkflowDir, '01_requirements', 'execute') }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });
});
