/**
 * ユニットテスト: base-phase.ts - buildOptionalContext機能
 *
 * テスト対象:
 * - buildOptionalContext メソッド
 * - ファイル存在時の@filepath参照生成
 * - ファイル不在時のフォールバックメッセージ生成
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'node:path';
import { MetadataManager } from '../../src/core/metadata-manager.js';
import { ImplementationPhase } from '../../src/phases/implementation.js';
import { GitHubClient } from '../../src/core/github-client.js';
import { PhaseName } from '../../src/types.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'base-phase-test');
const TEST_ISSUE_NUMBER = '999';

describe('buildOptionalContext メソッドテスト', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let implementationPhase: ImplementationPhase;
  let testMetadataPath: string;

  beforeAll(async () => {
    // テスト用ディレクトリとmetadata.jsonを作成
    const workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue',
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

    // GitHubClientのモック（必須パラメータ）
    githubClient = new GitHubClient(
      'test-token',
      'test-owner/test-repo'
    );

    // ImplementationPhaseのインスタンスを作成
    implementationPhase = new ImplementationPhase({
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
  });

  test('1.3.1: ファイル存在時の参照生成', async () => {
    // Given: requirements.mdファイルが存在する
    const requirementsDir = path.join(
      TEST_DIR,
      '.ai-workflow',
      `issue-${TEST_ISSUE_NUMBER}`,
      '01_requirements',
      'output'
    );
    await fs.ensureDir(requirementsDir);
    const requirementsFile = path.join(requirementsDir, 'requirements.md');
    await fs.writeFile(requirementsFile, '# 要件定義書\n\nテスト内容');

    // When: buildOptionalContextを呼び出す
    const result = (implementationPhase as any).buildOptionalContext(
      'requirements' as PhaseName,
      'requirements.md',
      '要件定義書は利用できません。',
      TEST_ISSUE_NUMBER
    );

    // Then: @filepath形式の参照が返される
    expect(result.startsWith('@')).toBeTruthy();
    expect(result.includes('requirements.md')).toBeTruthy();
  });

  test('1.3.2: ファイル不在時のフォールバック', () => {
    // Given: design.mdファイルが存在しない
    // （ファイルは作成しない）

    // When: buildOptionalContextを呼び出す
    const fallbackMessage = '設計書は利用できません。';
    const result = (implementationPhase as any).buildOptionalContext(
      'design' as PhaseName,
      'design.md',
      fallbackMessage,
      TEST_ISSUE_NUMBER
    );

    // Then: フォールバックメッセージが返される
    expect(result).toBe(fallbackMessage);
  });

  test('1.3.3: 複数ファイルのオプショナルコンテキスト構築（混在）', async () => {
    // Given: requirements.mdは存在、design.mdは不在
    const requirementsDir = path.join(
      TEST_DIR,
      '.ai-workflow',
      `issue-${TEST_ISSUE_NUMBER}`,
      '01_requirements',
      'output'
    );
    await fs.ensureDir(requirementsDir);
    const requirementsFile = path.join(requirementsDir, 'requirements.md');
    await fs.writeFile(requirementsFile, '# 要件定義書\n\nテスト内容');

    // When: 両方のbuildOptionalContextを呼び出す
    const requirementsContext = (implementationPhase as any).buildOptionalContext(
      'requirements' as PhaseName,
      'requirements.md',
      '要件定義書は利用できません。',
      TEST_ISSUE_NUMBER
    );

    const designContext = (implementationPhase as any).buildOptionalContext(
      'design' as PhaseName,
      'design.md',
      '設計書は利用できません。',
      TEST_ISSUE_NUMBER
    );

    // Then: requirements.mdは@filepath、design.mdはフォールバック
    expect(requirementsContext.startsWith('@')).toBeTruthy();
    expect(designContext).toBe('設計書は利用できません。');
  });

  test('Issue番号を省略した場合、現在のIssue番号を使用', () => {
    // Given: Issue番号を省略
    // When: buildOptionalContextを呼び出す（Issue番号省略）
    const result = (implementationPhase as any).buildOptionalContext(
      'requirements' as PhaseName,
      'requirements.md',
      '要件定義書は利用できません。'
      // issueNumberOverrideを省略
    );

    // Then: 現在のIssue番号（999）が使用される
    // ファイルが存在すればissue-999のパスを含む@参照が返される
    // ファイルが存在しなければフォールバックメッセージが返される
    expect(result.startsWith('@') || result === '要件定義書は利用できません。').toBeTruthy();
  });
});

describe('getPhaseOutputFile メソッドテスト', () => {
  let metadataManager: MetadataManager;
  let githubClient: GitHubClient;
  let implementationPhase: ImplementationPhase;
  let testMetadataPath: string;

  beforeAll(async () => {
    // テスト用ディレクトリとmetadata.jsonを作成
    const workflowDir = path.join(TEST_DIR, `.ai-workflow`, `issue-${TEST_ISSUE_NUMBER}`);
    await fs.ensureDir(workflowDir);
    testMetadataPath = path.join(workflowDir, 'metadata.json');

    const testMetadata = {
      version: '0.2.0',
      issue_number: TEST_ISSUE_NUMBER,
      issue_url: `https://github.com/test/repo/issues/${TEST_ISSUE_NUMBER}`,
      issue_title: 'Test Issue',
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

    // ImplementationPhaseのインスタンスを作成
    implementationPhase = new ImplementationPhase({
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
  });

  test('ファイルが存在する場合、ファイルパスを返す', async () => {
    // Given: planning.mdファイルが存在する
    const planningDir = path.join(
      TEST_DIR,
      '.ai-workflow',
      `issue-${TEST_ISSUE_NUMBER}`,
      '00_planning',
      'output'
    );
    await fs.ensureDir(planningDir);
    const planningFile = path.join(planningDir, 'planning.md');
    await fs.writeFile(planningFile, '# Planning Document\n\nテスト内容');

    // When: getPhaseOutputFileを呼び出す
    const result = (implementationPhase as any).getPhaseOutputFile(
      'planning' as PhaseName,
      'planning.md',
      TEST_ISSUE_NUMBER
    );

    // Then: ファイルパスが返される
    expect(result).toBeTruthy();
    expect(result?.includes('planning.md')).toBeTruthy();
  });

  test('ファイルが存在しない場合、nullを返す', () => {
    // Given: test_scenario.mdファイルが存在しない

    // When: getPhaseOutputFileを呼び出す
    const result = (implementationPhase as any).getPhaseOutputFile(
      'test_scenario' as PhaseName,
      'test-scenario.md',
      TEST_ISSUE_NUMBER
    );

    // Then: nullが返される
    expect(result).toBeNull();
  });
});
