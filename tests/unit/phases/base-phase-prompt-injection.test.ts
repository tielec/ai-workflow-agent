/**
 * ユニットテスト: BasePhase.loadPrompt() - 環境情報注入 (Issue #177)
 *
 * テスト対象:
 * - BasePhase.loadPrompt() メソッドの環境情報注入ロジック
 * - config.canAgentInstallPackages() による条件分岐
 * - buildEnvironmentInfoSection() メソッドの Markdown 生成
 *
 * 重要: ESM環境でのテストのため、実ファイルシステムを使用する戦略を採用
 * - jest.unstable_mockModule()は使用しない（ESM immutable binding問題を回避）
 * - os.tmpdir()に実プロンプトファイルを作成
 * - fs.readFileSyncをモックして、実テストファイルを読み込む
 *
 * テスト戦略: UNIT_ONLY
 * - execute ステップでのみ環境情報が注入されることを検証
 * - AGENT_CAN_INSTALL_PACKAGES 環境変数による動作分岐を検証
 * - 環境情報セクションの Markdown 形式を検証
 */

import { jest, describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { BasePhase } from '../../../src/phases/base-phase.js';
import type { PhaseExecutionResult } from '../../../src/types.js';

/**
 * テスト用の BasePhase サブクラス
 * loadPrompt() を public にアクセス可能にする
 */
class TestPhase extends BasePhase {
  constructor(params: any) {
    super(params);
  }

  // loadPrompt() を public にするラッパー
  public testLoadPrompt(promptType: 'execute' | 'review' | 'revise'): string {
    return (this as any).loadPrompt(promptType);
  }

  // buildEnvironmentInfoSection() を public にするラッパー（TC-015用）
  public testBuildEnvironmentInfoSection(): string {
    return (this as any).buildEnvironmentInfoSection();
  }

  // 抽象メソッドの実装（ダミー）
  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true };
  }
}

