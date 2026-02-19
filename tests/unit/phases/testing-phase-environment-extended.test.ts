/**
 * ユニットテスト: TestingPhase - 環境事前チェック拡張 (Issue #706)
 *
 * テスト対象:
 * - TestingPhase.buildEnvironmentSetupNotice() の各種条件分岐
 * - AGENT_CAN_INSTALL_PACKAGES フラグに基づく通知内容の差異
 *
 * テストシナリオ参照:
 * - 2.4 TestingPhase.execute
 *   - execute_環境不足_セットアップ注入_正常系
 *   - execute_環境準備済_注入なし_正常系
 *   - execute_環境不足_インストール不可_異常系
 *
 * 注意: ESM 環境では node:child_process の spawnSync を直接 spy できないため、
 * buildEnvironmentSetupNotice() に直接テスト入力を渡してテストする。
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { TestingPhase } from '../../../src/phases/testing.js';
import { config } from '../../../src/core/config.js';

describe('TestingPhase - buildEnvironmentSetupNotice詳細テスト（Issue #706）', () => {
  let testRootDir: string;
  let testWorkingDir: string;
  let testWorkflowDir: string;
  let mockMetadata: any;
  let mockGithub: any;

  beforeEach(async () => {
    testRootDir = path.join(os.tmpdir(), `ai-workflow-test-testing-env-ext-${Date.now()}`);
    testWorkingDir = path.join(testRootDir, 'workspace');
    testWorkflowDir = path.join(testWorkingDir, '.ai-workflow', 'issue-706');

    await fs.ensureDir(testWorkflowDir);

    // ContentParser 初期化エラーを回避
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? 'dummy-key-for-ci';

    mockMetadata = {
      workflowDir: testWorkflowDir,
      data: { issue_number: '706' },
      getLanguage: jest.fn<any>().mockReturnValue('ja'),
      getRollbackContext: jest.fn<any>().mockReturnValue(null),
      getPhaseStatus: jest.fn<any>(),
      updatePhaseStatus: jest.fn<any>(),
      addCompletedStep: jest.fn<any>(),
      getCompletedSteps: jest.fn<any>().mockReturnValue([]),
      updateCurrentStep: jest.fn<any>(),
      save: jest.fn<any>(),
    };

    mockGithub = {
      postReviewResult: jest.fn<any>(),
      getIssueInfo: jest.fn<any>(),
      postComment: jest.fn<any>(),
      createOrUpdateProgressComment: jest.fn<any>(),
    };
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(testRootDir);
  });

  // テストケース: execute_環境準備済_注入なし_正常系
  // 目的: 環境が準備済みの場合にセットアップ指示が注入されないことを確認
  test('環境準備済みの場合、buildEnvironmentSetupNoticeはnullを返す', () => {
    // Given: すべてのランタイムが準備済み
    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 環境準備済みのステータスでセットアップ通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({ ready: true, missing: [] });

    // Then: null が返される（注入なし）
    expect(notice).toBeNull();
  });

  // テストケース: missing が空配列でもready=falseの場合
  test('missingが空配列でready=falseの場合、noticeはnullを返す', () => {
    // Given: ready=false だが missing は空
    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: missing が空で ready=false のステータス
    const notice = (phase as any).buildEnvironmentSetupNotice({ ready: false, missing: [] });

    // Then: null が返される
    expect(notice).toBeNull();
  });

  // テストケース: execute_環境不足_インストール不可_異常系
  // 目的: AGENT_CAN_INSTALL_PACKAGES が false の場合に不適切なインストール指示を出さないことを確認
  test('AGENT_CAN_INSTALL_PACKAGES=falseの場合、インストール指示なしで警告のみ', () => {
    // Given: パッケージインストール不可
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(false);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 不足ランタイムありで通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({
      ready: false,
      missing: ['python3'],
    });

    // Then: 警告メッセージが含まれる
    expect(notice).not.toBeNull();
    expect(notice).toContain('パッケージインストールが許可されていません');
    expect(notice).toContain('AGENT_CAN_INSTALL_PACKAGES=false');
    // インストール手順は含まれない
    expect(notice).not.toContain('apt-get update && apt-get install -y python3 python3-pip');
    // テストをスキップし理由を記録する指示が含まれる
    expect(notice).toContain('テストをスキップし理由を記録してください');
  });

  // テストケース: AGENT_CAN_INSTALL_PACKAGES=trueの場合、インストール手順が含まれる
  test('AGENT_CAN_INSTALL_PACKAGES=trueの場合、python3インストール手順が含まれる', () => {
    // Given: パッケージインストール可能
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(true);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: python3 が不足
    const notice = (phase as any).buildEnvironmentSetupNotice({
      ready: false,
      missing: ['python3'],
    });

    // Then: Python のインストール手順が含まれる
    expect(notice).not.toBeNull();
    expect(notice).toContain('テスト環境の事前チェック結果');
    expect(notice).toContain('python3');
    expect(notice).toContain('apt-get update && apt-get install -y python3 python3-pip');
    expect(notice).toContain('インストール後にテストを実行');
  });

  // テストケース: buildEnvironmentSetupNotice の出力にMarkdownヘッダーが含まれる
  test('buildEnvironmentSetupNoticeの出力にMarkdown形式の警告ヘッダーが含まれる', () => {
    // Given: パッケージインストール可能、不足あり
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(true);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({
      ready: false,
      missing: ['python3'],
    });

    // Then: Markdown形式の警告ヘッダーが含まれる
    expect(notice).toContain('## ⚠️ テスト環境の事前チェック結果');
    expect(notice).toContain('以下のランタイムが不足しています:');
    expect(notice).toContain('- python3');
  });

  // テストケース: インストール可能な場合のセットアップ手順フォーマット確認
  test('インストール手順のフォーマットが正しい', () => {
    // Given: パッケージインストール可能、python3 不足
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(true);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({
      ready: false,
      missing: ['python3'],
    });

    // Then: インストール手順が含まれる
    expect(notice).toContain('apt-get update');
    expect(notice).toContain('python3');
    // バックティック形式のインラインコードが含まれる
    expect(notice).toContain('`apt-get update');
  });

  // テストケース: ready=true でも missing に要素がある（矛盾状態）でもクラッシュしない
  test('ready=trueでmissingに要素がある矛盾状態でもnullを返す', () => {
    // Given: ready=true だが missing に要素がある矛盾状態
    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 矛盾状態で通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({
      ready: true,
      missing: ['python3'],
    });

    // Then: ready=true なので null を返す（ready フラグが優先）
    expect(notice).toBeNull();
  });
});
