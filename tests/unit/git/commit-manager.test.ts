/**
 * Unit tests for CommitManager
 * Tests commit operations, message generation, and SecretMasker integration
 */

// @ts-nocheck

import { describe, test, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { CommitManager } from '../../../src/core/git/commit-manager';
import { MetadataManager } from '../../../src/core/metadata-manager';
import { SecretMasker } from '../../../src/core/secret-masker';
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
  });

  describe('commitCleanupLogs', () => {
    test('commitCleanupLogs_正常系_クリーンアップコミット作成', async () => {
      // Given: 変更ファイルが存在する（ワークフローディレクトリ内のファイル）
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: '.ai-workflow/issue-25/09_report/execute/agent_log.md', working_dir: 'M' },
        ],
        not_added: [],
        modified: ['.ai-workflow/issue-25/09_report/execute/agent_log.md'],
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
