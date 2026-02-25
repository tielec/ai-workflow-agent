/**
 * Unit tests for CommitManager
 * Tests commit operations, message generation, and SecretMasker integration
 */

// @ts-nocheck

import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { CommitManager } from '../../../src/core/git/commit-manager';
import { MetadataManager } from '../../../src/core/metadata-manager';
import { SecretMasker } from '../../../src/core/secret-masker';
import { logger } from '../../../src/utils/logger.js';
import { SimpleGit } from 'simple-git';
import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';

describe('CommitManager - Message Generation', () => {
  let commitManager: CommitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockSecretMasker: jest.Mocked<SecretMasker>;

  beforeEach(() => {
    // Mock SimpleGit
    mockGit = {
      status: jest.fn(),
      add: jest.fn(),
      raw: jest.fn(),
      commit: jest.fn(),
      addConfig: jest.fn(),
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
    } as any;

    // Mock MetadataManager
    mockMetadata = {
      data: {
        issue_number: '25',
        issue_title: '[REFACTOR] Git Manager の操作別分割',
        branch_name: 'feature/issue-25',
      },
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        issue_title: '[REFACTOR] Git Manager の操作別分割',
        branch_name: 'feature/issue-25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;

    // Mock SecretMasker
    mockSecretMasker = {
      maskSecretsInWorkflowDir: jest.fn().mockResolvedValue({
        filesProcessed: 1,
        secretsMasked: 2,
        errors: [],
      }),
    } as any;

    commitManager = new CommitManager(
      mockGit,
      mockMetadata,
      mockSecretMasker,
      '/test/repo'
    );
  });

  describe('createCommitMessage', () => {
    test('createCommitMessage_正常系_Phase完了時のメッセージ生成', () => {
      // Given: Phase番号、Status、Review result、Issue番号
      const phaseName = 'requirements';
      const status = 'completed';
      const reviewResult = 'PASS';

      // When: createCommitMessage を呼び出す
      const message = commitManager.createCommitMessage(phaseName, status, reviewResult);

      // Then: 正しいフォーマットのメッセージが生成される
      expect(message).toContain('Phase 2 (requirements)');
      expect(message).toContain('completed');
      expect(message).toContain('Review: PASS');
      expect(message).toContain('Issue: #25');
    });

    test('createCommitMessage_境界値_Phase番号にアンダースコアなし', () => {
      // Given: Phase番号がアンダースコアなし
      const phaseName = 'requirements';
      const status = 'completed';
      const reviewResult = 'PASS';

      // When: createCommitMessage を呼び出す
      const message = commitManager.createCommitMessage(phaseName, status, reviewResult);

      // Then: アンダースコアなしでも正しく動作する
      expect(message).toContain('Phase 2 (requirements)');
      expect(message).toContain('Issue: #25');
    });
  });

  // Note: buildStepCommitMessage, createInitCommitMessage, createCleanupCommitMessage
  // have been moved to CommitMessageBuilder module.
  // See tests/unit/git/commit-message-builder.test.ts for these tests
});

describe('CommitManager - Commit Operations', () => {
  let commitManager: CommitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockSecretMasker: jest.Mocked<SecretMasker>;
  const testRepoDir = path.join(os.tmpdir(), 'ai-workflow-commit-manager-test-' + Date.now());

  beforeEach(() => {
    // Create real test files on disk (Option 1 from plan - avoid ESM mocking issues)
    fs.ensureDirSync(path.join(testRepoDir, '.ai-workflow/issue-25/01_requirements/output'));
    fs.ensureDirSync(path.join(testRepoDir, '.ai-workflow/issue-25/04_implementation'));
    fs.ensureDirSync(path.join(testRepoDir, 'src'));

    fs.writeFileSync(
      path.join(testRepoDir, '.ai-workflow/issue-25/01_requirements/output/requirements.md'),
      '# Test Requirements',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(testRepoDir, '.ai-workflow/issue-25/04_implementation/step-3.md'),
      '# Step 3',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(testRepoDir, '.ai-workflow/issue-25/metadata.json'),
      '{}',
      'utf-8'
    );
    fs.writeFileSync(
      path.join(testRepoDir, 'src/index.ts'),
      '// test',
      'utf-8'
    );

    mockGit = {
      status: jest.fn().mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/01_requirements/output/requirements.md', working_dir: 'M' },
        ],
        not_added: [],
        modified: ['.ai-workflow/issue-25/01_requirements/output/requirements.md'],
      }),
      add: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue({
        commit: '1234567',
        summary: { changes: 1, insertions: 10, deletions: 2 },
      }),
      addConfig: jest.fn().mockResolvedValue(undefined),
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
    } as any;

    mockMetadata = {
      data: {
        issue_number: '25',
        issue_title: '[REFACTOR] Git Manager の操作別分割',
        branch_name: 'feature/issue-25',
      },
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        issue_title: '[REFACTOR] Git Manager の操作別分割',
        branch_name: 'feature/issue-25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;

    mockSecretMasker = {
      maskSecretsInWorkflowDir: jest.fn().mockResolvedValue({
        filesProcessed: 1,
        secretsMasked: 2,
        errors: [],
      }),
    } as any;

    commitManager = new CommitManager(
      mockGit,
      mockMetadata,
      mockSecretMasker,
      testRepoDir
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Cleanup test files
    if (fs.existsSync(testRepoDir)) {
      fs.removeSync(testRepoDir);
    }
  });

  describe('commitPhaseOutput', () => {
    test('commitPhaseOutput_正常系_変更ファイルあり', async () => {
      // Given: 変更ファイルが存在する
      // (mockGitの初期設定で既に設定済み)

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: コミットが正常に作成される
      expect(result.success).toBe(true);
      expect(result.commit_hash).toBe('1234567');
      expect(result.files_committed).toContain(
        '.ai-workflow/issue-25/01_requirements/output/requirements.md'
      );
      expect(result.error).toBeUndefined();

      // SecretMasker が呼び出されることを確認
      expect(mockSecretMasker.maskSecretsInWorkflowDir).toHaveBeenCalled();
    });

    test('commitPhaseOutput_正常系_削除ファイルがコミットに含まれる', async () => {
      // Given: 変更ファイルと削除ファイルが存在する
      fs.writeFileSync(
        path.join(testRepoDir, 'src/refactored.ts'),
        '// refactored',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/01_requirements/output/requirements.md', working_dir: 'M' },
          { path: 'src/refactored.ts', working_dir: 'M' },
          { path: 'src/old-module.ts', working_dir: 'D' },
          { path: 'src/deprecated.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: [
          '.ai-workflow/issue-25/01_requirements/output/requirements.md',
          'src/refactored.ts',
        ],
        deleted: ['src/old-module.ts', 'src/deprecated.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: 削除ファイルがステージング・コミット対象になる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.arrayContaining([
          '.ai-workflow/issue-25/01_requirements/output/requirements.md',
          'src/refactored.ts',
        ])
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-module.ts']
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/deprecated.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
      expect(result.files_committed).toEqual(
        expect.arrayContaining(['src/old-module.ts', 'src/deprecated.ts'])
      );
    });

    test('commitPhaseOutput_正常系_削除ファイルと新規・変更ファイルが混在', async () => {
      // Given: 新規・変更・削除が混在
      fs.writeFileSync(
        path.join(testRepoDir, 'src/new-module.ts'),
        '// new',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(testRepoDir, 'src/updated.ts'),
        '// updated',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: 'src/new-module.ts', working_dir: '?' },
          { path: 'src/updated.ts', working_dir: 'M' },
          { path: 'src/removed-a.ts', working_dir: 'D' },
          { path: 'src/removed-b.ts', working_dir: 'D' },
        ],
        not_added: ['src/new-module.ts'],
        created: [],
        modified: ['src/updated.ts'],
        deleted: ['src/removed-a.ts', 'src/removed-b.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: 全ファイルがステージング対象になる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.arrayContaining([
          'src/new-module.ts',
          'src/updated.ts',
        ])
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/removed-a.ts']
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/removed-b.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
      expect(result.files_committed).toHaveLength(4);
    });

    test('commitPhaseOutput_正常系_全ファイルが削除のみ', async () => {
      // Given: 削除ファイルのみ
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: 'src/old-a.ts', working_dir: 'D' },
          { path: 'src/old-b.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: [],
        deleted: ['src/old-a.ts', 'src/old-b.ts'],
        renamed: [],
        staged: [],
      } as any);

      mockGit.commit.mockResolvedValue({
        commit: '9999999',
        summary: { changes: 1, insertions: 0, deletions: 2 },
      } as any);

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: 削除のみでもコミットが作成される
      expect(result.success).toBe(true);
      expect(result.commit_hash).toBe('9999999');
      expect(mockGit.add).not.toHaveBeenCalled();
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-a.ts']
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-b.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
    });

    test('commitPhaseOutput_正常系_変更ファイルなし', async () => {
      // Given: 変更ファイルが存在しない
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [],
        not_added: [],
        modified: [],
      } as any);

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: 警告ログを出力し、成功として扱われる
      expect(result.success).toBe(true);
      expect(result.commit_hash).toBeNull();
      expect(result.files_committed).toEqual([]);
      expect(result.error).toBeUndefined();

      // コミットは実行されない
      expect(mockGit.commit).not.toHaveBeenCalled();
    });

    test('commitPhaseOutput_異常系_Git操作失敗', async () => {
      // Given: Git commit操作が失敗する
      mockGit.commit.mockRejectedValue(
        new Error('Git command failed: fatal: unable to write new index file')
      );

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: エラーが適切にハンドリングされる
      expect(result.success).toBe(false);
      expect(result.commit_hash).toBeNull();
      expect(result.error).toContain('Git command failed');
    });
  });

  describe('commitStepOutput', () => {
    test('commitStepOutput_正常系_ステップコミット作成', async () => {
      // Given: 変更ファイルが存在する
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/04_implementation/step-3.md', working_dir: 'M' },
        ],
        not_added: [],
        modified: ['.ai-workflow/issue-25/04_implementation/step-3.md'],
      } as any);

      mockGit.commit.mockResolvedValue({
        commit: '2345678',
        summary: { changes: 1, insertions: 5, deletions: 1 },
      } as any);

      // When: commitStepOutput を呼び出す
      const result = await commitManager.commitStepOutput(
        'implementation',
        4,
        'execute',
        25,
        '/test/repo'
      );

      // Then: ステップコミットが正常に作成される
      expect(result.success).toBe(true);
      expect(result.commit_hash).toBe('2345678');
      expect(result.files_committed).toContain(
        '.ai-workflow/issue-25/04_implementation/step-3.md'
      );
    });

    test('commitStepOutput_正常系_削除ファイルがコミットに含まれる', async () => {
      // Given: 変更ファイルと削除ファイルが存在する
      fs.writeFileSync(
        path.join(testRepoDir, 'src/new-implementation.ts'),
        '// new impl',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/04_implementation/step-3.md', working_dir: 'M' },
          { path: 'src/new-implementation.ts', working_dir: 'M' },
          { path: 'src/old-implementation.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: [
          '.ai-workflow/issue-25/04_implementation/step-3.md',
          'src/new-implementation.ts',
        ],
        deleted: ['src/old-implementation.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitStepOutput を呼び出す
      const result = await commitManager.commitStepOutput(
        'implementation',
        4,
        'execute',
        25,
        '/test/repo'
      );

      // Then: 削除ファイルが含まれる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.arrayContaining([
          '.ai-workflow/issue-25/04_implementation/step-3.md',
          'src/new-implementation.ts',
        ])
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-implementation.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
      expect(result.files_committed).toEqual(
        expect.arrayContaining(['src/old-implementation.ts'])
      );
    });

    test('commitStepOutput_正常系_削除ファイルのみでもコミットできる', async () => {
      // Given: 削除ファイルのみ
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: 'src/old-a.ts', working_dir: 'D' },
          { path: 'src/old-b.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: [],
        deleted: ['src/old-a.ts', 'src/old-b.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitStepOutput を呼び出す
      const result = await commitManager.commitStepOutput(
        'implementation',
        4,
        'execute',
        25,
        '/test/repo'
      );

      // Then: 削除のみでもコミットが作成される
      expect(result.success).toBe(true);
      expect(mockGit.add).not.toHaveBeenCalled();
      expect(mockGit.raw).toHaveBeenCalledWith(['rm', '--cached', 'src/old-a.ts']);
      expect(mockGit.raw).toHaveBeenCalledWith(['rm', '--cached', 'src/old-b.ts']);
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
    });

    test('commitStepOutput_異常系_git_rm_失敗時は警告しつつ継続する', async () => {
      // Given: 削除ファイルの一部で git rm --cached が失敗
      const loggerWarnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: 'src/existing.ts', working_dir: 'M' },
          { path: 'src/deleted-ok.ts', working_dir: 'D' },
          { path: 'src/deleted-fail.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: ['src/existing.ts'],
        deleted: ['src/deleted-ok.ts', 'src/deleted-fail.ts'],
        renamed: [],
        staged: [],
      } as any);

      mockGit.raw.mockImplementation(async (args: string[]) => {
        if (args[2] === 'src/deleted-fail.ts') {
          throw new Error('fatal: pathspec did not match any files');
        }
      });

      // When: commitStepOutput を呼び出す
      const result = await commitManager.commitStepOutput(
        'implementation',
        4,
        'execute',
        25,
        '/test/repo'
      );

      // Then: 警告ログを出力しつつ、コミットは成功する
      expect(result.success).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledTimes(2);
      expect(loggerWarnSpy).toHaveBeenCalled();
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );

      loggerWarnSpy.mockRestore();
    });
  });

  describe('commitWorkflowInit', () => {
    test('commitWorkflowInit_正常系_初期化コミット作成', async () => {
      // Given: metadata.json が作成されている
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [{ path: '.ai-workflow/issue-25/metadata.json', working_dir: '?' }],
        not_added: ['.ai-workflow/issue-25/metadata.json'],
        modified: [],
      } as any);

      mockGit.commit.mockResolvedValue({
        commit: '3456789',
        summary: { changes: 1, insertions: 10, deletions: 0 },
      } as any);

      // When: commitWorkflowInit を呼び出す
      const result = await commitManager.commitWorkflowInit(
        25,
        'feature/issue-25'
      );

      // Then: 初期化コミットが正常に作成される
      expect(result.success).toBe(true);
      expect(result.commit_hash).toBe('3456789');
      expect(result.files_committed).toContain('.ai-workflow/issue-25/metadata.json');
    });

    test('commitWorkflowInit_正常系_削除ファイルがある場合もコミットに含まれる', async () => {
      // Given: metadata.json と削除ファイルが存在する
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/metadata.json', working_dir: '?' },
          { path: 'src/old-config.ts', working_dir: 'D' },
        ],
        not_added: ['.ai-workflow/issue-25/metadata.json'],
        created: [],
        modified: [],
        deleted: ['src/old-config.ts'],
        renamed: [],
        staged: [],
      } as any);

      mockGit.commit.mockResolvedValue({
        commit: '7777777',
        summary: { changes: 1, insertions: 1, deletions: 1 },
      } as any);

      // When: commitWorkflowInit を呼び出す
      const result = await commitManager.commitWorkflowInit(
        25,
        'feature/issue-25'
      );

      // Then: 削除ファイルが含まれる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.arrayContaining(['.ai-workflow/issue-25/metadata.json'])
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-config.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
    });
  });

  describe('commitCleanupLogs', () => {
    test('commitCleanupLogs_正常系_クリーンアップコミット作成', async () => {
      // Given: 変更ファイルが存在する（ワークフローディレクトリ内のファイル）
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/08_report/execute/agent_log.md', working_dir: 'M' },
        ],
        not_added: [],
        modified: ['.ai-workflow/issue-25/08_report/execute/agent_log.md'],
        deleted: [],
      } as any);

      mockGit.commit.mockResolvedValue({
        commit: '4567890',
        summary: { changes: 1, insertions: 0, deletions: 10 },
      } as any);

      // When: commitCleanupLogs を呼び出す
      const result = await commitManager.commitCleanupLogs(25, 'report');

      // Then: クリーンアップコミットが正常に作成される
      expect(result.success).toBe(true);
      expect(result.commit_hash).toBe('4567890');
    });
  });

  describe('commitRollback', () => {
    test('commitRollback_正常系_削除ファイルがコミットに含まれる（相対パス）', async () => {
      // Given: 復元ファイルは存在し、削除ファイルは存在しない
      fs.writeFileSync(
        path.join(testRepoDir, 'src/restored.ts'),
        '// restored',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [],
        not_added: [],
        created: [],
        modified: [],
        deleted: ['src/to-be-deleted.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitRollback を呼び出す
      const result = await commitManager.commitRollback(
        ['src/restored.ts', 'src/to-be-deleted.ts'],
        'implementation',
        'execute',
        'テスト失敗のため差し戻し'
      );

      // Then: 削除ファイルが含まれる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.arrayContaining(['src/restored.ts'])
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/to-be-deleted.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
      expect(result.files_committed).toEqual(
        expect.arrayContaining(['src/restored.ts', 'src/to-be-deleted.ts'])
      );
    });

    test('commitRollback_正常系_削除ファイルがコミットに含まれる（絶対パス→相対パス変換後）', async () => {
      // Given: 絶対パスのファイルリスト
      fs.writeFileSync(
        path.join(testRepoDir, 'src/restored.ts'),
        '// restored',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [],
        not_added: [],
        created: [],
        modified: [],
        deleted: ['src/deleted-file.ts'],
        renamed: [],
        staged: [],
      } as any);

      const files = [
        path.join(testRepoDir, 'src/restored.ts'),
        path.join(testRepoDir, 'src/deleted-file.ts'),
      ];

      // When: commitRollback を呼び出す
      const result = await commitManager.commitRollback(
        files,
        'implementation',
        'execute',
        'テスト失敗'
      );

      // Then: 削除ファイルが含まれる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.arrayContaining(['src/restored.ts'])
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/deleted-file.ts']
      );
      expect(mockGit.commit).toHaveBeenCalledWith(
        expect.any(String),
        [],
        { '--no-verify': null }
      );
      expect(result.files_committed).toEqual(
        expect.arrayContaining(['src/restored.ts', 'src/deleted-file.ts'])
      );
    });
  });

  describe('CommitManager - Deleted File Handling', () => {
    test('filterCommittableFiles_正常系_削除ファイルがコミット対象に含まれる', () => {
      // Given: 削除ファイルのみ
      const files = ['src/old-file.ts', 'src/another-deleted.ts'];
      const deletedFiles = new Set(['src/old-file.ts', 'src/another-deleted.ts']);

      // When: filterCommittableFiles を呼び出す
      const result = (commitManager as any).filterCommittableFiles(files, deletedFiles);

      // Then: すべて保持される
      expect(result).toEqual(expect.arrayContaining(files));
      expect(result).toHaveLength(2);
    });

    test('filterCommittableFiles_正常系_未追跡の存在しないファイルが除外される', () => {
      // Given: 存在しないファイルのみ
      const files = ['src/typo-file.ts', 'src/nonexistent.ts'];
      const deletedFiles = new Set<string>();

      // When: filterCommittableFiles を呼び出す
      const result = (commitManager as any).filterCommittableFiles(files, deletedFiles);

      // Then: 空配列
      expect(result).toEqual([]);
    });

    test('filterCommittableFiles_正常系_削除ファイルと存在ファイルの混在', () => {
      // Given: 既存ファイルと削除ファイルが混在
      fs.writeFileSync(
        path.join(testRepoDir, 'src/existing.ts'),
        '// existing',
        'utf-8'
      );

      const files = ['src/existing.ts', 'src/deleted.ts', 'src/typo.ts'];
      const deletedFiles = new Set(['src/deleted.ts']);

      // When: filterCommittableFiles を呼び出す
      const result = (commitManager as any).filterCommittableFiles(files, deletedFiles);

      // Then: existing と deleted が保持される
      expect(result).toEqual(expect.arrayContaining(['src/existing.ts', 'src/deleted.ts']));
      expect(result).not.toContain('src/typo.ts');
      expect(result).toHaveLength(2);
    });

    test('filterCommittableFiles_境界値_全ファイルが削除のみ', () => {
      // Given: 全て削除ファイル
      const files = ['src/old-a.ts', 'src/old-b.ts', 'src/old-c.ts'];
      const deletedFiles = new Set(files);

      // When: filterCommittableFiles を呼び出す
      const result = (commitManager as any).filterCommittableFiles(files, deletedFiles);

      // Then: すべて保持される
      expect(result).toHaveLength(3);
      expect(result).toEqual(expect.arrayContaining(files));
    });

    test('filterCommittableFiles_境界値_空のファイルリスト', () => {
      // Given: 空のファイルリスト
      const files: string[] = [];
      const deletedFiles = new Set<string>();

      // When: filterCommittableFiles を呼び出す
      const result = (commitManager as any).filterCommittableFiles(files, deletedFiles);

      // Then: 空配列
      expect(result).toEqual([]);
    });

    test('filterCommittableFiles_境界値_空のdeletedFilesセット', () => {
      // Given: deletedFilesが空で、既存ファイルと欠損ファイルが混在
      fs.writeFileSync(
        path.join(testRepoDir, 'src/existing.ts'),
        '// existing',
        'utf-8'
      );

      const files = ['src/existing.ts', 'src/missing.ts'];
      const deletedFiles = new Set<string>();

      // When: filterCommittableFiles を呼び出す
      const result = (commitManager as any).filterCommittableFiles(files, deletedFiles);

      // Then: 既存ファイルのみ保持される
      expect(result).toEqual(['src/existing.ts']);
    });
  });

  describe('CommitManager - FileSelector Integration (Deleted Files)', () => {
    test('FileSelector.getDeletedFilesからcommitPhaseOutputへの伝播', async () => {
      // Given: 変更ファイルと削除ファイルが存在する
      fs.writeFileSync(
        path.join(testRepoDir, '.ai-workflow/issue-25/01_requirements/output/requirements.md'),
        '# Test Requirements',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/01_requirements/output/requirements.md', working_dir: 'M' },
          { path: 'src/old-module.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: ['.ai-workflow/issue-25/01_requirements/output/requirements.md'],
        deleted: ['src/old-module.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: 削除ファイルがステージング対象になる
      expect(result.success).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-module.ts']
      );
    });

    test('FileSelector.getDeletedFilesからcommitStepOutputへの伝播', async () => {
      // Given: 実装フェーズの削除ファイル
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/04_implementation/step-3.md', working_dir: 'M' },
          { path: 'src/old-implementation.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: ['.ai-workflow/issue-25/04_implementation/step-3.md'],
        deleted: ['src/old-implementation.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitStepOutput を呼び出す
      const result = await commitManager.commitStepOutput(
        'implementation',
        4,
        'execute',
        25,
        '/test/repo'
      );

      // Then: 削除ファイルがコミット対象になる
      expect(result.success).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-implementation.ts']
      );
    });

    test('commitRollbackで絶対パス変換後も削除ファイルが保持される', async () => {
      // Given: 絶対パスのファイルリスト
      fs.writeFileSync(
        path.join(testRepoDir, 'src/restored.ts'),
        '// restored',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [],
        not_added: [],
        created: [],
        modified: [],
        deleted: ['src/deleted-in-rollback.ts'],
        renamed: [],
        staged: [],
      } as any);

      const files = [
        path.join(testRepoDir, 'src/restored.ts'),
        path.join(testRepoDir, 'src/deleted-in-rollback.ts'),
      ];

      // When: commitRollback を呼び出す
      const result = await commitManager.commitRollback(
        files,
        'implementation',
        'execute',
        'テスト失敗'
      );

      // Then: 削除ファイルが含まれる
      expect(result.success).toBe(true);
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/deleted-in-rollback.ts']
      );
    });

    test('セキュリティファイルの削除がコミットから除外される', async () => {
      // Given: .env と通常の削除ファイルが混在
      fs.writeFileSync(
        path.join(testRepoDir, '.ai-workflow/issue-25/01_requirements/output/requirements.md'),
        '# Test Requirements',
        'utf-8'
      );

      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/01_requirements/output/requirements.md', working_dir: 'M' },
          { path: '.env', working_dir: 'D' },
          { path: 'src/old-module.ts', working_dir: 'D' },
        ],
        not_added: [],
        created: [],
        modified: ['.ai-workflow/issue-25/01_requirements/output/requirements.md'],
        deleted: ['.env', 'src/old-module.ts'],
        renamed: [],
        staged: [],
      } as any);

      // When: commitPhaseOutput を呼び出す
      const result = await commitManager.commitPhaseOutput(
        'requirements',
        'completed',
        'PASS'
      );

      // Then: .env は除外され、通常の削除ファイルは含まれる
      expect(result.success).toBe(true);
      expect(mockGit.add).toHaveBeenCalledWith(
        expect.not.arrayContaining(['.env'])
      );
      expect(mockGit.raw).not.toHaveBeenCalledWith(
        ['rm', '--cached', '.env']
      );
      expect(mockGit.raw).toHaveBeenCalledWith(
        ['rm', '--cached', 'src/old-module.ts']
      );
    });
  });
});

