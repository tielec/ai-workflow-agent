import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConflictMetadataManager } from '../../../../src/core/conflict/metadata-manager.js';

describe('ConflictMetadataManager', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'conflict-meta-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('initialize_メタデータファイルが正しく作成される', async () => {
    // Given: メタデータマネージャ
    const manager = new ConflictMetadataManager(repoRoot, 42);

    // When: initialize 実行
    const metadata = await manager.initialize({
      prNumber: 42,
      owner: 'tielec',
      repo: 'ai-workflow-agent',
      mergeable: true,
      mergeableState: 'clean',
      conflictFiles: [],
      baseBranch: 'main',
      headBranch: 'feature',
    });

    // Then: メタデータが正しく設定される
    expect(metadata.version).toBe('1.0.0');
    expect(metadata.prNumber).toBe(42);
    expect(metadata.repository).toEqual({ owner: 'tielec', repo: 'ai-workflow-agent' });
    expect(metadata.status).toBe('initialized');
    expect(metadata.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(metadata.updatedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);

    const metadataPath = manager.getMetadataPath();
    expect(metadataPath).toContain(path.join('.ai-workflow', 'conflict-42', 'metadata.json'));

    const stored = JSON.parse(await fsp.readFile(metadataPath, 'utf-8')) as typeof metadata;
    expect(stored.prNumber).toBe(42);
  });

  it('load_既存メタデータを正しく読み込む', async () => {
    // Given: 事前に初期化
    const manager = new ConflictMetadataManager(repoRoot, 42);
    await manager.initialize({
      prNumber: 42,
      owner: 'owner',
      repo: 'repo',
      mergeable: null,
      conflictFiles: [],
    });

    // When: load 実行
    const loaded = await manager.load();

    // Then: 期待する内容
    expect(loaded.prNumber).toBe(42);
    expect(loaded.repository.owner).toBe('owner');
  });

  it('updateStatus_ステータスが正しく更新される', async () => {
    // Given: 事前に初期化
    const manager = new ConflictMetadataManager(repoRoot, 42);
    await manager.initialize({
      prNumber: 42,
      owner: 'owner',
      repo: 'repo',
      mergeable: null,
      conflictFiles: [],
    });

    // When: ステータス更新
    await manager.updateStatus('analyzed', { conflictFiles: ['src/a.ts'] });

    // Then: 更新反映
    const loaded = await manager.load();
    expect(loaded.status).toBe('analyzed');
    expect(loaded.conflictFiles).toEqual(['src/a.ts']);
  });

  it('setResolutionPlan_パスが正しく保存される', async () => {
    // Given: 事前に初期化
    const manager = new ConflictMetadataManager(repoRoot, 42);
    await manager.initialize({
      prNumber: 42,
      owner: 'owner',
      repo: 'repo',
      mergeable: null,
      conflictFiles: [],
    });

    // When: 解消計画パスを設定
    await manager.setResolutionPlan('.ai-workflow/conflict-42/resolution-plan.md');

    // Then: パスが保存される
    const loaded = await manager.load();
    expect(loaded.resolutionPlanPath).toBe('.ai-workflow/conflict-42/resolution-plan.md');
  });

  it('setResolutionResult_パスが正しく保存される', async () => {
    // Given: 事前に初期化
    const manager = new ConflictMetadataManager(repoRoot, 42);
    await manager.initialize({
      prNumber: 42,
      owner: 'owner',
      repo: 'repo',
      mergeable: null,
      conflictFiles: [],
    });

    // When: 解消結果パスを設定
    await manager.setResolutionResult('.ai-workflow/conflict-42/resolution-result.md');

    // Then: パスが保存される
    const loaded = await manager.load();
    expect(loaded.resolutionResultPath).toBe('.ai-workflow/conflict-42/resolution-result.md');
  });

  it('cleanup_メタデータディレクトリが削除される', async () => {
    // Given: 事前に初期化
    const manager = new ConflictMetadataManager(repoRoot, 42);
    await manager.initialize({
      prNumber: 42,
      owner: 'owner',
      repo: 'repo',
      mergeable: null,
      conflictFiles: [],
    });

    // When: cleanup 実行
    await manager.cleanup();

    // Then: ディレクトリが削除される
    await expect(fsp.access(path.dirname(manager.getMetadataPath()))).rejects.toThrow();
  });
});
