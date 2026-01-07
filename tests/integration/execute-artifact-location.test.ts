import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { StepExecutor } from '../../src/phases/lifecycle/step-executor.js';
import type { PhaseExecutionResult } from '../../src/types.js';

type MetadataLike = {
  data: {
    issue_number: string;
    target_repository: { path: string };
  };
  getCompletedSteps: jest.Mock;
  addCompletedStep: jest.Mock;
  updateCurrentStep: jest.Mock;
};

const baseEnv = { ...process.env };
let tempRoot: string;
let repoPath: string;
let jenkinsPath: string;
let metadata: MetadataLike;

function createMetadata(repo: string): MetadataLike {
  return {
    data: {
      issue_number: '236',
      target_repository: { path: repo },
    },
    getCompletedSteps: jest.fn().mockReturnValue([]),
    addCompletedStep: jest.fn(),
    updateCurrentStep: jest.fn(),
  };
}

function createStepExecutor(
  executeFn: () => Promise<PhaseExecutionResult>,
  repo: string
): StepExecutor {
  metadata = createMetadata(repo);
  const reviewCycleManager = { performReviseStepWithRetry: jest.fn() };
  const reviewFn = jest.fn().mockResolvedValue({ success: true });
  const shouldRunReviewFn = jest.fn().mockResolvedValue(true);

  return new StepExecutor(
    'requirements',
    metadata as unknown as any,
    reviewCycleManager as unknown as any,
    executeFn,
    reviewFn,
    shouldRunReviewFn
  );
}

beforeEach(async () => {
  process.env = { ...baseEnv };
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'execute-artifact-'));
  repoPath = path.join(tempRoot, 'ai-workflow-repos', 'sd-platform-development');
  jenkinsPath = path.join(tempRoot, 'jenkins', 'workspace');
  await fs.ensureDir(repoPath);
  await fs.ensureDir(jenkinsPath);
  process.env.REPOS_ROOT = path.join(tempRoot, 'ai-workflow-repos');
});

afterEach(async () => {
  process.env = baseEnv;
  jest.restoreAllMocks();
  if (tempRoot && (await fs.pathExists(tempRoot))) {
    await fs.remove(tempRoot);
  }
});

describe('Execute → artifact validation flow (Issue #603)', () => {
  test('IT-603-001: execute writes artifact to repository path (not Jenkins workspace)', async () => {
    const expectedOutput = path.join(
      repoPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const fallbackOutput = path.join(
      jenkinsPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue(jenkinsPath);

    const executor = createStepExecutor(async () => {
      await fs.ensureDir(path.dirname(expectedOutput));
      await fs.writeFile(expectedOutput, '# requirements');
      return { success: true, output: expectedOutput };
    }, repoPath);

    const result = await executor.executeStep(null);

    expect(result.success).toBe(true);
    expect(await fs.pathExists(expectedOutput)).toBe(true);
    expect(await fs.pathExists(fallbackOutput)).toBe(false);
    expect(cwdSpy).toHaveBeenCalled();
  });

  test('IT-603-003: misplaced artifact triggers validation error when relocation disabled', async () => {
    process.env.ARTIFACT_RELOCATE_ON_MISMATCH = 'false';
    const expectedOutput = path.join(
      repoPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const fallbackOutput = path.join(
      jenkinsPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    jest.spyOn(process, 'cwd').mockReturnValue(jenkinsPath);
    await fs.ensureDir(path.dirname(fallbackOutput));
    await fs.writeFile(fallbackOutput, 'written to workspace');

    const executor = createStepExecutor(async () => {
      return { success: true, output: expectedOutput };
    }, repoPath);

    const result = await executor.executeStep(null);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Artifact found at wrong location/);
    expect(await fs.pathExists(fallbackOutput)).toBe(true);
    expect(await fs.pathExists(expectedOutput)).toBe(false);
  });

  test('IT-603-004: misplaced artifact is relocated when enabled', async () => {
    const expectedOutput = path.join(
      repoPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const fallbackOutput = path.join(
      jenkinsPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    jest.spyOn(process, 'cwd').mockReturnValue(jenkinsPath);
    await fs.ensureDir(path.dirname(fallbackOutput));
    await fs.writeFile(fallbackOutput, 'workspace artifact');

    const executor = createStepExecutor(async () => {
      return { success: true, output: expectedOutput };
    }, repoPath);

    const result = await executor.executeStep(null);

    expect(result.success).toBe(true);
    expect(await fs.pathExists(expectedOutput)).toBe(true);
    expect(await fs.pathExists(fallbackOutput)).toBe(false);
  });
});
