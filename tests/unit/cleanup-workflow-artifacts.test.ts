/**
 * ユニットテスト: base-phase.ts - cleanupWorkflowArtifacts機能（Issue #2）
 *
 * テスト対象:
 * - cleanupWorkflowArtifacts メソッド
 * - isCIEnvironment メソッド
 * - promptUserConfirmation メソッド
 * - .ai-workflow/issue-<NUM> ディレクトリ全体の削除
 * - セキュリティチェック（パストラバーサル、シンボリックリンク）
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { EvaluationPhase } from '../../src/phases/evaluation.js';
import { GitHubClient } from '../../src/core/github-client.js';
import { logger } from '../../src/utils/logger.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'cleanup-artifacts-test');
const TEST_ISSUE_NUMBER = '2';

describe('cleanupWorkflowArtifacts メソッドテスト（Issue #2）', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let evaluationPhase: EvaluationPhase;
  let testMetadataPath: string;
  let workflowDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    // 環境変数の元の値を保存
    originalEnv = { ...process.env };

    // テスト用ディレクトリとmetadata.jsonを作成
    workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue #2 - Cleanup Workflow Artifacts',
      workflow_dir: workflowDir,
      phases: {
        evaluation: {
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
      },
      costs: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });
    metadataManager = new MetadataManager(testMetadataPath);

    // GitHubClientのモック
    githubClient = new GitHubClient(
      'test-token',
      'test-owner/test-repo'
    );

    // EvaluationPhaseのインスタンスを作成
    evaluationPhase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
    // 環境変数を復元
    process.env = originalEnv;
  });

  afterEach(() => {
    // 各テスト後に環境変数をクリーンアップ
    delete process.env.CI;
  });

  test('2.1.1: 正常系 - CI環境でディレクトリ削除成功', async () => {
    // Given: CI環境（CI=true）
    process.env.CI = 'true';

    // ワークフローディレクトリを作成
    await fs.ensureDir(workflowDir);
    await fs.writeFile(
      path.join(workflowDir, 'test-file.txt'),
      'Test content'
    );

    // When: cleanupWorkflowArtifactsを呼び出す（force=false）
    await (evaluationPhase as any).cleanupWorkflowArtifacts(false);

    // Then: ディレクトリが削除されている
    const exists = fs.existsSync(workflowDir);
    expect(exists).toBe(false);
  });

  test('2.1.2: 正常系 - forceフラグで確認スキップ', async () => {
    // Given: 非CI環境、force=true
    delete process.env.CI;

    // ワークフローディレクトリを再作成
    await fs.ensureDir(workflowDir);
    await fs.writeFile(
      path.join(workflowDir, 'test-file.txt'),
      'Test content'
    );

    // When: cleanupWorkflowArtifactsを呼び出す（force=true）
    await (evaluationPhase as any).cleanupWorkflowArtifacts(true);

    // Then: 確認プロンプトなしで削除されている
    const exists = fs.existsSync(workflowDir);
    expect(exists).toBe(false);
  });

  test('2.1.5: 異常系 - ディレクトリが存在しない', async () => {
    // Given: CI環境、ワークフローディレクトリが存在しない
    process.env.CI = 'true';

    // ディレクトリを削除（存在しない状態にする）
    if (fs.existsSync(workflowDir)) {
      await fs.remove(workflowDir);
    }

    // When: cleanupWorkflowArtifactsを呼び出す
    let error: Error | null = null;
    try {
      await (evaluationPhase as any).cleanupWorkflowArtifacts(false);
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーがスローされない（正常終了）
    expect(error).toBeNull();
  });

  test('2.1.7: セキュリティ - パストラバーサル攻撃', async () => {
    // Given: 不正なパスを持つメタデータ
    process.env.CI = 'true';

    // 悪意のあるパスでメタデータを作成
    const maliciousWorkflowDir = '../../etc/passwd';
    const maliciousMetadataPath = path.join(TEST_DIR, 'malicious-metadata.json');
    const maliciousMetadata = {
      version: '0.2.0',
      issue_number: '999',
      issue_url: 'https://github.com/test/repo/issues/999',
      issue_title: 'Malicious Issue',
      workflow_dir: maliciousWorkflowDir,
      phases: {},
      costs: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.ensureDir(TEST_DIR);
    await fs.writeJSON(maliciousMetadataPath, maliciousMetadata, { spaces: 2 });

    const maliciousMetadataManager = new MetadataManager(maliciousMetadataPath);
    const maliciousPhase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager: maliciousMetadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });

    // When: cleanupWorkflowArtifactsを呼び出す
    let error: Error | null = null;
    try {
      await (maliciousPhase as any).cleanupWorkflowArtifacts(true);
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーがスローされる
    expect(error).not.toBeNull();
    expect(error?.message || '').toMatch(/Invalid workflow directory path/i);

    // クリーンアップ
    await fs.remove(maliciousMetadataPath);
  });

  test('2.1.8: セキュリティ - シンボリックリンク攻撃', async () => {
    // Given: シンボリックリンクのワークフローディレクトリ
    process.env.CI = 'true';

    // 実際のディレクトリを作成
    const realDir = path.join(TEST_DIR, 'real-directory');
    await fs.ensureDir(realDir);
    await fs.writeFile(
      path.join(realDir, 'important-file.txt'),
      'Important data'
    );

    // シンボリックリンクを作成
    const symlinkPath = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(path.dirname(symlinkPath));

    // 既存のディレクトリを削除してシンボリックリンクを作成
    if (fs.existsSync(symlinkPath)) {
      await fs.remove(symlinkPath);
    }

    try {
      await fs.symlink(realDir, symlinkPath, 'dir');
    } catch (err) {
      // Windows等でシンボリックリンク作成に失敗する場合はスキップ
      logger.info('Skipping symlink test - symlink creation not supported');
      return;
    }

    // When: cleanupWorkflowArtifactsを呼び出す
    let error: Error | null = null;
    try {
      await (evaluationPhase as any).cleanupWorkflowArtifacts(true);
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーがスローされる
    expect(error).not.toBeNull();
    expect(error?.message || '').toMatch(/symbolic link/i);

    // 実際のディレクトリは保護されている
    expect(fs.existsSync(realDir)).toBeTruthy();
    expect(fs.existsSync(path.join(realDir, 'important-file.txt'))).toBeTruthy();

    // クリーンアップ
    await fs.remove(symlinkPath);
    await fs.remove(realDir);
  });
});

describe('isCIEnvironment メソッドテスト', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let dummyMetadataPath: string;

  beforeAll(async () => {
    originalEnv = { ...process.env };

    // ダミーのmetadata.jsonを作成
    dummyMetadataPath = path.join(TEST_DIR, 'dummy-metadata.json');
    const dummyWorkflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-dummy`);
    await fs.ensureDir(dummyWorkflowDir);

    const dummyMetadata = {
      version: '0.2.0',
      issue_number: 'dummy',
      issue_url: 'https://github.com/test/repo/issues/dummy',
      issue_title: 'Dummy Issue for isCIEnvironment test',
      workflow_dir: dummyWorkflowDir,
      phases: {},
      costs: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(dummyMetadataPath, dummyMetadata, { spaces: 2 });
    metadataManager = new MetadataManager(dummyMetadataPath);
    githubClient = new GitHubClient('test-token', 'test-owner/test-repo');
  });

  afterAll(async () => {
    await fs.remove(dummyMetadataPath);
    process.env = originalEnv;
  });

  afterEach(() => {
    delete process.env.CI;
  });

  test('2.2.1: CI環境判定 - CI=true', () => {
    // Given: CI=true
    process.env.CI = 'true';

    // When: isCIEnvironmentを呼び出す
    const phase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });

    const result = (phase as any).isCIEnvironment();

    // Then: trueが返される
    expect(result).toBe(true);
  });

  test('2.2.2: CI環境判定 - CI=1', () => {
    // Given: CI=1
    process.env.CI = '1';

    const phase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });

    const result = (phase as any).isCIEnvironment();

    // Then: trueが返される
    expect(result).toBe(true);
  });

  test('2.2.3: CI環境判定 - CI未設定', () => {
    // Given: CIが未設定
    delete process.env.CI;

    const phase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });

    const result = (phase as any).isCIEnvironment();

    // Then: falseが返される
    expect(result).toBe(false);
  });

  test('2.2.4: CI環境判定 - CI=false', () => {
    // Given: CI=false
    process.env.CI = 'false';

    const phase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });

    const result = (phase as any).isCIEnvironment();

    // Then: falseが返される
    expect(result).toBe(false);
  });
});

describe('エッジケーステスト', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let evaluationPhase: EvaluationPhase;
  let testMetadataPath: string;
  let workflowDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    originalEnv = { ...process.env };
    process.env.CI = 'true';

    workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue #2',
      workflow_dir: workflowDir,
      phases: {},
      costs: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });
    metadataManager = new MetadataManager(testMetadataPath);

    githubClient = new GitHubClient('test-token', 'test-owner/test-repo');

    evaluationPhase = new EvaluationPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });
  });

  afterAll(async () => {
    await fs.remove(TEST_DIR);
    process.env = originalEnv;
  });

  test('3.1: 空のワークフローディレクトリも正しく削除される', async () => {
    // Given: 空のワークフローディレクトリ
    await fs.ensureDir(workflowDir);

    // When: cleanupWorkflowArtifactsを呼び出す
    await (evaluationPhase as any).cleanupWorkflowArtifacts(true);

    // Then: 空のディレクトリも削除される
    expect(fs.existsSync(workflowDir)).toBe(false);
  });

  test('3.2: ネストされたファイル構造も正しく削除される', async () => {
    // Given: ネストされたファイル構造
    const nestedDir = path.join(workflowDir, '00_planning', 'output', 'deeply', 'nested');
    await fs.ensureDir(nestedDir);
    await fs.writeFile(
      path.join(nestedDir, 'deep-file.md'),
      '# Deep File\n\nNested content'
    );
    await fs.writeFile(
      path.join(workflowDir, 'metadata.json'),
      JSON.stringify({ test: true }, null, 2)
    );

    // When: cleanupWorkflowArtifactsを呼び出す
    await (evaluationPhase as any).cleanupWorkflowArtifacts(true);

    // Then: ネストされた構造全体が削除される
    expect(fs.existsSync(workflowDir)).toBe(false);
  });

  test('3.3: 冪等性 - 既に削除されているディレクトリに対して正常に動作する', async () => {
    // Given: ワークフローディレクトリが存在しない
    if (fs.existsSync(workflowDir)) {
      await fs.remove(workflowDir);
    }

    // When: cleanupWorkflowArtifactsを2回連続で呼び出す
    await (evaluationPhase as any).cleanupWorkflowArtifacts(true);

    let error: Error | null = null;
    try {
      await (evaluationPhase as any).cleanupWorkflowArtifacts(true);
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーが発生しない（冪等性）
    expect(error).toBeNull();
  });
});
