/**
 * ユニットテスト: BasePhase.loadPrompt() - 環境情報注入 (Issue #177)
 *
 * テスト対象:
 * - BasePhase.loadPrompt() メソッドの環境情報注入ロジック
 * - config.canAgentInstallPackages() による条件分岐
 * - buildEnvironmentInfoSection() メソッドの Markdown 生成
 *
 * テスト戦略: UNIT_ONLY
 * - execute ステップでのみ環境情報が注入されることを検証
 * - AGENT_CAN_INSTALL_PACKAGES 環境変数による動作分岐を検証
 * - 環境情報セクションの Markdown 形式を検証
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { BasePhase } from '../../../src/phases/base-phase.js';
import type { PhaseExecutionResult } from '../../../src/types.js';
import * as fs from 'node:fs';

// fs-extra をモック
jest.mock('fs-extra');
const mockFs = fs as jest.Mocked<typeof fs>;

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
  const testWorkingDir = '/test/workspace';
  const testWorkflowDir = '/test/.ai-workflow/issue-177';

  beforeEach(() => {
    jest.clearAllMocks();

    // 環境変数のバックアップ
    originalEnv = { ...process.env };

    // MetadataManager のモック
    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '177' },
      updatePhaseStatus: jest.fn(),
      getPhaseStatus: jest.fn(),
      addCompletedStep: jest.fn(),
      getCompletedSteps: jest.fn().mockReturnValue([]),
      updateCurrentStep: jest.fn(),
      save: jest.fn(),
      getRollbackContext: jest.fn().mockReturnValue(null), // Issue #90
    };

    // GitHubClient のモック
    mockGithub = {
      getIssueInfo: jest.fn(),
      postComment: jest.fn(),
      createOrUpdateProgressComment: jest.fn(),
    };

    // fs-extra のモック設定
    mockFs.existsSync.mockReturnValue(true);
    mockFs.ensureDirSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockReturnValue('Execute planning phase...\n\n{issue_info}');
    mockFs.lstatSync.mockReturnValue({ isSymbolicLink: () => false } as any);

    // TestPhase インスタンス作成
    testPhase = new TestPhase({
      phaseName: 'planning',
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });
  });

  afterEach(() => {
    // 環境変数の復元
    process.env = originalEnv;
  });

  // TC-011: AGENT_CAN_INSTALL_PACKAGES=true の場合、プロンプト先頭に環境情報が注入される（正常系）
  describe('TC-011: AGENT_CAN_INSTALL_PACKAGES=true の場合', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt("execute") is called, Then environment info is injected at the beginning', () => {
      // Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES を "true" に設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

      // プロンプトテンプレートファイルの内容をモック
      mockFs.readFileSync.mockReturnValue('Execute planning phase...\n\n{issue_info}');

      // When: loadPrompt('execute') を呼び出す
      const prompt = testPhase.testLoadPrompt('execute');

      // Then: プロンプトの先頭に "## 🛠️ 開発環境情報" セクションが含まれる
      expect(prompt).toContain('## 🛠️ 開発環境情報');

      // Then: セクション内に Python のインストールコマンドが含まれる
      expect(prompt).toContain('Python');
      expect(prompt).toContain('apt-get update && apt-get install -y python3 python3-pip');

      // Then: セクション内に Go のインストールコマンドが含まれる
      expect(prompt).toContain('Go');
      expect(prompt).toContain('apt-get update && apt-get install -y golang-go');

      // Then: セクション内に Java のインストールコマンドが含まれる
      expect(prompt).toContain('Java');
      expect(prompt).toContain('apt-get update && apt-get install -y default-jdk');

      // Then: セクション内に Rust のインストールコマンドが含まれる
      expect(prompt).toContain('Rust');
      expect(prompt).toContain("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y");

      // Then: セクション内に Ruby のインストールコマンドが含まれる
      expect(prompt).toContain('Ruby');
      expect(prompt).toContain('apt-get update && apt-get install -y ruby ruby-dev');

      // Then: 環境情報セクションがプロンプトの先頭に配置されている
      const envInfoIndex = prompt.indexOf('## 🛠️');
      const templateContentIndex = prompt.indexOf('Execute planning');
      expect(envInfoIndex).toBeLessThan(templateContentIndex);

      // Then: プロンプトテンプレートの内容も含まれている（環境情報の後に配置）
      expect(prompt).toContain('Execute planning phase');
    });
  });

  // TC-012: AGENT_CAN_INSTALL_PACKAGES=false の場合、環境情報が注入されない（正常系）
  describe('TC-012: AGENT_CAN_INSTALL_PACKAGES=false の場合', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES=false, When loadPrompt("execute") is called, Then environment info is NOT injected', () => {
      // Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES を "false" に設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'false';

      // プロンプトテンプレートファイルの内容をモック
      mockFs.readFileSync.mockReturnValue('Execute planning phase...');

      // When: loadPrompt('execute') を呼び出す
      const prompt = testPhase.testLoadPrompt('execute');

      // Then: プロンプトに "## 🛠️ 開発環境情報" セクションが含まれない
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプト内容は元のテンプレート内容のみ
      expect(prompt).toContain('Execute planning phase');
    });
  });

  // TC-013: AGENT_CAN_INSTALL_PACKAGES が未設定の場合、環境情報が注入されない（正常系・デフォルト動作）
  describe('TC-013: AGENT_CAN_INSTALL_PACKAGES が未設定の場合', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES is not set, When loadPrompt("execute") is called, Then environment info is NOT injected (default)', () => {
      // Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES が未設定
      delete process.env.AGENT_CAN_INSTALL_PACKAGES;

      // プロンプトテンプレートファイルの内容をモック
      mockFs.readFileSync.mockReturnValue('Execute planning phase...');

      // When: loadPrompt('execute') を呼び出す
      const prompt = testPhase.testLoadPrompt('execute');

      // Then: プロンプトに "## 🛠️ 開発環境情報" セクションが含まれない（デフォルト動作）
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプト内容は元のテンプレート内容のみ
      expect(prompt).toContain('Execute planning phase');
    });
  });

  // TC-014: review と revise ステップには環境情報が注入されないことを検証
  describe('TC-014: review と revise ステップには環境情報が注入されない', () => {
    test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt("review") is called, Then environment info is NOT injected', () => {
      // Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES を "true" に設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

      // プロンプトテンプレートファイルの内容をモック
      mockFs.readFileSync.mockReturnValue('Review planning phase output...');

      // When: loadPrompt('review') を呼び出す
      const prompt = testPhase.testLoadPrompt('review');

      // Then: プロンプトに "## 🛠️ 開発環境情報" セクションが含まれない（review ステップには注入されない）
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプト内容は元のテンプレート内容のみ
      expect(prompt).toContain('Review planning phase output');
    });

    test('Given AGENT_CAN_INSTALL_PACKAGES=true, When loadPrompt("revise") is called, Then environment info is NOT injected', () => {
      // Given: 環境変数 AGENT_CAN_INSTALL_PACKAGES を "true" に設定
      process.env.AGENT_CAN_INSTALL_PACKAGES = 'true';

      // プロンプトテンプレートファイルの内容をモック
      mockFs.readFileSync.mockReturnValue('Revise planning phase output...');

      // When: loadPrompt('revise') を呼び出す
      const prompt = testPhase.testLoadPrompt('revise');

      // Then: プロンプトに "## 🛠️ 開発環境情報" セクションが含まれない（revise ステップには注入されない）
      expect(prompt).not.toContain('## 🛠️ 開発環境情報');

      // Then: プロンプト内容は元のテンプレート内容のみ
      expect(prompt).toContain('Revise planning phase output');
    });
  });

  // TC-015: buildEnvironmentInfoSection() が正しいMarkdown形式を返す（正常系）
  describe('TC-015: buildEnvironmentInfoSection() が正しいMarkdown形式を返す', () => {
    test('When buildEnvironmentInfoSection() is called, Then correct Markdown format is returned', () => {
      // When: buildEnvironmentInfoSection() を呼び出す
      const result = testPhase.testBuildEnvironmentInfoSection();

      // Then: セクションヘッダー "## 🛠️ 開発環境情報" が含まれる
      expect(result).toContain('## 🛠️ 開発環境情報');

      // Then: Python のインストールコマンドが含まれる
      expect(result).toContain('Python');
      expect(result).toContain('apt-get update && apt-get install -y python3 python3-pip');

      // Then: Go のインストールコマンドが含まれる
      expect(result).toContain('Go');
      expect(result).toContain('apt-get update && apt-get install -y golang-go');

      // Then: Java のインストールコマンドが含まれる
      expect(result).toContain('Java');
      expect(result).toContain('apt-get update && apt-get install -y default-jdk');

      // Then: Rust のインストールコマンドが含まれる
      expect(result).toContain('Rust');
      expect(result).toContain("curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y");

      // Then: Ruby のインストールコマンドが含まれる
      expect(result).toContain('Ruby');
      expect(result).toContain('apt-get update && apt-get install -y ruby ruby-dev');

      // Then: 導入メッセージが含まれる
      expect(result).toContain('このDocker環境では、以下のプログラミング言語をインストール可能です');

      // Then: 補足メッセージが含まれる
      expect(result).toContain('テスト実行や品質チェックに必要な言語環境は、自由にインストールしてください');

      // Then: Markdown の箇条書き形式（"-" で始まる行）が含まれる
      expect(result).toMatch(/- \*\*Python\*\*:/);
      expect(result).toMatch(/- \*\*Go\*\*:/);
      expect(result).toMatch(/- \*\*Java\*\*:/);
      expect(result).toMatch(/- \*\*Rust\*\*:/);
      expect(result).toMatch(/- \*\*Ruby\*\*:/);

      // Then: インストールコマンドがコードブロック（`...`）で囲まれている
      expect(result).toMatch(/`apt-get update && apt-get install -y python3 python3-pip`/);
      expect(result).toMatch(/`apt-get update && apt-get install -y golang-go`/);
      expect(result).toMatch(/`apt-get update && apt-get install -y default-jdk`/);
      expect(result).toMatch(/`curl --proto '=https' --tlsv1.2 -sSf https:\/\/sh.rustup.rs \| sh -s -- -y`/);
      expect(result).toMatch(/`apt-get update && apt-get install -y ruby ruby-dev`/);
    });
  });
});
