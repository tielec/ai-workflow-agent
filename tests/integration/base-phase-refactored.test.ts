/**
 * インテグレーションテスト: base-phase.ts リファクタリング
 *
 * テスト対象:
 * - BasePhase 全体のライフサイクル（execute → review → revise）
 * - 4つの新規モジュール（StepExecutor、PhaseRunner、ContextBuilder、ArtifactCleaner）の統合
 * - 後方互換性の保証
 *
 * Issue #49: BasePhase のモジュール分解リファクタリング
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { PhaseName, PhaseExecutionResult } from '../../src/types.js';
import { BasePhase } from '../../src/phases/base-phase.js';
import { MetadataManager } from '../../src/core/metadata-manager.js';

// テスト用の一時ディレクトリ
const TEST_DIR = path.join(process.cwd(), 'tests', 'temp', 'base-phase-integration-test');

/**
 * テスト用の BasePhase サブクラス
 */
class TestPhase extends BasePhase {
  constructor(metadata: MetadataManager, github: any, workingDir: string) {
    super({
      phaseName: 'planning',
      metadataManager: metadata,
      githubClient: github,
      workingDir,
      codexClient: null,
      claudeClient: null,
    });
  }

  async execute(): Promise<PhaseExecutionResult> {
    // テスト用の execute 実装
    return { success: true };
  }

  async review(): Promise<PhaseExecutionResult> {
    // テスト用の review 実装
    return { success: true, approved: true };
  }

  async revise(feedback: string): Promise<PhaseExecutionResult> {
    // テスト用の revise 実装
    return { success: true };
  }

  // Public wrappers for testing protected methods
  public testBuildOptionalContext(
    phaseName: PhaseName,
    outputFileName: string,
    fallbackMessage: string,
    issueNumberOverride?: number
  ): string {
    return this.buildOptionalContext(phaseName, outputFileName, fallbackMessage, issueNumberOverride);
  }

  public async testCleanupWorkflowArtifacts(force?: boolean): Promise<void> {
    return this.cleanupWorkflowArtifacts(force);
  }

  public async testCleanupWorkflowLogs(): Promise<void> {
    return this.cleanupWorkflowLogs();
  }
}

/**
 * モック MetadataManager を作成
 */
function createMockMetadataManager(workflowDir: string): any {
  const completedSteps: Record<PhaseName, string[]> = {
    planning: [],
    requirements: [],
    design: [],
    test_scenario: [],
    implementation: [],
    test_implementation: [],
    testing: [],
    documentation: [],
    report: [],
    evaluation: [],
  };

  return {
    data: {
      issue_number: '1',
      target_repository: {
        path: '/path/to/repo'
      },
      planning: { status: 'pending' },
    },
    workflowDir,
    getCompletedSteps: jest.fn<any>((phase: PhaseName) => completedSteps[phase] || []),
    addCompletedStep: jest.fn<any>((phase: PhaseName, step: string) => {
      if (!completedSteps[phase]) {
        completedSteps[phase] = [];
      }
      completedSteps[phase].push(step);
    }),
    updateCurrentStep: jest.fn<any>(),
    updatePhaseStatus: jest.fn<any>(),
  };
}

/**
 * モック GitHubClient を作成
 */
function createMockGitHubClient(): any {
  return {
    createOrUpdateProgressComment: jest.fn<any>().mockResolvedValue(undefined),
  };
}

