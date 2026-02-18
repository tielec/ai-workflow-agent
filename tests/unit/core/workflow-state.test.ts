import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
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
