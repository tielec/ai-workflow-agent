import { jest } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import type * as FsExtra from 'fs-extra';

// jest-mock-extended を使用した fs-extra のモック（Jest v30.x 互換）
// 重要: このモックは BasePhase インポート**より前**に定義する必要がある
const mockFs: DeepMockProxy<typeof FsExtra> = mockDeep<typeof FsExtra>();
jest.unstable_mockModule('fs-extra', () => mockFs);

// モジュールを動的インポート（モック後）
const { BasePhase } = await import('../../../src/phases/base-phase.js');
const { MetadataManager } = await import('../../../src/core/metadata-manager.js');
const { GitHubClient } = await import('../../../src/core/github-client.js');
const { PhaseExecutionResult } = await import('../../../src/types.js');
const path = await import('node:path');

// BasePhaseConstructorParams型定義（動的インポートのため再定義）
type BasePhaseConstructorParams = {
  phaseName: string;
  workingDir: string;
  metadataManager: any;
  githubClient: any;
  skipDependencyCheck?: boolean;
};

/**
 * テスト用の BasePhase サブクラス
 * executePhaseTemplate() を public にアクセス可能にする
 */
class TestPhase extends BasePhase {
  constructor(params: BasePhaseConstructorParams) {
    super(params);
  }

  // executePhaseTemplate() を public にするラッパー
  public async testExecutePhaseTemplate<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string }
  ): Promise<PhaseExecutionResult> {
    return this.executePhaseTemplate(phaseOutputFile, templateVariables, options);
  }

  // 抽象メソッドの実装（ダミー）
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
  const testWorkingDir = '/test/workspace';
  const testWorkflowDir = '/test/.ai-workflow/issue-47';

  beforeEach(() => {
    jest.clearAllMocks();

    // MetadataManager のモック
    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '47' },
      updatePhaseStatus: jest.fn(),
      getPhaseStatus: jest.fn(),
      addCompletedStep: jest.fn(),
      getCompletedSteps: jest.fn().mockReturnValue([]),
      updateCurrentStep: jest.fn(),
      save: jest.fn(),
    };

    // GitHubClient のモック
    mockGithub = {
      getIssueInfo: jest.fn(),
      postComment: jest.fn(),
      createOrUpdateProgressComment: jest.fn(),
    };

    // fs-extra のモック設定（Jest v30.x 互換 - jest-mock-extended を使用）
    mockFs.existsSync.mockReturnValue(false);
    mockFs.ensureDirSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockReturnValue('');
    mockFs.lstatSync.mockReturnValue({ isSymbolicLink: () => false } as any);

    // TestPhase インスタンス作成
    testPhase = new TestPhase({
      phaseName: 'requirements',
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // loadPrompt() のモック
    jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('Prompt template: {var1} and {var2}');

    // executeWithAgent() のモック
    jest.spyOn(testPhase as any, 'executeWithAgent').mockResolvedValue([]);
  });

  // ========================================
  // UT-001: 正常系 - 基本的な変数置換
  // ========================================
  describe('UT-001: 正常系 - 基本的な変数置換', () => {
    it('プロンプト内の変数が正しく置換され、エージェント実行が成功する', async () => {
      // Given: テンプレート変数
      const templateVariables = {
        var1: 'value1',
        var2: 'value2',
      };
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: 変数が置換されたプロンプトでエージェントが実行される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Prompt template: value1 and value2',
        { maxTurns: 30, verbose: undefined, logDir: undefined }
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
    it('オプション引数が指定されない場合、maxTurns のデフォルト値（30）が使用される', async () => {
      // Given: オプション引数なし
      const templateVariables = {};
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // プロンプトテンプレートに変数がない
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('No variables');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: デフォルトの maxTurns: 30 が使用される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'No variables',
        { maxTurns: 30, verbose: undefined, logDir: undefined }
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
    it('オプション引数が指定された場合、その値が使用される', async () => {
      // Given: カスタムオプション引数
      const templateVariables = {};
      const outputFile = 'test.md';
      const options = { maxTurns: 50, verbose: true, logDir: '/custom/log' };
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // プロンプトテンプレートに変数がない
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('No variables');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables, options);

      // Then: カスタム値が使用される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'No variables',
        { maxTurns: 50, verbose: true, logDir: '/custom/log' }
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
    it('複数のテンプレート変数（3つ以上）が正しく置換される', async () => {
      // Given: 複数のテンプレート変数
      const templateVariables = {
        planning_document_path: '@.ai-workflow/issue-47/00_planning/output/planning.md',
        issue_info: 'Issue #47: Refactor phase template',
        issue_number: '47',
      };
      const outputFile = 'requirements.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // 複数変数を含むプロンプトテンプレート
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue(
        'Planning: {planning_document_path}, Issue: {issue_info}, Number: {issue_number}'
      );

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: 全変数が置換される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Planning: @.ai-workflow/issue-47/00_planning/output/planning.md, Issue: Issue #47: Refactor phase template, Number: 47',
        { maxTurns: 30, verbose: undefined, logDir: undefined }
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
    it('エージェント実行後に出力ファイルが存在しない場合、エラーが返される', async () => {
      // Given: 出力ファイルが存在しない
      const templateVariables = {};
      const outputFile = 'missing.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在しないようにモック
      mockFs.existsSync.mockReturnValue(false);

      // プロンプトテンプレートに変数がない
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('No variables');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: エラーが返される
      expect(result.success).toBe(false);
      expect(result.error).toBe(`${outputFile} が見つかりません: ${outputFilePath}`);
    });
  });

  // ========================================
  // UT-006: 異常系 - executeWithAgent がエラーをスロー
  // ========================================
  describe('UT-006: 異常系 - executeWithAgent がエラーをスロー', () => {
    it('executeWithAgent() がエラーをスローした場合、例外が伝播される', async () => {
      // Given: executeWithAgent() がエラーをスローするようにモック
      const templateVariables = {};
      const outputFile = 'test.md';
      const error = new Error('Agent execution failed');

      jest.spyOn(testPhase as any, 'executeWithAgent').mockRejectedValue(error);

      // プロンプトテンプレートに変数がない
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('No variables');

      // When & Then: executePhaseTemplate() が例外をスローする
      await expect(
        testPhase.testExecutePhaseTemplate(outputFile, templateVariables)
      ).rejects.toThrow('Agent execution failed');
    });
  });

  // ========================================
  // UT-007: 境界値 - 空文字列の変数置換
  // ========================================
  describe('UT-007: 境界値 - 空文字列の変数置換', () => {
    it('変数値が空文字列の場合でも正しく置換される', async () => {
      // Given: 空文字列の変数
      const templateVariables = { var1: '' };
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // プロンプトテンプレート
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('Value: {var1}');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: 空文字列に置換される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'Value: ',
        { maxTurns: 30, verbose: undefined, logDir: undefined }
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
    it('templateVariables が空オブジェクトの場合でも正常に動作する', async () => {
      // Given: 空オブジェクト
      const templateVariables = {};
      const outputFile = 'test.md';
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // プロンプトテンプレート（変数なし）
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('No variables');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables);

      // Then: プロンプトは変更されない
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'No variables',
        { maxTurns: 30, verbose: undefined, logDir: undefined }
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
    it('maxTurns が 0 の場合でもエラーなく動作する', async () => {
      // Given: maxTurns が 0
      const templateVariables = {};
      const outputFile = 'test.md';
      const options = { maxTurns: 0 };
      const outputFilePath = path.join(testWorkflowDir, '01_requirements', 'output', outputFile);

      // 出力ファイルが存在するようにモック
      mockFs.existsSync.mockReturnValue(true);

      // プロンプトテンプレート
      jest.spyOn(testPhase as any, 'loadPrompt').mockReturnValue('No variables');

      // When: executePhaseTemplate() を呼び出す
      const result = await testPhase.testExecutePhaseTemplate(outputFile, templateVariables, options);

      // Then: maxTurns: 0 が使用される
      expect((testPhase as any).executeWithAgent).toHaveBeenCalledWith(
        'No variables',
        { maxTurns: 0, verbose: undefined, logDir: undefined }
      );

      // Then: 成功が返される
      expect(result.success).toBe(true);
      expect(result.output).toBe(outputFilePath);
    });
  });
});
