import fs from 'node:fs';
import path from 'node:path';

const { promises: fsp } = fs;

export type SimulationStage = 'archived' | 'skipped' | 'auto';

export interface SimulationOptions {
  reposRoot: string;
  workspace: string;
  issueNumber: string;
  repoName?: string;
  simulateCopyError?: boolean;
}

export interface SimulationResult {
  logs: string[];
  stage: SimulationStage;
  safeIssueNumber?: string;
  archivedPath?: string;
  copyPerformed: boolean;
}

function sanitizeIssueNumber(issueNumber: string): string {
  return issueNumber.replace(/[^A-Za-z0-9_-]/g, '');
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(target: string): Promise<void> {
  await fsp.mkdir(target, { recursive: true });
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  await ensureDirectory(destination);
  const entries = await fsp.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcEntry = path.join(source, entry.name);
    const destEntry = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcEntry, destEntry);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const linkTarget = await fsp.readlink(srcEntry);
      await fsp.symlink(linkTarget, destEntry);
      continue;
    }
    await fsp.copyFile(srcEntry, destEntry);
  }
}

export async function prepareIssueFiles(
  reposRoot: string,
  repoName: string,
  issueNumber: string,
  files: Record<string, string>
): Promise<void> {
  const issueDir = path.join(reposRoot, repoName, '.ai-workflow', `issue-${issueNumber}`);
  await ensureDirectory(issueDir);

  for (const [relativePath, content] of Object.entries(files)) {
    const targetPath = path.join(issueDir, relativePath);
    await ensureDirectory(path.dirname(targetPath));
    await fsp.writeFile(targetPath, content, 'utf-8');
  }
}

export async function simulateArchiveArtifacts(options: SimulationOptions): Promise<SimulationResult> {
  const { reposRoot, workspace, issueNumber, repoName = 'ai-workflow-agent', simulateCopyError = false } = options;
  const logs: string[] = [];
  const log = (message: string) => logs.push(message);

  log('=========================================');
  log('Stage: Archive Artifacts');
  log('=========================================');

  if (!issueNumber || issueNumber === 'auto') {
    log('[INFO] Issue number not available (auto_issue mode). Skipping artifact archiving.');
    return { logs, stage: 'auto', copyPerformed: false };
  }

  const safeIssueNumber = sanitizeIssueNumber(issueNumber);
  if (!safeIssueNumber) {
    log(`[WARN] Issue number '${issueNumber}' is invalid after sanitization. Skipping artifact archiving.`);
    return { logs, stage: 'skipped', copyPerformed: false };
  }
  if (safeIssueNumber !== issueNumber) {
    log(`[WARN] Issue number contains unsafe characters. Sanitized to '${safeIssueNumber}'.`);
  }

  const sourcePath = path.join(reposRoot, repoName, '.ai-workflow', `issue-${safeIssueNumber}`);
  const destPath = path.join(workspace, 'artifacts', '.ai-workflow', `issue-${safeIssueNumber}`);
  const sourceExists = await pathExists(sourcePath);

  if (!sourceExists) {
    log(`[WARN] Source directory not found: ${sourcePath}`);
    log('[WARN] Skipping artifact archiving.');
    return { logs, stage: 'skipped', safeIssueNumber, copyPerformed: false };
  }

  log('Copying artifacts from REPOS_ROOT to WORKSPACE...');
  log(`Source: ${sourcePath}`);
  log(`Destination: ${destPath}`);
  await ensureDirectory(destPath);

  let copyPerformed = true;
  if (simulateCopyError) {
    copyPerformed = false;
    log('[ERROR] Failed to copy artifacts: simulated failure.');
  } else {
    await copyDirectory(sourcePath, destPath);
  }

  const artifactPath = `artifacts/.ai-workflow/issue-${safeIssueNumber}/**/*`;
  log(`Archiving artifacts: ${artifactPath}`);

  const storedPath = path.join(workspace, '.archived-artifacts', `issue-${safeIssueNumber}`);
  await ensureDirectory(storedPath);
  if (await pathExists(destPath)) {
    await copyDirectory(destPath, storedPath);
  }

  log(`Artifacts archived for Issue #${safeIssueNumber}`);

  await fsp.rm(path.join(workspace, 'artifacts'), { recursive: true, force: true });
  log('Temporary artifact copy cleaned up');

  return {
    logs,
    stage: 'archived',
    safeIssueNumber,
    archivedPath: storedPath,
    copyPerformed,
  };
}