describe('CommitManager - SecretMasker Integration', () => {
  let commitManager: CommitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockSecretMasker: jest.Mocked<SecretMasker>;
  let testRepoPath: string;

  beforeEach(() => {
    // Create temp directory structure
    testRepoPath = path.join(os.tmpdir(), `commit-manager-test-${Date.now()}`);
    const workflowDir = path.join(testRepoPath, '.ai-workflow', 'issue-25', '01_requirements', 'output');
    fs.ensureDirSync(workflowDir);
    fs.writeFileSync(path.join(workflowDir, 'requirements.md'), '# Test Requirements');

    mockGit = {
      status: jest.fn().mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/01_requirements/output/requirements.md', working_dir: 'M' },
        ],
        not_added: [],
        modified: ['.ai-workflow/issue-25/01_requirements/output/requirements.md'],
      }),
      add: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn().mockResolvedValue(undefined),
      commit: jest.fn().mockResolvedValue({
        commit: '1234567',
        summary: { changes: 1, insertions: 10, deletions: 2 },
      }),
      addConfig: jest.fn().mockResolvedValue(undefined),
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
    } as any;

    mockMetadata = {
      data: {
        issue_number: '25',
        issue_title: '[REFACTOR] Git Manager の操作別分割',
        branch_name: 'feature/issue-25',
      },
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
        issue_title: '[REFACTOR] Git Manager の操作別分割',
        branch_name: 'feature/issue-25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;

    mockSecretMasker = {
      maskSecretsInWorkflowDir: jest.fn().mockResolvedValue({
        filesProcessed: 0,
        secretsMasked: 0,
        errors: [],
      }),
    } as any;

    commitManager = new CommitManager(
      mockGit,
      mockMetadata,
      mockSecretMasker,
      testRepoPath
    );
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(testRepoPath)) {
      fs.removeSync(testRepoPath);
    }
  });

  test('commitPhaseOutput_SecretMasker統合_マスキング成功', async () => {
    // Given: SecretMasker が正常に動作する
    mockSecretMasker.maskSecretsInWorkflowDir.mockResolvedValue({
      filesProcessed: 1,
      secretsMasked: 2,
      errors: [],
    });

    // When: commitPhaseOutput を呼び出す
    const result = await commitManager.commitPhaseOutput(
      'requirements',
      'completed',
      'PASS'
    );

    // Then: SecretMaskerが呼び出され、コミットが成功する
    expect(mockSecretMasker.maskSecretsInWorkflowDir).toHaveBeenCalledWith(
      path.join(testRepoPath, '.ai-workflow', 'issue-25')
    );
    expect(result.success).toBe(true);
  });

  test('commitPhaseOutput_SecretMasker統合_マスキング失敗時も継続', async () => {
    // Given: SecretMasker が例外をthrow
    mockSecretMasker.maskSecretsInWorkflowDir.mockRejectedValue(
      new Error('Masking failed')
    );

    // When: commitPhaseOutput を呼び出す
    const result = await commitManager.commitPhaseOutput(
      'requirements',
      'completed',
      'PASS'
    );

    // Then: コミットは継続される（エラーをログに出力するが処理は続行）
    expect(result.success).toBe(true);
  });
});

