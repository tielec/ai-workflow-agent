import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { handleReviewCommand } from '../../../src/commands/review.js';
import { WorkflowState } from '../../../src/core/workflow-state.js';
import { logger } from '../../../src/utils/logger.js';

describe('handleReviewCommand', () => {
  const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
  const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  const exitSpy = jest
    .spyOn(process, 'exit')
    .mockImplementation(((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as any);

  const tempRepo = path.join(os.tmpdir(), 'review-command');
  const metadataDir = path.join(tempRepo, '.ai-workflow', 'issue-1');
  const metadataPath = path.join(metadataDir, 'metadata.json');
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    await fs.remove(tempRepo);
    await fs.ensureDir(metadataDir);
    process.chdir(tempRepo);
    errorSpy.mockClear();
    infoSpy.mockClear();
    exitSpy.mockClear();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(tempRepo);
  });

  afterAll(() => {
    errorSpy.mockRestore();
    infoSpy.mockRestore();
    exitSpy.mockRestore();
  });

  test('メタデータが存在しない場合はエラーを出して終了する', async () => {
    await expect(handleReviewCommand({ issue: '1', phase: 'planning' })).rejects.toThrow('exit:1');
    expect(errorSpy).toHaveBeenCalledWith('Error: Workflow not found.');
  });

  test('未知のフェーズ指定ならエラーを出して終了する', async () => {
    const state = WorkflowState.createNew(metadataPath, '1', 'http://example.com', 'Sample');
    state.data.phases = {
      ...state.data.phases,
      planning: { status: 'completed', started_at: '', completed_at: '', retry_count: 0 },
    };
    state.save();

    await expect(handleReviewCommand({ issue: '1', phase: 'unknown' as any })).rejects.toThrow(
      'exit:1',
    );
    expect(errorSpy).toHaveBeenCalledWith('Error: Unknown phase "unknown".');
  });

  test('既知フェーズならステータスをログ出力する', async () => {
    const state = WorkflowState.createNew(metadataPath, '1', 'http://example.com', 'Sample');
    state.updatePhaseStatus('planning', 'completed');
    state.save();

    await handleReviewCommand({ issue: '1', phase: 'planning' });
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Phase planning status'));
  });
});
