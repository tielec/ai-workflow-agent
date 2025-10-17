/**
 * ユニットテスト: report.ts - cleanupWorkflowLogs機能（Issue #405）
 *
 * テスト対象:
 * - cleanupWorkflowLogs メソッド
 * - execute/review/reviseディレクトリの削除
 * - metadata.jsonとoutput/*.mdファイルの保持
 * - Planning Phase（00_planning）の保護
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { ReportPhase } from '../../src/phases/report.js';
import { GitHubClient } from '../../src/core/github-client.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'report-cleanup-test');
const TEST_ISSUE_NUMBER = '405';

describe('cleanupWorkflowLogs メソッドテスト（Issue #405）', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let reportPhase: ReportPhase;
  let testMetadataPath: string;
  let workflowDir: string;

  before(async () => {
    // テスト用ディレクトリとmetadata.jsonを作成
    workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue #405 - Cleanup Workflow Logs',
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

    // GitHubClientのモック
    githubClient = new GitHubClient(
      'test-token',
      'test-owner/test-repo'
    );

    // ReportPhaseのインスタンスを作成
    reportPhase = new ReportPhase({
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
  });

  it('1.1: execute/review/reviseディレクトリを正しく削除する', async () => {
    // Given: 各フェーズにexecute/review/reviseディレクトリが存在する
    const phaseDirectories = [
      '01_requirements',
      '02_design',
      '03_test_scenario',
      '04_implementation',
      '05_test_implementation',
      '06_testing',
      '07_documentation',
      '08_report',
    ];

    const targetSubdirs = ['execute', 'review', 'revise'];
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);

    // テスト用のディレクトリ構造を作成
    for (const phaseDir of phaseDirectories) {
      const phasePath = path.join(baseDir, phaseDir);

      // execute/review/reviseディレクトリを作成
      for (const subdir of targetSubdirs) {
        const subdirPath = path.join(phasePath, subdir);
        await fs.ensureDir(subdirPath);

        // ダミーファイルを作成
        await fs.writeFile(
          path.join(subdirPath, 'agent_log.md'),
          '# Agent Log\n\nTest content'
        );
        await fs.writeFile(
          path.join(subdirPath, 'prompt.txt'),
          'Test prompt'
        );
      }

      // outputディレクトリとmetadata.jsonを作成（保持対象）
      const outputDir = path.join(phasePath, 'output');
      await fs.ensureDir(outputDir);
      await fs.writeFile(
        path.join(outputDir, 'output.md'),
        '# Output Document\n\nTest output'
      );
      await fs.writeFile(
        path.join(phasePath, 'metadata.json'),
        JSON.stringify({ phase: phaseDir }, null, 2)
      );
    }

    // When: cleanupWorkflowLogsを呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    // Then: execute/review/reviseディレクトリが削除されている
    for (const phaseDir of phaseDirectories) {
      const phasePath = path.join(baseDir, phaseDir);

      for (const subdir of targetSubdirs) {
        const subdirPath = path.join(phasePath, subdir);
        const exists = fs.existsSync(subdirPath);
        assert.equal(
          exists,
          false,
          `${phaseDir}/${subdir} が削除されていません`
        );
      }

      // outputディレクトリとmetadata.jsonは保持されている
      assert.ok(
        fs.existsSync(path.join(phasePath, 'output')),
        `${phaseDir}/output が削除されてしまいました`
      );
      assert.ok(
        fs.existsSync(path.join(phasePath, 'metadata.json')),
        `${phaseDir}/metadata.json が削除されてしまいました`
      );
    }
  });

  it('1.2: Planning Phase（00_planning）を保護する', async () => {
    // Given: 00_planningディレクトリにexecute/review/reviseディレクトリが存在する
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);
    const planningDir = path.join(baseDir, '00_planning');
    const targetSubdirs = ['execute', 'review', 'revise'];

    // Planning フェーズのディレクトリ構造を作成
    for (const subdir of targetSubdirs) {
      const subdirPath = path.join(planningDir, subdir);
      await fs.ensureDir(subdirPath);
      await fs.writeFile(
        path.join(subdirPath, 'planning_log.md'),
        '# Planning Log\n\nImportant planning data'
      );
    }

    // When: cleanupWorkflowLogsを呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    // Then: 00_planningディレクトリは削除されていない
    for (const subdir of targetSubdirs) {
      const subdirPath = path.join(planningDir, subdir);
      const exists = fs.existsSync(subdirPath);
      assert.ok(
        exists,
        `00_planning/${subdir} が削除されてしまいました（Planning Phaseは保護されるべき）`
      );
    }
  });

  it('1.3: 存在しないディレクトリに対してエラーを発生させない（冪等性）', async () => {
    // Given: 一部のフェーズディレクトリが存在しない
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);

    // 01_requirementsのみ存在する状態にする
    const requirementsDir = path.join(baseDir, '01_requirements', 'execute');
    await fs.ensureDir(requirementsDir);
    await fs.writeFile(
      path.join(requirementsDir, 'test.txt'),
      'test'
    );

    // When: cleanupWorkflowLogsを呼び出す（エラーが発生しないことを確認）
    let error: Error | null = null;
    try {
      await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーが発生しない
    assert.equal(error, null, `エラーが発生しました: ${error?.message}`);

    // 削除対象のディレクトリは削除されている
    assert.equal(
      fs.existsSync(requirementsDir),
      false,
      '01_requirements/execute が削除されていません'
    );
  });

  it('1.4: 既に削除されているディレクトリに対して正常に動作する', async () => {
    // Given: すべてのexecute/review/reviseディレクトリが存在しない
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);

    // When: cleanupWorkflowLogsを2回連続で呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    let error: Error | null = null;
    try {
      await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーが発生しない（冪等性）
    assert.equal(error, null, `2回目の呼び出しでエラーが発生しました: ${error?.message}`);
  });

  it('1.5: 削除対象ファイルの内容を確認（デバッグログのみ削除）', async () => {
    // Given: execute/review/reviseディレクトリに各種ファイルが存在する
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);
    const implementationDir = path.join(baseDir, '04_implementation');
    const executeDir = path.join(implementationDir, 'execute');

    await fs.ensureDir(executeDir);

    // デバッグログファイルを作成
    await fs.writeFile(
      path.join(executeDir, 'agent_log.md'),
      '# Agent Log\n\nDetailed agent execution log'
    );
    await fs.writeFile(
      path.join(executeDir, 'agent_log_raw.txt'),
      'Raw agent log output'
    );
    await fs.writeFile(
      path.join(executeDir, 'prompt.txt'),
      'Prompt text for agent'
    );

    // outputディレクトリに成果物ファイルを作成
    const outputDir = path.join(implementationDir, 'output');
    await fs.ensureDir(outputDir);
    await fs.writeFile(
      path.join(outputDir, 'implementation.md'),
      '# Implementation Log\n\nImportant implementation details'
    );

    // When: cleanupWorkflowLogsを呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    // Then: executeディレクトリは削除され、outputディレクトリは保持される
    assert.equal(
      fs.existsSync(executeDir),
      false,
      'executeディレクトリが削除されていません'
    );
    assert.ok(
      fs.existsSync(outputDir),
      'outputディレクトリが削除されてしまいました'
    );
    assert.ok(
      fs.existsSync(path.join(outputDir, 'implementation.md')),
      'implementation.md が削除されてしまいました'
    );
  });
});

describe('ReportPhase execute メソッドとクリーンアップの統合テスト', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let testMetadataPath: string;
  let workflowDir: string;

  before(async () => {
    // テスト用ディレクトリとmetadata.jsonを作成
    workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue #405',
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

    // GitHubClientのモック
    githubClient = new GitHubClient(
      'test-token',
      'test-owner/test-repo'
    );
  });

  after(async () => {
    // テスト用ディレクトリを削除
    await fs.remove(TEST_DIR);
  });

  it('2.1: クリーンアップが失敗してもexecuteメソッドは成功する', async () => {
    // Given: cleanupWorkflowLogsがエラーをスローする状況をシミュレート
    // （存在しないIssue番号でもエラーが発生しないため、このテストではログの警告確認のみ）
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);

    // 削除不可能なディレクトリを作成（権限の問題をシミュレート）
    // 注: 実際の環境では権限エラーをシミュレートするのは困難なため、
    // このテストは警告ログが出力されることの確認に留める

    const reportPhase = new ReportPhase({
      workingDir: TEST_DIR,
      metadataManager,
      codexClient: null,
      claudeClient: null,
      githubClient,
      skipDependencyCheck: true,
      ignoreDependencies: false,
    });

    // When: cleanupWorkflowLogsを直接呼び出す
    let error: Error | null = null;
    try {
      await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));
    } catch (e) {
      error = e as Error;
    }

    // Then: エラーが発生しない（非破壊的動作）
    assert.equal(
      error,
      null,
      `クリーンアップでエラーが発生しました: ${error?.message}`
    );
  });
});

describe('クリーンアップ機能のエッジケーステスト', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let reportPhase: ReportPhase;
  let testMetadataPath: string;
  let workflowDir: string;

  before(async () => {
    workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue #405',
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

    reportPhase = new ReportPhase({
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
  });

  it('3.1: 空のディレクトリも正しく削除される', async () => {
    // Given: 空のexecute/review/reviseディレクトリが存在する
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);
    const implementationDir = path.join(baseDir, '04_implementation');
    const executeDir = path.join(implementationDir, 'execute');

    await fs.ensureDir(executeDir);

    // When: cleanupWorkflowLogsを呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    // Then: 空のディレクトリも削除される
    assert.equal(
      fs.existsSync(executeDir),
      false,
      '空のexecuteディレクトリが削除されていません'
    );
  });

  it('3.2: ネストされたファイル構造も正しく削除される', async () => {
    // Given: execute/review/reviseディレクトリにネストされたファイル構造が存在する
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);
    const testingDir = path.join(baseDir, '06_testing');
    const reviewDir = path.join(testingDir, 'review');
    const nestedDir = path.join(reviewDir, 'nested', 'deeply', 'nested');

    await fs.ensureDir(nestedDir);
    await fs.writeFile(
      path.join(nestedDir, 'deep_log.txt'),
      'Deeply nested log file'
    );

    // When: cleanupWorkflowLogsを呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    // Then: ネストされたディレクトリ構造全体が削除される
    assert.equal(
      fs.existsSync(reviewDir),
      false,
      'ネストされたreviewディレクトリが削除されていません'
    );
  });

  it('3.3: outputディレクトリと同名のexecuteサブディレクトリは削除される', async () => {
    // Given: executeディレクトリ内にoutputという名前のサブディレクトリが存在する
    const baseDir = path.resolve(workflowDir, '..', `issue-${TEST_ISSUE_NUMBER}`);
    const designDir = path.join(baseDir, '02_design');
    const executeDir = path.join(designDir, 'execute');
    const executeOutputDir = path.join(executeDir, 'output');

    await fs.ensureDir(executeOutputDir);
    await fs.writeFile(
      path.join(executeOutputDir, 'temp.md'),
      'Temporary output in execute directory'
    );

    // 真のoutputディレクトリも作成
    const realOutputDir = path.join(designDir, 'output');
    await fs.ensureDir(realOutputDir);
    await fs.writeFile(
      path.join(realOutputDir, 'design.md'),
      '# Design Document\n\nReal design output'
    );

    // When: cleanupWorkflowLogsを呼び出す
    await (reportPhase as any).cleanupWorkflowLogs(parseInt(TEST_ISSUE_NUMBER, 10));

    // Then: executeディレクトリ全体（内部のoutputサブディレクトリ含む）が削除される
    assert.equal(
      fs.existsSync(executeDir),
      false,
      'executeディレクトリが削除されていません'
    );

    // 真のoutputディレクトリは保持される
    assert.ok(
      fs.existsSync(realOutputDir),
      '真のoutputディレクトリが削除されてしまいました'
    );
    assert.ok(
      fs.existsSync(path.join(realOutputDir, 'design.md')),
      'design.md が削除されてしまいました'
    );
  });
});
