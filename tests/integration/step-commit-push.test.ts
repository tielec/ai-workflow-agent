/**
 * インテグレーションテスト: ステップ単位のコミット＆プッシュ (Issue #10)
 *
 * テスト対象:
 * - ステップ単位のコミット＆プッシュ機能
 * - プッシュ失敗時のリトライ機能
 * - エラーハンドリング
 *
 * 注意: 実際のGitリポジトリを使用するテストのため、テスト環境に依存します。
 * CI環境では、実際のGit操作をモックに置き換える必要がある場合があります。
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { GitManager } from '../../src/core/git-manager.js';
import simpleGit from 'simple-git';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'step-commit-push-test');

describe('ステップコミット＆プッシュの統合テスト', () => {
  let metadataManager: MetadataManager;
  let gitManager: GitManager;
  let testMetadataPath: string;

  beforeAll(async () => {
    // テスト用ディレクトリとGitリポジトリを作成
    await fs.ensureDir(TEST_DIR);
    testMetadataPath = path.join(TEST_DIR, '.ai-workflow', 'issue-123', 'metadata.json');
    await fs.ensureDir(path.dirname(testMetadataPath));

    // Gitリポジトリを初期化
    const git = simpleGit(TEST_DIR);
    await git.init();
    await git.addConfig('user.name', 'Test User', false, 'local');
    await git.addConfig('user.email', 'test@example.com', false, 'local');

    // メタデータを作成
    const testMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '123',
      issue_url: 'https://github.com/test/repo/issues/123',
      issue_title: 'Test Issue',
      workflow_dir: path.dirname(testMetadataPath),
      branch_name: 'ai-workflow/issue-123',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: [],
        },
      },
      design_decisions: {
        implementation_strategy: null,
        test_strategy: null,
        test_code_strategy: null,
      },
      cost_tracking: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });
    metadataManager = new MetadataManager(testMetadataPath);
    gitManager = new GitManager(TEST_DIR, metadataManager);

    // 初期コミットを作成（Gitリポジトリの初期化）
    const initialFile = path.join(TEST_DIR, 'README.md');
    await fs.writeFile(initialFile, '# Test Repository');
    await git.add('README.md');
    await git.commit('Initial commit');
  });

  afterEach(async () => {
    // 各テスト後に.ai-workflowディレクトリをクリーンアップ
    const workflowDir = path.join(TEST_DIR, '.ai-workflow');
    if (await fs.pathExists(workflowDir)) {
      await fs.remove(workflowDir);
      // 削除をGitにコミット
      const git = simpleGit(TEST_DIR);
      await git.add(['.']);
      await git.commit('Clean up after test');
    }
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
  });

  test('TC-I-005: プッシュ成功（正常系）- ローカルコミットのみ', async () => {
    // Given: executeステップが完了
    const outputDir = path.join(TEST_DIR, '.ai-workflow', 'issue-123', '01_requirements', 'output');
    await fs.ensureDir(outputDir);
    await fs.writeFile(path.join(outputDir, 'requirements.md'), '# Requirements');

    // When: ステップ単位のコミットを実行
    const commitResult = await gitManager.commitStepOutput(
      'requirements',
      1,
      'execute',
      123,
      TEST_DIR,
    );

    // Then: コミットが成功する
    expect(commitResult.success).toBe(true);
    expect(commitResult.commit_hash).toBeTruthy();
    expect(commitResult.files_committed.length > 0).toBeTruthy();

    // コミットメッセージを確認
    const git = simpleGit(TEST_DIR);
    const commitMessage = await git.show([commitResult.commit_hash!, '--pretty=format:%B', '--no-patch']);
    expect(commitMessage.includes('[ai-workflow] Phase 1 (requirements) - execute completed')).toBeTruthy();
    expect(commitMessage.includes('Issue: #123')).toBeTruthy();
    expect(commitMessage.includes('Step: execute')).toBeTruthy();
  });

  test('TC-I-012: コミットメッセージの形式確認', async () => {
    // Given: reviewステップが完了
    const outputDir = path.join(TEST_DIR, '.ai-workflow', 'issue-123', '01_requirements', 'review');
    await fs.ensureDir(outputDir);
    await fs.writeFile(path.join(outputDir, 'review.md'), '# Review Result');

    // When: ステップ単位のコミットを実行
    const commitResult = await gitManager.commitStepOutput(
      'requirements',
      1,
      'review',
      123,
      TEST_DIR,
    );

    // Then: コミットメッセージが正しい形式で生成される
    expect(commitResult.success).toBe(true);
    expect(commitResult.commit_hash).toBeTruthy();

    const git = simpleGit(TEST_DIR);
    const commitMessage = await git.show([commitResult.commit_hash!, '--pretty=format:%B', '--no-patch']);

    // コミットメッセージの各要素を確認
    expect(commitMessage.includes('[ai-workflow] Phase 1 (requirements) - review completed')).toBeTruthy();
    expect(commitMessage.includes('Issue: #123')).toBeTruthy();
    expect(commitMessage.includes('Phase: 1 (requirements)')).toBeTruthy();
    expect(commitMessage.includes('Step: review')).toBeTruthy();
    expect(commitMessage.includes('Status: completed')).toBeTruthy();
    expect(commitMessage.includes('Auto-generated by AI Workflow')).toBeTruthy();
  });

  test('TC-I-013: 複数ステップの連続コミット', async () => {
    // Given: executeステップのファイルを作成
    const executeDir = path.join(TEST_DIR, '.ai-workflow', 'issue-123', '01_requirements', 'execute');
    await fs.ensureDir(executeDir);
    await fs.writeFile(path.join(executeDir, 'execute.md'), '# Execute');

    // When: executeステップのコミットを実行
    const executeCommit = await gitManager.commitStepOutput('requirements', 1, 'execute', 123, TEST_DIR);
    expect(executeCommit.success).toBe(true);
    expect(executeCommit.commit_hash).toBeTruthy();

    // Given: reviewステップのファイルを作成
    const reviewDir = path.join(TEST_DIR, '.ai-workflow', 'issue-123', '01_requirements', 'review');
    await fs.ensureDir(reviewDir);
    await fs.writeFile(path.join(reviewDir, 'review.md'), '# Review');

    // When: reviewステップのコミットを実行
    const reviewCommit = await gitManager.commitStepOutput('requirements', 1, 'review', 123, TEST_DIR);
    expect(reviewCommit.success).toBe(true);
    expect(reviewCommit.commit_hash).toBeTruthy();

    // Given: reviseステップのファイルを作成
    const reviseDir = path.join(TEST_DIR, '.ai-workflow', 'issue-123', '01_requirements', 'revise');
    await fs.ensureDir(reviseDir);
    await fs.writeFile(path.join(reviseDir, 'revise.md'), '# Revise');

    // When: reviseステップのコミットを実行
    const reviseCommit = await gitManager.commitStepOutput('requirements', 1, 'revise', 123, TEST_DIR);
    expect(reviseCommit.success).toBe(true);
    expect(reviseCommit.commit_hash).toBeTruthy();

    // Then: 各コミットメッセージを確認
    const git = simpleGit(TEST_DIR);
    const executeMessage = await git.show([executeCommit.commit_hash!, '--pretty=format:%B', '--no-patch']);
    const reviewMessage = await git.show([reviewCommit.commit_hash!, '--pretty=format:%B', '--no-patch']);
    const reviseMessage = await git.show([reviseCommit.commit_hash!, '--pretty=format:%B', '--no-patch']);

    expect(executeMessage.includes('execute completed')).toBeTruthy();
    expect(reviewMessage.includes('review completed')).toBeTruthy();
    expect(reviseMessage.includes('revise completed')).toBeTruthy();
  });

  test('TC-U-013: commitStepOutput_ファイルなし', async () => {
    // Given: コミット対象ファイルが存在しない
    // （前のテストで既にコミットされているため、変更なし）

    // When: コミットを実行
    const commitResult = await gitManager.commitStepOutput(
      'requirements',
      1,
      'execute',
      123,
      TEST_DIR,
    );

    // Then: 警告が表示され、成功として扱われる
    expect(commitResult.success).toBe(true);
    expect(commitResult.commit_hash).toBeNull();
    expect(commitResult.files_committed.length).toBe(0);
  });
});

describe('エラーハンドリングの統合テスト', () => {
  let testMetadataPath: string;
  let testDir: string;

  beforeAll(async () => {
    // テスト用ディレクトリを作成（Gitリポジトリ外の一時ディレクトリ）
    testDir = path.join(os.tmpdir(), `ai-workflow-step-error-test-${Date.now()}`);
    await fs.ensureDir(testDir);
    testMetadataPath = path.join(testDir, '.ai-workflow', 'issue-456', 'metadata.json');
    await fs.ensureDir(path.dirname(testMetadataPath));

    // メタデータを作成
    const testMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '456',
      issue_url: 'https://github.com/test/repo/issues/456',
      issue_title: 'Test Error Handling',
      workflow_dir: path.dirname(testMetadataPath),
      branch_name: 'ai-workflow/issue-456',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: [],
        },
      },
      design_decisions: {
        implementation_strategy: null,
        test_strategy: null,
        test_code_strategy: null,
      },
      cost_tracking: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(testDir);
  });

  test('TC-U-014: commitStepOutput_コミット失敗（Gitリポジトリ未初期化）', async () => {
    // Given: Gitリポジトリが初期化されていない
    // （testDirはGitリポジトリとして初期化されていない）

    const outputDir = path.join(testDir, '.ai-workflow', 'issue-456', '01_requirements', 'output');
    await fs.ensureDir(outputDir);
    await fs.writeFile(path.join(outputDir, 'requirements.md'), '# Requirements');

    // GitManagerを初期化（Gitリポジトリが存在しないためエラーが発生する）
    const metadataManager = new MetadataManager(testMetadataPath);
    const gitManager = new GitManager(testDir, metadataManager);

    // When: コミットを実行
    const commitResult = await gitManager.commitStepOutput(
      'requirements',
      1,
      'execute',
      456,
      testDir,
    );

    // Then: コミットが失敗する
    expect(commitResult.success).toBe(false);
    expect(commitResult.error).toBeTruthy();
    expect(commitResult.error!.includes('Step commit failed')).toBeTruthy();
  });
});

describe('メタデータ更新の統合テスト', () => {
  let metadataManager: MetadataManager;
  let testMetadataPath: string;
  let testDir: string;

  beforeAll(async () => {
    // テスト用ディレクトリを作成
    testDir = path.join(process.cwd(), 'tests', 'temp', 'step-metadata-test');
    await fs.ensureDir(testDir);
    testMetadataPath = path.join(testDir, '.ai-workflow', 'issue-789', 'metadata.json');
    await fs.ensureDir(path.dirname(testMetadataPath));

    // メタデータを作成
    const testMetadata = {
      version: '0.2.0',
      workflow_version: '0.3.0',
      issue_number: '789',
      issue_url: 'https://github.com/test/repo/issues/789',
      issue_title: 'Test Metadata Update',
      workflow_dir: path.dirname(testMetadataPath),
      branch_name: 'ai-workflow/issue-789',
      target_repository: null,
      phases: {
        requirements: {
          status: 'in_progress',
          retry_count: 0,
          started_at: null,
          completed_at: null,
          review_result: null,
          output_files: [],
          current_step: null,
          completed_steps: [],
        },
      },
      design_decisions: {
        implementation_strategy: null,
        test_strategy: null,
        test_code_strategy: null,
      },
      cost_tracking: {
        total_input_tokens: 0,
        total_output_tokens: 0,
        total_cost_usd: 0,
      },
    };

    await fs.writeJSON(testMetadataPath, testMetadata, { spaces: 2 });
    metadataManager = new MetadataManager(testMetadataPath);
  });

  afterAll(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(testDir);
  });

  test('ステップ完了後のメタデータ更新', () => {
    // Given: executeステップが開始される
    metadataManager.updateCurrentStep('requirements', 'execute');

    // When: executeステップが完了
    metadataManager.addCompletedStep('requirements', 'execute');

    // Then: メタデータが正しく更新される
    const completedSteps = metadataManager.getCompletedSteps('requirements');
    const currentStep = metadataManager.getCurrentStep('requirements');

    expect(completedSteps).toEqual(['execute']);
    expect(currentStep).toBeNull();

    // metadata.jsonに保存されることを確認
    const savedMetadata = fs.readJSONSync(testMetadataPath);
    expect(savedMetadata.phases.requirements.completed_steps).toEqual(['execute']);
    expect(savedMetadata.phases.requirements.current_step).toBeNull();
  });

  test('複数ステップの連続実行とメタデータ更新', () => {
    // Given: フェーズが初期状態
    metadataManager.data.phases.requirements.completed_steps = [];
    metadataManager.data.phases.requirements.current_step = null;
    metadataManager.save();

    // When: execute → review → revise を順次実行
    metadataManager.updateCurrentStep('requirements', 'execute');
    metadataManager.addCompletedStep('requirements', 'execute');

    metadataManager.updateCurrentStep('requirements', 'review');
    metadataManager.addCompletedStep('requirements', 'review');

    metadataManager.updateCurrentStep('requirements', 'revise');
    metadataManager.addCompletedStep('requirements', 'revise');

    // Then: 全ステップが completed_steps に記録される
    const completedSteps = metadataManager.getCompletedSteps('requirements');
    expect(completedSteps).toEqual(['execute', 'review', 'revise']);

    // current_step は null にリセットされる
    const currentStep = metadataManager.getCurrentStep('requirements');
    expect(currentStep).toBeNull();
  });
});
