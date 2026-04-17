import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { WorkflowState } from '../../../src/core/workflow-state.js';
import { logger } from '../../../src/utils/logger.js';
import type { WorkflowMetadata } from '../../../src/types.js';

describe('WorkflowState.incrementRetryCount', () => {
  let templateMetadata: WorkflowMetadata;
  let workflowState: WorkflowState;

  beforeAll(() => {
    templateMetadata = fs.readJsonSync(
      path.resolve('metadata.json.template')
    ) as WorkflowMetadata;
  });

  beforeEach(() => {
    // Given: テンプレートをコピーしてテスト用の状態を作成
    const metadataCopy = JSON.parse(JSON.stringify(templateMetadata)) as WorkflowMetadata;
    metadataCopy.issue_number = '26';
    metadataCopy.issue_url = 'https://example.com/issues/26';
    metadataCopy.issue_title = 'Test Issue 26';
    metadataCopy.phases.requirements.retry_count = 0;

    workflowState = new (WorkflowState as any)(
      '/test/.ai-workflow/issue-26/metadata.json',
      metadataCopy,
    );
  });

  it('retry_countが上限未満の場合、値をインクリメントして返す', () => {
    // Given: retry_count=0
    workflowState.data.phases.requirements.retry_count = 0;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    // When: incrementRetryCount を呼び出す
    const result = workflowState.incrementRetryCount('requirements');

    // Then: retry_count が更新される
    expect(result).toBe(1);
    expect(workflowState.data.phases.requirements.retry_count).toBe(1);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('retry_countが上限以上の場合、警告を出して現在値を返す', () => {
    // Given: retry_count=3
    workflowState.data.phases.requirements.retry_count = 3;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    // When: incrementRetryCount を呼び出す
    const result = workflowState.incrementRetryCount('requirements');

    // Then: retry_count は増えず、警告が出力される
    expect(result).toBe(3);
    expect(workflowState.data.phases.requirements.retry_count).toBe(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Retry count already at maximum')
    );

    warnSpy.mockRestore();
  });
});

describe('WorkflowState.migrate', () => {
  let templateMetadata: WorkflowMetadata;
  let workflowState: WorkflowState;
  let existsSyncSpy: jest.SpiedFunction<typeof fs.existsSync>;
  let readFileSyncSpy: jest.SpiedFunction<typeof fs.readFileSync>;
  let copyFileSyncSpy: jest.SpiedFunction<typeof fs.copyFileSync>;
  let writeFileSyncSpy: jest.SpiedFunction<typeof fs.writeFileSync>;

  beforeAll(() => {
    templateMetadata = fs.readJsonSync(
      path.resolve('metadata.json.template')
    ) as WorkflowMetadata;
  });

  beforeEach(() => {
    const metadataCopy = JSON.parse(JSON.stringify(templateMetadata)) as WorkflowMetadata;
    metadataCopy.issue_number = '854';
    metadataCopy.issue_url = 'https://example.com/issues/854';
    metadataCopy.issue_title = 'Cost tracking migration test';
    delete metadataCopy.cost_tracking.model_usage;

    workflowState = new (WorkflowState as any)(
      '/test/.ai-workflow/issue-854/metadata.json',
      metadataCopy,
    );

    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify(templateMetadata)
    );
    copyFileSyncSpy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => undefined);
    writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('model_usageが欠落した既存metadataを移行して空オブジェクトを追加する', () => {
    // Given: 旧フォーマットでmodel_usageを持たないcost_tracking
    expect(workflowState.data.cost_tracking.model_usage).toBeUndefined();

    // When: migrateを実行する
    const migrated = workflowState.migrate();

    // Then: model_usageが追加されてバックアップと保存が行われる
    expect(migrated).toBe(true);
    expect(workflowState.data.cost_tracking.model_usage).toEqual({});
    expect(copyFileSyncSpy).toHaveBeenCalled();
    expect(writeFileSyncSpy).toHaveBeenCalled();
    expect(existsSyncSpy).toHaveBeenCalled();
    expect(readFileSyncSpy).toHaveBeenCalled();
  });
});