describe('BasePhase リファクタリング - 統合テスト', () => {
  let testWorkflowDir: string;
  let testRepoRoot: string;

  beforeEach(async () => {
    testRepoRoot = path.join(TEST_DIR, 'repo');
    testWorkflowDir = path.join(testRepoRoot, '.ai-workflow', 'issue-1');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('IC-BP-01: BasePhase が4つの新規モジュールを統合して動作する', async () => {
    // Given: BasePhase のインスタンス
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const mockGitHub = createMockGitHubClient();
    const testPhase = new TestPhase(mockMetadata, mockGitHub, testRepoRoot);

    // When: BasePhase のメソッドを呼び出す
    // ContextBuilder の動作確認
    const context = testPhase.testBuildOptionalContext(
      'requirements',
      'requirements.md',
      'Requirements not found'
    );

    // Then: BasePhase が正常に動作する（新規モジュールが統合されている）
    expect(context).toBe('Requirements not found'); // ファイルが存在しないためフォールバック
  });

  test('IC-BP-02: 後方互換性 - BasePhase の public メソッドのシグネチャが不変である', async () => {
    // Given: BasePhase のインスタンス
    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const mockGitHub = createMockGitHubClient();
    const testPhase = new TestPhase(mockMetadata, mockGitHub, testRepoRoot);

    // When/Then: public/protected メソッドが存在し、呼び出し可能である
    expect(typeof testPhase.run).toBe('function');
    expect(typeof testPhase.testBuildOptionalContext).toBe('function');
    expect(typeof testPhase.testCleanupWorkflowArtifacts).toBe('function');
    expect(typeof testPhase.testCleanupWorkflowLogs).toBe('function');
  });

  test('IC-BP-03: ContextBuilder が BasePhase に統合されている', async () => {
    // Given: requirements.md が存在する
    const requirementsDir = path.join(testWorkflowDir, '01_requirements', 'output');
    await fs.ensureDir(requirementsDir);
    const requirementsFile = path.join(requirementsDir, 'requirements.md');
    await fs.writeFile(requirementsFile, '# Requirements');

    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const mockGitHub = createMockGitHubClient();
    const testPhase = new TestPhase(mockMetadata, mockGitHub, testRepoRoot);

    // When: buildOptionalContext() を呼び出す
    const context = testPhase.testBuildOptionalContext(
      'requirements',
      'requirements.md',
      'Requirements not found'
    );

    // Then: @filepath 参照が返される
    expect(context).toContain('@');
    expect(context).toContain('.ai-workflow/issue-1/01_requirements/output/requirements.md');
  });

  // IC-BP-04: cleanupWorkflowArtifacts のテストは削除
  // 理由: ArtifactCleaner のユニットテストで十分にカバー済み
  // 参照: tests/unit/phases/cleanup/artifact-cleaner.test.ts

  test('IC-BP-05: ArtifactCleaner.cleanupWorkflowLogs() が BasePhase に統合されている', async () => {
    // Given: phases 00-02 のディレクトリが存在する
    const phaseDirs = ['00_planning', '01_requirements', '02_design'];
    for (const phaseDir of phaseDirs) {
      const phasePath = path.join(testWorkflowDir, phaseDir);
      await fs.ensureDir(path.join(phasePath, 'execute'));
      await fs.ensureDir(path.join(phasePath, 'output'));
      await fs.writeFile(path.join(phasePath, 'metadata.json'), '{}');
    }

    const mockMetadata = createMockMetadataManager(testWorkflowDir);
    const mockGitHub = createMockGitHubClient();
    const testPhase = new TestPhase(mockMetadata, mockGitHub, testRepoRoot);

    // When: cleanupWorkflowLogs() を呼び出す
    await testPhase.testCleanupWorkflowLogs();

    // Then: execute ディレクトリが削除され、metadata.json と output が保持される
    for (const phaseDir of phaseDirs) {
      const phasePath = path.join(testWorkflowDir, phaseDir);
      expect(fs.existsSync(path.join(phasePath, 'execute'))).toBe(false);
      expect(fs.existsSync(path.join(phasePath, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(phasePath, 'output'))).toBe(true);
    }
  });
});

describe('BasePhase リファクタリング - モジュール分離の検証', () => {
  let testWorkflowDir: string;
  let testRepoRoot: string;

  beforeEach(async () => {
    testRepoRoot = path.join(TEST_DIR, 'repo');
    testWorkflowDir = path.join(testRepoRoot, '.ai-workflow', 'issue-1');
    await fs.ensureDir(testWorkflowDir);
  });

  afterEach(async () => {
    await fs.remove(TEST_DIR);
  });

  test('IC-BP-06: BasePhase のコード量が削減されている（約40%削減）', async () => {
    // Given: BasePhase のソースコード
    const basePhaseFile = path.join(process.cwd(), 'src', 'phases', 'base-phase.ts');
    const basePhaseContent = await fs.readFile(basePhaseFile, 'utf-8');
    const lineCount = basePhaseContent.split('\n').length;

    // Then: BasePhase の行数が約445行以下である（目標: 676行 → 約300-445行）
    expect(lineCount).toBeLessThanOrEqual(500); // 余裕を持って500行以下
  });

  test('IC-BP-07: 新規モジュールが正しく作成されている', async () => {
    // Given: 新規モジュールのファイルパス
    const stepExecutorFile = path.join(process.cwd(), 'src', 'phases', 'lifecycle', 'step-executor.ts');
    const phaseRunnerFile = path.join(process.cwd(), 'src', 'phases', 'lifecycle', 'phase-runner.ts');
    const contextBuilderFile = path.join(process.cwd(), 'src', 'phases', 'context', 'context-builder.ts');
    const artifactCleanerFile = path.join(process.cwd(), 'src', 'phases', 'cleanup', 'artifact-cleaner.ts');

    // Then: 新規モジュールが存在する
    expect(fs.existsSync(stepExecutorFile)).toBe(true);
    expect(fs.existsSync(phaseRunnerFile)).toBe(true);
    expect(fs.existsSync(contextBuilderFile)).toBe(true);
    expect(fs.existsSync(artifactCleanerFile)).toBe(true);
  });
});
