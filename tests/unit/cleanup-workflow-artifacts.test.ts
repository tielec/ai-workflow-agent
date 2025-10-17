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

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { EvaluationPhase } from '../../src/phases/evaluation.js';
import { GitHubClient } from '../../src/core/github-client.js';

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

  before(async () => {
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

  after(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
    // 環境変数を復元
    process.env = originalEnv;
  });

  afterEach(() => {
    // 各テスト後に環境変数をクリーンアップ
    delete process.env.CI;
  });

  it('2.1.1: 正常系 - CI環境でディレクトリ削除成功', async () => {
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
    assert.equal(
      exists,
      false,
      'ワークフローディレクトリが削除されていません'
    );
  });

  it('2.1.2: 正常系 - forceフラグで確認スキップ', async () => {
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
    assert.equal(
      exists,
      false,
      'forceフラグ時にワークフローディレクトリが削除されていません'
    );
  });

  it('2.1.5: 異常系 - ディレクトリが存在しない', async () => {
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
    assert.equal(
      error,
      null,
      `ディレクトリ不在時にエラーが発生しました: ${error?.message}`
    );
  });

  it('2.1.7: セキュリティ - パストラバーサル攻撃', async () => {
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
    assert.notEqual(
      error,
      null,
      'パストラバーサル攻撃が防御されていません'
    );
    assert.match(
      error?.message || '',
      /Invalid workflow directory path/i,
      'エラーメッセージが不正なパスを示していません'
    );

    // クリーンアップ
    await fs.remove(maliciousMetadataPath);
  });

  it('2.1.8: セキュリティ - シンボリックリンク攻撃', async () => {
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
      console.log('[INFO] Skipping symlink test - symlink creation not supported');
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
    assert.notEqual(
      error,
      null,
      'シンボリックリンク攻撃が防御されていません'
    );
    assert.match(
      error?.message || '',
      /symbolic link/i,
      'エラーメッセージがシンボリックリンクを示していません'
    );

    // 実際のディレクトリは保護されている
    assert.ok(
      fs.existsSync(realDir),
      '実際のディレクトリが削除されてしまいました'
    );
    assert.ok(
      fs.existsSync(path.join(realDir, 'important-file.txt')),
      '重要なファイルが削除されてしまいました'
    );

    // クリーンアップ
    await fs.remove(symlinkPath);
    await fs.remove(realDir);
  });
});

describe('isCIEnvironment メソッドテスト', () => {
  let originalEnv: NodeJS.ProcessEnv;

  before(() => {
    originalEnv = { ...process.env };
  });

  after(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    delete process.env.CI;
  });

  it('2.2.1: CI環境判定 - CI=true', () => {
    // Given: CI=true
    process.env.CI = 'true';

    // When: isCIEnvironmentを呼び出す
    const metadataManager = new MetadataManager(
      path.join(TEST_DIR, 'dummy-metadata.json')
    );
    const githubClient = new GitHubClient('test-token', 'test-owner/test-repo');
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
    assert.equal(result, true, 'CI=true時にCI環境と判定されません');
  });

  it('2.2.2: CI環境判定 - CI=1', () => {
    // Given: CI=1
    process.env.CI = '1';

    const metadataManager = new MetadataManager(
      path.join(TEST_DIR, 'dummy-metadata.json')
    );
    const githubClient = new GitHubClient('test-token', 'test-owner/test-repo');
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
    assert.equal(result, true, 'CI=1時にCI環境と判定されません');
  });

  it('2.2.3: CI環境判定 - CI未設定', () => {
    // Given: CIが未設定
    delete process.env.CI;

    const metadataManager = new MetadataManager(
      path.join(TEST_DIR, 'dummy-metadata.json')
    );
    const githubClient = new GitHubClient('test-token', 'test-owner/test-repo');
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
    assert.equal(result, false, 'CI未設定時にCI環境と判定されました');
  });

  it('2.2.4: CI環境判定 - CI=false', () => {
    // Given: CI=false
    process.env.CI = 'false';

    const metadataManager = new MetadataManager(
      path.join(TEST_DIR, 'dummy-metadata.json')
    );
    const githubClient = new GitHubClient('test-token', 'test-owner/test-repo');
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
    assert.equal(result, false, 'CI=false時にCI環境と判定されました');
  });
});

describe('エッジケーステスト', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let evaluationPhase: EvaluationPhase;
  let testMetadataPath: string;
  let workflowDir: string;
  let originalEnv: NodeJS.ProcessEnv;

  before(async () => {
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

  after(async () => {
    await fs.remove(TEST_DIR);
    process.env = originalEnv;
  });

  it('3.1: 空のワークフローディレクトリも正しく削除される', async () => {
    // Given: 空のワークフローディレクトリ
    await fs.ensureDir(workflowDir);

    // When: cleanupWorkflowArtifactsを呼び出す
    await (evaluationPhase as any).cleanupWorkflowArtifacts(true);

    // Then: 空のディレクトリも削除される
    assert.equal(
      fs.existsSync(workflowDir),
      false,
      '空のワークフローディレクトリが削除されていません'
    );
  });

  it('3.2: ネストされたファイル構造も正しく削除される', async () => {
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
    assert.equal(
      fs.existsSync(workflowDir),
      false,
      'ネストされたワークフローディレクトリが削除されていません'
    );
  });

  it('3.3: 冪等性 - 既に削除されているディレクトリに対して正常に動作する', async () => {
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
    assert.equal(
      error,
      null,
      `2回目の呼び出しでエラーが発生しました: ${error?.message}`
    );
  });
});