describe('BasePhase - 環境情報注入ロジック（Issue #177）', () => {
  let testPhase: TestPhase;
  let mockMetadata: any;
  let mockGithub: any;
  let originalEnv: NodeJS.ProcessEnv;
  let testRootDir: string;
  let testWorkingDir: string;
  let testWorkflowDir: string;
  let testPromptsDir: string;

  beforeAll(() => {
    // Create real test directory structure (avoid ESM mocking issues)
    testRootDir = path.join(os.tmpdir(), 'ai-workflow-test-base-phase-prompt-injection-' + Date.now());
    testWorkingDir = path.join(testRootDir, 'workspace');
    testWorkflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-177');
    testPromptsDir = path.join(testRootDir, 'prompts');

    // Create prompts directory structure for planning phase
    const promptsPlanningDir = path.join(testPromptsDir, 'planning');
    fs.ensureDirSync(promptsPlanningDir);
    fs.writeFileSync(
      path.join(promptsPlanningDir, 'execute.txt'),
      'Execute planning phase...\n\n{issue_info}',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(promptsPlanningDir, 'review.txt'),
      'Review planning phase...',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(promptsPlanningDir, 'revise.txt'),
      'Revise planning phase...',
      'utf-8'
    );
  });

  afterAll(() => {
    // Cleanup test directory
    if (testRootDir && fs.existsSync(testRootDir)) {
      fs.removeSync(testRootDir);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // 環境変数のバックアップ
    originalEnv = { ...process.env };

    // MetadataManager のモック
    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '177' },
      updatePhaseStatus: jest.fn<any>(),
      getPhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      save: jest.fn<any>(),
      getRollbackContext: jest.fn<any>().mockReturnValue(null), // Issue #90
    };

    // GitHubClient のモック
    mockGithub = {
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
    };

    // fs.readFileSync のモック（promptsRootパスをtestPromptsDirに変換）
    // BasePhaseは import * as fs from 'node:fs' を使用しているため、
    // fs-extraのモックは効かない。node:fs をモックする必要がある。
    // しかし、これはESM immutable bindingの問題があるため、
    // 代わりに実プロンプトファイルのパスを変換してテストファイルを読み込む
    const originalReadFileSyncFsExtra = fs.readFileSync;
    jest.spyOn(fs, 'readFileSync').mockImplementation(((filePath: any, encoding?: any) => {
      const pathStr = filePath.toString();

      // promptsRootが含まれるパスをtestPromptsDirに変換
      // 例: C:\...\dist\prompts\planning\execute.txt → C:\...\tmp\...\prompts\planning\execute.txt
      if (pathStr.includes('prompts') && pathStr.includes('planning')) {
        const relativePath = pathStr.substring(pathStr.indexOf('planning'));
        const testFilePath = path.join(testPromptsDir, relativePath);
        return originalReadFileSyncFsExtra(testFilePath, encoding || 'utf-8');
      }

      // テストプロンプトディレクトリのファイルは実ファイルを読む
      if (pathStr.includes(testPromptsDir)) {
        return originalReadFileSyncFsExtra(filePath, encoding || 'utf-8');
      }

      // それ以外は元の動作
      return originalReadFileSyncFsExtra(filePath, encoding);
    }) as any);

    // fs.existsSync のモック（promptsRootパスをtestPromptsDirに変換）
    const originalExistsSync = fs.existsSync;
    jest.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
      const pathStr = filePath.toString();

      // promptsRootが含まれるパスをtestPromptsDirに変換
      if (pathStr.includes('prompts') && pathStr.includes('planning')) {
        const relativePath = pathStr.substring(pathStr.indexOf('planning'));
        const testFilePath = path.join(testPromptsDir, relativePath);
        return originalExistsSync(testFilePath);
      }

      return originalExistsSync(filePath);
    });

    // TestPhase インスタンス作成
    testPhase = new TestPhase({
      phaseName: 'planning',
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // Override promptsRoot to use real test prompt directory
    (testPhase as any).promptsRoot = testPromptsDir;
  });

  afterEach(() => {
    // 環境変数の復元
    process.env = originalEnv;

    // モックの復元
    jest.restoreAllMocks();
  });

  // ============================================================
  // TC-011: AGENT_CAN_INSTALL_PACKAGES=true の場合
  // ============================================================
  describe('TC-011: AGENT_CAN_INSTALL_PACKAGES=true の場合', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt("execute") is called, Then environment info is injected at the beginning', () => {
      // Given: AGENT_CAN_INSTALL_PACKAGES=true を設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

      // When: loadPrompt('execute') を呼び出す
      const prompt = testPhase.testLoadPrompt('execute');

      // Then: 環境情報が注入されている
      expect(prompt).toContain('## 🛠️ 開発環境情報');
      expect(prompt).toContain('Python');
      expect(prompt).toContain('Go');
      expect(prompt).toContain('Java');
      expect(prompt).toContain('Rust');
      expect(prompt).toContain('Ruby');

      // Then: 環境情報がプロンプトテンプレートの前に配置されている
      const envInfoIndex = prompt.indexOf('## 🛠️');
      const templateContentIndex = prompt.indexOf('Execute planning');
      expect(envInfoIndex).toBeLessThan(templateContentIndex);

      // Then: プロンプトテンプレートの内容も含まれている（環境情報の後に配置）
      expect(prompt).toContain('Execute planning phase');
    });
  });

  // ============================================================
  // TC-012: AGENT_CAN_INSTALL_PACKAGES=false の場合
  // ============================================================
  describe('TC-012: AGENT_CAN_INSTALL_PACKAGES=false の場合', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES=false, When loadPrompt("execute") is called, Then environment info is NOT injected', () => {
      // Given: AGENT_CAN_INSTALL_PACKAGES=false を設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'false';

      // When: loadPrompt('execute') を呼び出す
      const prompt = testPhase.testLoadPrompt('execute');

      // Then: 環境情報が注入されていない
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');
      expect(prompt).not.toContain('Python');

      // Then: プロンプトテンプレートのみが含まれている
      expect(prompt).toContain('Execute planning phase');
    });
  });

  // ============================================================
  // TC-013: AGENT_CAN_INSTALL_PACKAGES が未設定の場合
  // ============================================================
  describe('TC-013: AGENT_CAN_INSTALL_PACKAGES が未設定の場合', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES is not set, When loadPrompt("execute") is called, Then environment info is NOT injected (default)', () => {
      // Given: AGENT_CAN_INSTALL_PACKAGES を削除（未設定）
      delete process.env.AGENT_CAN_INSTALL_PACKAGES;

      // When: loadPrompt('execute') を呼び出す
      const prompt = testPhase.testLoadPrompt('execute');

      // Then: 環境情報が注入されていない（デフォルト動作）
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプトテンプレートのみが含まれている
      expect(prompt).toContain('Execute planning phase');
    });
  });

  // ============================================================
  // TC-014: review と revise ステップには環境情報が注入されない
  // ============================================================
  describe('TC-014: review と revise ステップには環境情報が注入されない', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt("review") is called, Then environment info is NOT injected', () => {
      // Given: AGENT_CAN_INSTALL_PACKAGES=true を設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

      // When: loadPrompt('review') を呼び出す
      const prompt = testPhase.testLoadPrompt('review');

      // Then: 環境情報が注入されていない（review ステップは対象外）
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプトテンプレートのみが含まれている
      expect(prompt).toContain('Review planning phase');
    });

    test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt("revise") is called, Then environment info is NOT injected', () => {
      // Given: AGENT_CAN_INSTALL_PACKAGES=true を設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

      // When: loadPrompt('revise') を呼び出す
      const prompt = testPhase.testLoadPrompt('revise');

      // Then: 環境情報が注入されていない（revise ステップは対象外）
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプトテンプレートのみが含まれている
      expect(prompt).toContain('Revise planning phase');
    });
  });

  // ============================================================
  // TC-015: buildEnvironmentInfoSection() が正しいMarkdown形式を返す
  // ============================================================
  describe('TC-015: buildEnvironmentInfoSection() が正しいMarkdown形式を返す', () => {
    test('When buildEnvironmentInfoSection() is called, Then correct Markdown format is returned', () => {
      // When: buildEnvironmentInfoSection() を呼び出す
      const envInfo = testPhase.testBuildEnvironmentInfoSection();

      // Then: Markdown 形式のセクションヘッダーが含まれている
      expect(envInfo).toContain('## 🛠️ 開発環境情報');

      // Then: 5つの言語のインストール方法が含まれている
      expect(envInfo).toContain('**Python**');
      expect(envInfo).toContain('apt-get update && apt-get install -y python3 python3-pip');

      expect(envInfo).toContain('**Go**');
      expect(envInfo).toContain('apt-get update && apt-get install -y golang-go');

      expect(envInfo).toContain('**Java**');
      expect(envInfo).toContain('apt-get update && apt-get install -y default-jdk');

      expect(envInfo).toContain('**Rust**');
      expect(envInfo).toContain("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y");

      expect(envInfo).toContain('**Ruby**');
      expect(envInfo).toContain('apt-get update && apt-get install -y ruby ruby-dev');

      // Then: 案内メッセージが含まれている
      expect(envInfo).toContain('テスト実行や品質チェックに必要な言語環境は、自由にインストールしてください');
    });
  });
});
