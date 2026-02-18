import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { SpawnSyncReturns } from 'node:child_process';
import { config } from '../../../src/core/config.js';

const mockSpawnSync = jest.fn();
const mockSpawn = jest.fn();
jest.unstable_mockModule('node:child_process', () => ({
  spawnSync: mockSpawnSync,
  spawn: mockSpawn,
}));

const { TestingPhase } = await import('../../../src/phases/testing.js');

describe('TestingPhase - 環境事前チェック（Issue #706）', () => {
  let testRootDir: string;
  let testWorkingDir: string;
  let testWorkflowDir: string;
  let mockMetadata: any;
  let mockGithub: any;
  beforeEach(async () => {
    testRootDir = path.join(os.tmpdir(), `ai-workflow-test-testing-phase-${Date.now()}`);
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

    mockSpawnSync.mockReset();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(testRootDir);
  });

  test('環境が準備済みの場合、チェック結果はready=trueになる', () => {
    // Given: python3 が利用可能
    mockSpawnSync.mockReturnValue({ status: 0, error: null } as unknown as SpawnSyncReturns<Buffer>);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 環境チェックを実行
    const result = (phase as any).checkTestEnvironment();

    // Then: ready=true
    expect(result).toEqual({ ready: true, missing: [] });
  });

  test('環境が不足している場合、missing に不足ランタイムが含まれる', () => {
    // Given: python3 が利用不可
    mockSpawnSync.mockReturnValue({ status: 1, error: new Error('ENOENT') } as unknown as SpawnSyncReturns<Buffer>);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: 環境チェックを実行
    const result = (phase as any).checkTestEnvironment();

    // Then: missing に python3 が含まれる
    expect(result.ready).toBe(false);
    expect(result.missing).toContain('python3');
  });

  test('インストール可能な場合、セットアップ手順が注入される', () => {
    // Given: 不足ランタイムが存在し、インストール可能
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(true);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: セットアップ通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({ ready: false, missing: ['python3'] });

    // Then: Pythonのインストール手順が含まれる
    expect(notice).toContain('テスト環境の事前チェック結果');
    expect(notice).toContain('python3');
    expect(notice).toContain('apt-get update && apt-get install -y python3 python3-pip');
  });

  test('インストール不可の場合、警告のみが注入される', () => {
    // Given: 不足ランタイムが存在し、インストール不可
    jest.spyOn(config, 'canAgentInstallPackages').mockReturnValue(false);

    const phase = new TestingPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGithub,
      skipDependencyCheck: true,
    });

    // When: セットアップ通知を生成
    const notice = (phase as any).buildEnvironmentSetupNotice({ ready: false, missing: ['python3'] });

    // Then: 警告文が含まれ、インストール手順は含まれない
    expect(notice).toContain('パッケージインストールが許可されていません');
    expect(notice).not.toContain('apt-get update && apt-get install -y python3');
  });
});
