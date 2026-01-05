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