// Note: getChangedFiles and filterPhaseFiles have been moved to FileSelector module
// See tests/unit/git/file-selector.test.ts for these tests

describe('CommitManager - Git Config', () => {
  let commitManager: CommitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockSecretMasker: jest.Mocked<SecretMasker>;

  beforeEach(() => {
    mockGit = {
      status: jest.fn(),
      addConfig: jest.fn().mockResolvedValue(undefined),
      raw: jest.fn(),
      listConfig: jest.fn().mockResolvedValue({ all: {} }),
    } as any;

    mockMetadata = {
      data: {
        issue_number: '25',
      },
      getData: jest.fn().mockReturnValue({
        issue_number: '25',
      }),
      getIssueNumber: jest.fn().mockReturnValue('25'),
    } as any;

    mockSecretMasker = {
      maskSecretsInWorkflowDir: jest.fn(),
    } as any;

    commitManager = new CommitManager(
      mockGit,
      mockMetadata,
      mockSecretMasker,
      '/test/repo'
    );
  });

  describe('ensureGitConfig', () => {
    test('ensureGitConfig_正常系_Git設定を自動設定', async () => {
      // Given: Git設定が未完了、環境変数が設定されている
      process.env.GIT_COMMIT_USER_NAME = 'Claude AI';
      process.env.GIT_COMMIT_USER_EMAIL = 'claude@example.com';

      // When: ensureGitConfig を呼び出す
      await (commitManager as any).ensureGitConfig();

      // Then: Git設定が実行される
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.name', 'Claude AI', false, 'local');
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.email', 'claude@example.com', false, 'local');

      // Cleanup
      delete process.env.GIT_COMMIT_USER_NAME;
      delete process.env.GIT_COMMIT_USER_EMAIL;
    });
  });
});
