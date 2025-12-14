/**
 * Integration tests that simulate Phase 3のテストシナリオ (IT-001~IT-007)
 * by replaying the artifact copy/archive/cleanup sequence described in the
 * Jenkins common archiveArtifacts helper.
 */

import { describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareIssueFiles, simulateArchiveArtifacts } from './helpers/archiveArtifactsScenarioHelper';

const sampleIssue123Files = {
  'metadata.json': JSON.stringify(
    {
      issue_number: '123',
      workflow_type: 'test',
      created_at: '2025-01-23T10:00:00Z',
      repo_name: 'ai-workflow-agent',
    },
    null,
    2
  ),
  '00_planning/output/planning.md': `# Planning Phase
This is a test planning document for issue 123.

### Strategy
- Implementation: EXTEND
- Test: INTEGRATION_ONLY`,
  '01_requirements/output/requirements.md': `# Requirements Phase
This is a test requirements document for issue 123.

### Functional Requirements
- FR-001: Test requirement for integration testing`,
};

async function createSimulationContext(baseName: string) {
  const baseDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `${baseName}-`));
  return {
    baseDir,
    reposRoot: path.join(baseDir, 'repos'),
    workspace: path.join(baseDir, 'workspace'),
  };
}

async function cleanupSimulationContext(baseDir: string) {
  await fs.promises.rm(baseDir, { recursive: true, force: true });
}

async function pathExists(target: string) {
  try {
    await fs.promises.access(target);
    return true;
  } catch {
    return false;
  }
}

