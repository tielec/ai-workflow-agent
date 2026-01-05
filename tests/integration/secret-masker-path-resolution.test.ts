import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkingDirectory } from '../../src/core/helpers/working-directory-resolver.js';
import { SecretMasker } from '../../src/core/secret-masker.js';
import { logger } from '../../src/utils/logger.js';

describe('SecretMaskerとパス解決の統合テスト (Issue #592)', () => {
  const baseEnv = { ...process.env };
  let tempRoot: string;
  let repoDir: string;
  let externalRepoDir: string;
  let workflowBaseDir: string;

  beforeAll(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'secret-masker-int-'));
    repoDir = path.join(tempRoot, 'sd-platform-development');
    externalRepoDir = path.join(tempRoot, '..', 'external-repo-target');
    workflowBaseDir = path.join(tempRoot, 'workflow-int');

    await fs.ensureDir(path.join(repoDir, '.git'));
    const metadataDir = path.join(repoDir, '.ai-workflow', 'issue-592');
    await fs.ensureDir(metadataDir);
    await fs.ensureDir(externalRepoDir);
    await fs.ensureDir(workflowBaseDir);

    const metadata = {
      target_repository: {
        path: externalRepoDir,
      },
    };
    await fs.writeJson(path.join(metadataDir, 'metadata.json'), metadata);
  });

  beforeEach(() => {
    process.env = { ...baseEnv, REPOS_ROOT: tempRoot };
  });

  beforeEach(async () => {
    await fs.emptyDir(workflowBaseDir);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    process.env = baseEnv;
    await fs.remove(tempRoot);
    await fs.remove(externalRepoDir);
  });

  test('Jenkins風のログメッセージでも長いパスがマスクされない', () => {
    const message = `Working directory: ${path.join(repoDir, '.ai-workflow', 'issue-592')}`;
    const masker = new SecretMasker();

    const masked = masker.maskObject(message) as string;

    expect(masked).toContain('sd-platform-development');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('REPOS_ROOT外へ解決する場合に警告を出しつつパスを返す', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const original = path.join(repoDir, '.ai-workflow', 'issue-592', 'execute');

    const resolved = await resolveWorkingDirectory(original);

    expect(resolved).toBe(externalRepoDir);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Issue #592 Warning] Resolved path'),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(externalRepoDir));
  });

  test('マルチリポジトリログで複数パスを保持する (IT-3.1.3)', () => {
    const masker = new SecretMasker();
    const firstPath = path.join(tempRoot, 'repos', 'sd-platform-development', '.ai-workflow', 'issue-1');
    const secondPath = path.join(tempRoot, 'repos', 'another-long-repo-name-here', '.ai-workflow', 'issue-2');
    const message = `Processing ${firstPath}\nAlso checking ${secondPath}`;

    const masked = masker.maskObject(message) as string;

    expect(masked).toContain('sd-platform-development');
    expect(masked).toContain('another-long-repo-name-here');
    expect(masked).not.toContain('[REDACTED_TOKEN]');
  });

  test('maskSecretsInWorkflowDirでagent_log_raw.txt内のパスとトークンを処理する (IT-3.2.1)', async () => {
    const workflowDir = path.join(workflowBaseDir, '.ai-workflow', 'issue-321');
    const logFile = path.join(workflowDir, 'agent_log_raw.txt');
    await fs.ensureDir(path.dirname(logFile));
    process.env.GITHUB_TOKEN = 'ghp_test1234567890abcdefghij';

    const originalLog = `Working directory: ${path.join(
      tempRoot,
      'ai-workflow-repos-2-4a4ea5b0',
      'sd-platform-development',
      '.ai-workflow',
      'issue-236',
    )}\nToken: ghp_test1234567890abcdefghij`;
    await fs.writeFile(logFile, originalLog);

    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);
    const maskedLog = await fs.readFile(logFile, 'utf-8');

    expect(result.filesProcessed).toBe(1);
    expect(maskedLog).toContain('sd-platform-development');
    expect(maskedLog).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(maskedLog).not.toContain('[REDACTED_TOKEN]');
  });

  test('metadata.json内のパスを保持しつつリモートURLのトークンをマスクする (IT-3.2.2)', async () => {
    const workflowDir = path.join(workflowBaseDir, '.ai-workflow', 'issue-322');
    const metadataFile = path.join(workflowDir, 'metadata.json');
    await fs.ensureDir(path.dirname(metadataFile));
    process.env.GITHUB_TOKEN = 'ghp_test1234567890abcdefghij';

    await fs.writeJson(metadataFile, {
      target_repository: {
        path: path.join(tempRoot, 'ai-workflow-repos-2-4a4ea5b0', 'sd-platform-development'),
        remote_url: 'https://ghp_test1234567890abcdefghij@github.com/owner/repo.git',
      },
    });

    const masker = new SecretMasker();
    const result = await masker.maskSecretsInWorkflowDir(workflowDir);
    const maskedMetadata = await fs.readJson(metadataFile);

    expect(result.filesProcessed).toBe(1);
    expect(maskedMetadata.target_repository.path).toContain('sd-platform-development');
    expect(maskedMetadata.target_repository.remote_url).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(maskedMetadata.target_repository.remote_url).not.toContain('ghp_test1234567890abcdefghij');
  });

  test('マスキング後もパス解決が成功しIssue #592 の再現が発生しない (IT-3.3.1)', async () => {
    const issueDir = path.join(repoDir, '.ai-workflow', 'issue-236');
    const executeDir = path.join(issueDir, 'execute');
    await fs.ensureDir(executeDir);
    const metadataPath = path.join(issueDir, 'metadata.json');
    await fs.writeJson(metadataPath, {
      target_repository: {
        path: repoDir,
      },
    });

    const originalPath = path.join(executeDir, 'agent_log_raw.txt');
    const masker = new SecretMasker();
    const maskedPath = masker.maskObject(originalPath) as string;
    const resolved = await resolveWorkingDirectory(maskedPath);

    expect(maskedPath).toBe(originalPath);
    expect(fs.existsSync(issueDir)).toBe(true);
    expect(resolved).toBe(repoDir);
  });

  test('正当なフォールバックでは process.cwd() に解決し Issue #592 警告は出さない (IT-3.3.2)', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const nonExistent = path.join(tempRoot, 'nonexistent-repo', '.ai-workflow', 'issue-999', 'execute');

    const resolved = await resolveWorkingDirectory(nonExistent);

    expect(resolved).toBe(process.cwd());
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Falling back to process.cwd()'));
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Issue #592 Warning'));
  });
});

