/**
 * Unit tests for CommitManager
 * Tests commit operations, message generation, and SecretMasker integration
 */

// @ts-nocheck

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CommitManager } from '../../../src/core/git/commit-manager';
import { MetadataManager } from '../../../src/core/metadata-manager';
import { SecretMasker } from '../../../src/core/secret-masker';
import { SimpleGit } from 'simple-git';

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

  describe('buildStepCommitMessage', () => {
    test('buildStepCommitMessage_正常系_ステップ完了時のメッセージ生成', () => {
      // Given: Phase名、Phase番号、Step名、Issue番号
      const phaseName = 'implementation';
      const phaseNumber = 4;
      const step = 'execute';
      const issueNumber = 25;

      // When: buildStepCommitMessage を呼び出す
      const message = (commitManager as any).buildStepCommitMessage(
        phaseName,
        phaseNumber,
        step,
        issueNumber
      );

      // Then: ステップ情報を含むメッセージが生成される
      expect(message).toContain('Phase 4 (implementation) - execute completed');
      expect(message).toContain('Step: execute');
      expect(message).toContain('Issue: #25');
    });
  });

  describe('createInitCommitMessage', () => {
    test('createInitCommitMessage_正常系_ワークフロー初期化メッセージ生成', () => {
      // Given: Issue番号、ブランチ名
      const issueNumber = 25;
      const branchName = 'feature/issue-25';

      // When: createInitCommitMessage を呼び出す
      const message = (commitManager as any).createInitCommitMessage(issueNumber, branchName);

      // Then: 初期化用メッセージが生成される
      expect(message).toContain('[ai-workflow] Initialize workflow for issue #25');
      expect(message).toContain('Issue: #25');
      expect(message).toContain('Branch: feature/issue-25');
    });
  });

  describe('createCleanupCommitMessage', () => {
    test('createCleanupCommitMessage_正常系_クリーンアップメッセージ生成', () => {
      // Given: Issue番号、Phase名
      const issueNumber = 25;
      const phase = 'report';

      // When: createCleanupCommitMessage を呼び出す
      const message = (commitManager as any).createCleanupCommitMessage(issueNumber, phase);

      // Then: クリーンアップ用メッセージが生成される
      expect(message).toContain('[ai-workflow] Clean up workflow execution logs');
      expect(message).toContain('Phase: 8 (report)');
      expect(message).toContain('Issue: #25');
    });
  });
});

describe('CommitManager - Commit Operations', () => {
  let commitManager: CommitManager;
  let mockGit: jest.Mocked<SimpleGit>;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockSecretMasker: jest.Mocked<SecretMasker>;

  beforeEach(() => {
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
      '/test/repo'
    );
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
      expect(result.error).toBeNull();

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
      expect(result.error).toBeNull();

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
      // Given: 削除ファイルが存在する
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [{ path: '.ai-workflow/issue-25/04_implementation/logs/', working_dir: 'D' }],
        not_added: [],
        modified: [],
        deleted: ['.ai-workflow/issue-25/04_implementation/logs/'],
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

  beforeEach(() => {
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
      maskSecretsInWorkflowDir: jest.fn(),
    } as any;

    commitManager = new CommitManager(
      mockGit,
      mockMetadata,
      mockSecretMasker,
      '/test/repo'
    );
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
    expect(mockSecretMasker.maskSecretsInWorkflowDir).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  test('commitPhaseOutput_SecretMasker統合_マスキング失敗時も継続', async () => {
    // Given: SecretMasker が例外をthrow
    mockSecretMasker.maskSecretsInWorkflowDir.mockRejectedValue(
      new Error('Masking failed')
    );

    // Spy on console.error
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // When: commitPhaseOutput を呼び出す
    const result = await commitManager.commitPhaseOutput(
      'requirements',
      'completed',
      'PASS'
    );

    // Then: エラーログが出力され、コミットは継続される
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ERROR] Secret masking failed')
    );
    expect(result.success).toBe(true);

    consoleErrorSpy.mockRestore();
  });
});

describe('CommitManager - File Helpers', () => {
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

  describe('getChangedFiles', () => {
    test('getChangedFiles_正常系_変更ファイル取得', async () => {
      // Given: Git statusで変更ファイルが検出される
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: 'src/core/git-manager.ts', working_dir: 'M' },
          { path: 'src/core/git/commit-manager.ts', working_dir: '?' },
        ],
        not_added: ['src/core/git/commit-manager.ts'],
        modified: ['src/core/git-manager.ts'],
      } as any);

      // When: getChangedFiles を呼び出す
      const files = await (commitManager as any).getChangedFiles();

      // Then: 変更ファイルが正しく取得される
      expect(files).toContain('src/core/git-manager.ts');
      expect(files).toContain('src/core/git/commit-manager.ts');
    });

    test('getChangedFiles_境界値_@tmpファイルを除外', async () => {
      // Given: @tmpファイルが含まれる
      mockGit.status.mockResolvedValue({
        current: 'feature/issue-25',
        files: [
          { path: 'src/core/git-manager.ts', working_dir: 'M' },
          { path: 'output/@tmp-agent-session.log', working_dir: '?' },
        ],
        not_added: ['output/@tmp-agent-session.log'],
        modified: ['src/core/git-manager.ts'],
      } as any);

      // When: getChangedFiles を呼び出す
      const files = await (commitManager as any).getChangedFiles();

      // Then: @tmpファイルが除外される
      expect(files).toContain('src/core/git-manager.ts');
      expect(files).not.toContain('output/@tmp-agent-session.log');
    });
  });

  describe('filterPhaseFiles', () => {
    test('filterPhaseFiles_正常系_Issue番号でフィルタリング', () => {
      // Given: 複数のIssueのファイルが混在する
      const allFiles = [
        '.ai-workflow/issue-25/01_requirements/output/requirements.md',
        '.ai-workflow/issue-24/01_requirements/output/requirements.md',
        'src/core/git-manager.ts',
      ];

      // When: filterPhaseFiles を呼び出す
      const filtered = (commitManager as any).filterPhaseFiles(allFiles, '25');

      // Then: Issue #25のファイルのみが抽出される
      expect(filtered).toContain(
        '.ai-workflow/issue-25/01_requirements/output/requirements.md'
      );
      expect(filtered).not.toContain(
        '.ai-workflow/issue-24/01_requirements/output/requirements.md'
      );
    });
  });

  describe('ensureGitConfig', () => {
    test('ensureGitConfig_正常系_Git設定を自動設定', async () => {
      // Given: Git設定が未完了、環境変数が設定されている
      process.env.GIT_COMMIT_USER_NAME = 'Claude AI';
      process.env.GIT_COMMIT_USER_EMAIL = 'claude@example.com';

      // When: ensureGitConfig を呼び出す
      await (commitManager as any).ensureGitConfig();

      // Then: Git設定が実行される
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.name', 'Claude AI');
      expect(mockGit.addConfig).toHaveBeenCalledWith('user.email', 'claude@example.com');

      // Cleanup
      delete process.env.GIT_COMMIT_USER_NAME;
      delete process.env.GIT_COMMIT_USER_EMAIL;
    });
  });
});