describe('archiveArtifacts Phase 3 scenarios', () => {
  test('IT-001: standard workflow archives issue artifacts and cleans up', async () => {
    const context = await createSimulationContext('it-001');
    try {
      await fs.promises.mkdir(context.reposRoot, { recursive: true });
      await prepareIssueFiles(context.reposRoot, 'ai-workflow-agent', '123', sampleIssue123Files);

      // Given a populated REPOS_ROOT and a Jenkins workspace
      // When the archiveArtifacts helper executes against issue #123
      const result = await simulateArchiveArtifacts({
        reposRoot: context.reposRoot,
        workspace: context.workspace,
        issueNumber: '123',
      });

      // Then the copy/archive/cleanup sequence runs successfully
      expect(result.stage).toBe('archived');
      expect(result.logs).toContain('Copying artifacts from REPOS_ROOT to WORKSPACE...');
      expect(result.logs).toContain('Archiving artifacts: artifacts/.ai-workflow/issue-123/**/*');
      expect(result.logs).toContain('Artifacts archived for Issue #123');
      expect(result.logs).toContain('Temporary artifact copy cleaned up');
      expect(result.archivedPath).toBeDefined();

      const artifactsDir = path.join(context.workspace, 'artifacts');
      expect(await pathExists(artifactsDir)).toBe(false);

      for (const [relativePath, expectedContent] of Object.entries(sampleIssue123Files)) {
        const archivedFile = path.join(result.archivedPath!, relativePath);
        const actual = await fs.promises.readFile(archivedFile, 'utf-8');
        expect(actual).toBe(expectedContent);
      }
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });

  test('IT-002: missing source directory logs warnings and skips archiving', async () => {
    const context = await createSimulationContext('it-002');
    try {
      await fs.promises.mkdir(context.reposRoot, { recursive: true });

      // Given REPOS_ROOT without the requested issue directory
      // When the helper runs for issue #789
      const result = await simulateArchiveArtifacts({
        reposRoot: context.reposRoot,
        workspace: context.workspace,
        issueNumber: '789',
      });

      // Then archiveArtifacts detects the missing source and returns early
      expect(result.stage).toBe('skipped');
      expect(result.logs.some((entry) => entry.includes('Source directory not found'))).toBe(true);
      expect(result.logs).toContain('[WARN] Skipping artifact archiving.');
      expect(result.archivedPath).toBeUndefined();
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });

  test('IT-003: empty issue directory still archives without error', async () => {
    const context = await createSimulationContext('it-003');
    try {
      const issueBase = path.join(context.reposRoot, 'ai-workflow-agent', '.ai-workflow', 'issue-456');
      await fs.promises.mkdir(issueBase, { recursive: true });

      // Given an empty issue directory, copy runs but there are no files
      // When the helper archives issue #456
      const result = await simulateArchiveArtifacts({
        reposRoot: context.reposRoot,
        workspace: context.workspace,
        issueNumber: '456',
      });

      // Then the pipeline still archives an empty artifacts set
      expect(result.stage).toBe('archived');
      expect(result.archivedPath).toBeDefined();

      const archivedEntries = await fs.promises.readdir(result.archivedPath!);
      expect(archivedEntries.length).toBe(0);
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });

  test('IT-004: auto issue mode skips artifact processing', async () => {
    const context = await createSimulationContext('it-004');
    try {
      // Given the pipeline is executing in auto-issue mode
      // When auto-issue mode triggers the helper
      const result = await simulateArchiveArtifacts({
        reposRoot: context.reposRoot,
        workspace: context.workspace,
        issueNumber: 'auto',
      });

      // Then the placeholder issue number is detected and no archive occurs
      expect(result.stage).toBe('auto');
      expect(result.archivedPath).toBeUndefined();
      expect(result.logs).toContain('[INFO] Issue number not available (auto_issue mode). Skipping artifact archiving.');
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });

  test('IT-005: concurrent pipelines archive the same issue independently', async () => {
    const context = await createSimulationContext('it-005');
    try {
      await fs.promises.mkdir(context.reposRoot, { recursive: true });
      await prepareIssueFiles(context.reposRoot, 'ai-workflow-agent', '555', {
        'metadata.json': '{ "issue_number": "555" }',
      });

      const workspaces = ['job-one', 'job-two', 'job-three'].map((suffix) => {
        const workspace = path.join(context.baseDir, suffix);
        return workspace;
      });

      await Promise.all(workspaces.map((workspace) => fs.promises.mkdir(workspace, { recursive: true })));

      // When three pipeline executions start concurrently
      // When three pipeline executions start concurrently
      const results = await Promise.all(
        workspaces.map((workspace) =>
          simulateArchiveArtifacts({
            reposRoot: context.reposRoot,
            workspace,
            issueNumber: '555',
          })
        )
      );

      // Then each concurrent execution archives its own data without interfering
      for (const result of results) {
        expect(result.stage).toBe('archived');
        expect(result.archivedPath).toBeDefined();
        expect(await pathExists(result.archivedPath!)).toBe(true);
      }

      const uniqueArchivedPaths = new Set(results.map((result) => result.archivedPath));
      expect(uniqueArchivedPaths.size).toBe(3);
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });

  test('IT-006: filesystem copy errors are logged but do not fail the pipeline', async () => {
    const context = await createSimulationContext('it-006');
    try {
      await prepareIssueFiles(context.reposRoot, 'ai-workflow-agent', '999', {
        'metadata.json': '{ "issue_number": "999" }',
      });

      // Given a simulated filesystem copy failure to mimic permissions issues
      // When the helper runs under simulated copy failure
      const result = await simulateArchiveArtifacts({
        reposRoot: context.reposRoot,
        workspace: context.workspace,
        issueNumber: '999',
        simulateCopyError: true,
      });

      // Then the copy failure is logged yet the rest of the flow reports success
      expect(result.stage).toBe('archived');
      expect(result.copyPerformed).toBe(false);
      expect(result.logs.some((line) => line.startsWith('[ERROR] Failed to copy artifacts'))).toBe(true);
      expect(result.archivedPath).toBeDefined();
      const archivedContents = await fs.promises.readdir(result.archivedPath!);
      expect(archivedContents.length).toBe(0);
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });

  test('IT-007: archived artifacts match the source files for download verification', async () => {
    const context = await createSimulationContext('it-007');
    try {
      await fs.promises.mkdir(context.reposRoot, { recursive: true });
      await prepareIssueFiles(context.reposRoot, 'ai-workflow-agent', '123', sampleIssue123Files);

      // Given the archived data should be available for download
      // When artifact download verification reads from the archived storage
      const result = await simulateArchiveArtifacts({
        reposRoot: context.reposRoot,
        workspace: context.workspace,
        issueNumber: '123',
      });

      // Then the archived directory matches all original file contents
      for (const [relativePath, expectedContent] of Object.entries(sampleIssue123Files)) {
        const archivedFile = path.join(result.archivedPath!, relativePath);
        const actual = await fs.promises.readFile(archivedFile, 'utf-8');
        expect(actual).toBe(expectedContent);
      }
    } finally {
      await cleanupSimulationContext(context.baseDir);
    }
  });
});