describe('Issue #595: Integration tests for path protection ordering', () => {
  const baseEnv = { ...process.env };
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'secret-masker-595-'));
  });

  afterAll(async () => {
    process.env = baseEnv;
    await fs.remove(tempDir);
  });

  beforeEach(async () => {
    // Reset environment variables
    process.env = { ...baseEnv };
    delete process.env.GITHUB_TOKEN;
    delete process.env.DEV_TOKEN;
    delete process.env.PROD_TOKEN;
    // Clean temp directory
    await fs.emptyDir(tempDir);
  });

  // IT-595-001: Verify maskObject preserves paths with env var substring match
  // Note: maskSecretsInWorkflowDir has a different code path that processes files differently.
  // The Issue #595 fix is specifically for maskObject() where applyMasking() order was reversed.
  // Note: Path protection regex requires path components to be followed by / or end of string.
  test('should preserve paths when using maskObject with env var substring match (IT-595.1)', async () => {
    // Given: Environment with matching substring
    process.env.GITHUB_TOKEN = 'ghp_developmenttoken123456789';
    const masker = new SecretMasker();

    // Given: Log content with repository paths (paths must end with / for protection to work)
    const logContent = `Local path: ${tempDir}/sd-platform-development/ Agent working directory: ${tempDir}/sd-platform-development/file.txt`;

    // When: Using maskObject (which applies Issue #595 fix)
    const maskedContent = masker.maskObject(logContent) as string;

    // Then: Paths should be preserved via maskObject
    expect(maskedContent).toContain('sd-platform-development');
    expect(maskedContent).not.toContain('[REDACTED_GITHUB_TOKEN]');
  });

  // IT-595-002: Preserve paths in metadata.json with env var substring match
  test('should preserve paths in metadata.json with env var substring match (IT-595.2)', async () => {
    // Given: Environment with matching substring
    process.env.GITHUB_TOKEN = 'ghp_xxplatformxxproductionxx';
    const masker = new SecretMasker();

    // Given: metadata.json with repository paths and token
    const metadata = {
      working_directory: `${tempDir}/sd-platform-development`,
      repository: 'plan-b-co-jp/sd-platform-development',
      remote_url: 'https://ghp_xxplatformxxproductionxx@github.com/owner/repo.git',
      issue_number: 236
    };
    await fs.writeFile(
      path.join(tempDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    // When: Masking workflow directory
    await masker.maskSecretsInWorkflowDir(tempDir);

    // Then: Paths should be preserved, token should be masked
    const maskedContent = await fs.readFile(
      path.join(tempDir, 'metadata.json'),
      'utf-8'
    );
    expect(maskedContent).toContain('sd-platform-development');
    expect(maskedContent).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(maskedContent).not.toContain('ghp_xxplatformxxproductionxx');
  });

  // IT-595-003: Multi-repository log file with multiple env var matches
  test('should preserve multiple repository paths in multi-repo log (IT-595.3)', async () => {
    // Given: Multiple environment variables
    process.env.DEV_TOKEN = 'dev_development_token_value';
    process.env.PROD_TOKEN = 'prod_production_token_value';
    const masker = new SecretMasker();

    // Given: Log file with multiple repository paths
    const logContent = `
      Repository 1: ${tempDir}/sd-platform-development/.ai-workflow
      Repository 2: ${tempDir}/sd-api-production/.ai-workflow
      Processing both repositories...
    `;
    await fs.writeFile(path.join(tempDir, 'agent_log_raw.txt'), logContent);

    // When: Masking workflow directory
    await masker.maskSecretsInWorkflowDir(tempDir);

    // Then: All repository paths are preserved
    const maskedContent = await fs.readFile(
      path.join(tempDir, 'agent_log_raw.txt'),
      'utf-8'
    );
    expect(maskedContent).toContain('sd-platform-development');
    expect(maskedContent).toContain('sd-api-production');
  });

  // IT-595-004: End-to-end reproduction scenario from issue using maskObject
  // Note: The Issue #595 fix is in maskObject(), not maskSecretsInWorkflowDir().
  // This test verifies maskObject correctly handles the exact reproduction scenario.
  // Note: Path components must be followed by / or end of string for protection regex to match.
  test('should fix Issue #595 reproduction scenario using maskObject (IT-595.4)', async () => {
    // Given: Exact scenario from issue - env var contains "development"
    process.env.GITHUB_TOKEN = 'ghp_xxxxxxxxxxdevelopmentxxxxxxxxx';
    const masker = new SecretMasker();

    // Given: The exact path pattern from the issue (with trailing slash for regex match)
    // The path protection regex requires (?=\/|$) - either followed by / or end of string
    const logContent = `Local path: /tmp/ai-workflow-repos-5-05c8a277/sd-platform-development/.ai-workflow/issue-236`;

    // When: Using maskObject (which has the Issue #595 fix)
    const maskedContent = masker.maskObject(logContent) as string;

    // Then: Path is NOT corrupted
    // This was the bug: path was becoming sd-platform-[REDACTED_GITHUB_TOKEN]
    expect(maskedContent).toContain('sd-platform-development');
    expect(maskedContent).not.toContain('sd-platform-[REDACTED_GITHUB_TOKEN]');
    expect(maskedContent).not.toContain('[REDACTED_TOKEN]');
  });

  // IT-595-005: Verify path resolution still works after masking
  test('should allow path resolution after masking (IT-595.5)', async () => {
    // Given: Environment with matching substring
    process.env.GITHUB_TOKEN = 'ghp_developmenttoken123456789';
    const masker = new SecretMasker();

    // Given: Original path
    const originalPath = path.join(tempDir, 'sd-platform-development', '.ai-workflow', 'issue-236');
    const maskedPath = masker.maskObject(originalPath) as string;

    // Then: The masked path should be identical to original (not corrupted)
    expect(maskedPath).toBe(originalPath);

    // And if the directory exists, resolution should work
    await fs.ensureDir(originalPath);
    expect(fs.existsSync(maskedPath)).toBe(true);
  });
});
