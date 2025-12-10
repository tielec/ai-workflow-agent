/**
 * Integration tests for Issue #393: PR comment Jenkins jobs (execute/finalize)
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Job DSL, Jenkinsfiles, and seed config)
 * Covered Scenarios: TC-001〜TC-005, TC-008〜TC-013, TC-017〜TC-018
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

describe('Integration: PR Comment Jenkins jobs (Issue #393)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const paths = {
    executeDsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy'
    ),
    finalizeDsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy'
    ),
    executeJenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile'
    ),
    finalizeJenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile'
    ),
    jobConfig: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
    ),
  };

  let executeDsl: string;
  let finalizeDsl: string;
  let executeJenkinsfile: string;
  let finalizeJenkinsfile: string;
  let jobConfig: Record<string, unknown>;

  beforeAll(async () => {
    const [executeDslContent, finalizeDslContent, executeJfContent, finalizeJfContent, jobConfigRaw] =
      await Promise.all([
        fs.readFile(paths.executeDsl, 'utf8'),
        fs.readFile(paths.finalizeDsl, 'utf8'),
        fs.readFile(paths.executeJenkinsfile, 'utf8'),
        fs.readFile(paths.finalizeJenkinsfile, 'utf8'),
        fs.readFile(paths.jobConfig, 'utf8'),
      ]);

    executeDsl = executeDslContent;
    finalizeDsl = finalizeDslContent;
    executeJenkinsfile = executeJfContent;
    finalizeJenkinsfile = finalizeJfContent;
    jobConfig = yaml.parse(jobConfigRaw) as Record<string, unknown>;
  });

  describe('TC-003: Jenkinsfile presence and scriptPath wiring', () => {
    it('references the correct Jenkinsfiles from both DSL definitions', () => {
      expect(executeDsl).toContain(
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile')"
      );
      expect(finalizeDsl).toContain(
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile')"
      );
    });

    it('has the referenced Jenkinsfiles on disk', async () => {
      await expect(fs.pathExists(paths.executeJenkinsfile)).resolves.toBe(true);
      await expect(fs.pathExists(paths.finalizeJenkinsfile)).resolves.toBe(true);
    });
  });

  describe('TC-001/TC-002/TC-008/TC-009: DSL parameter definitions', () => {
    it('defines required execute parameters including API keys and batch/agent options', () => {
      // Issue #407: Changed from PR_NUMBER + GITHUB_REPOSITORY to PR_URL
      const requiredExecuteParams = [
        'EXECUTION_MODE',
        'PR_URL',
        'AGENT_MODE',
        'DRY_RUN',
        'BATCH_SIZE',
        'GIT_COMMIT_USER_NAME',
        'GIT_COMMIT_USER_EMAIL',
        'GITHUB_TOKEN',
        'OPENAI_API_KEY',
        'CODEX_API_KEY',
        'CODEX_AUTH_JSON',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_API_KEY',
        'ANTHROPIC_API_KEY',
      ];

      for (const param of requiredExecuteParams) {
        expect(executeDsl).toMatch(new RegExp(param));
      }
    });

    it('defines required finalize parameters and omits agent/batch-only settings', () => {
      // Issue #407: Changed from PR_NUMBER + GITHUB_REPOSITORY to PR_URL
      const requiredFinalizeParams = [
        'EXECUTION_MODE',
        'PR_URL',
        'DRY_RUN',
        'GIT_COMMIT_USER_NAME',
        'GIT_COMMIT_USER_EMAIL',
        'GITHUB_TOKEN',
        'OPENAI_API_KEY',
        'CODEX_API_KEY',
        'CODEX_AUTH_JSON',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_API_KEY',
        'ANTHROPIC_API_KEY',
      ];

      for (const param of requiredFinalizeParams) {
        expect(finalizeDsl).toMatch(new RegExp(param));
      }

      // Finalize job should not expose execute-only parameters.
      expect(finalizeDsl).not.toMatch(/AGENT_MODE/);
      expect(finalizeDsl).not.toMatch(/BATCH_SIZE/);
    });
  });

  describe('TC-003/TC-007: Folder expansion and environment settings', () => {
    it('expands generic folders for develop and stable-* across both DSL files', () => {
      expect(executeDsl).toMatch(/develop.*AI Workflow Executor - Develop/);
      expect(executeDsl).toMatch(/stable-\$\{i\}.*AI Workflow Executor - Stable/);
      expect(finalizeDsl).toMatch(/develop.*AI Workflow Executor - Develop/);
      expect(finalizeDsl).toMatch(/stable-\$\{i\}.*AI Workflow Executor - Stable/);
    });

    it('pins EXECUTION_MODE environment variables for each job', () => {
      expect(executeDsl).toMatch(/env\('EXECUTION_MODE', 'pr_comment_execute'\)/);
      expect(finalizeDsl).toMatch(/env\('EXECUTION_MODE', 'pr_comment_finalize'\)/);
    });
  });

  describe('TC-003/TC-010/TC-011: Jenkinsfile stage structure and commands', () => {
    it('contains the expected eight-stage flow for execute', () => {
      const stages = Array.from(executeJenkinsfile.matchAll(/stage\('([^']+)'\)/g)).map(
        (match) => match[1]
      );
      const expectedStages = [
        'Load Common Library',
        'Prepare Codex auth.json',
        'Prepare Agent Credentials',
        'Validate Parameters',
        'Setup Environment',
        'Setup Node.js Environment',
        'PR Comment Init',
        'PR Comment Execute',
      ];

      expect(stages).toEqual(expectedStages);
    });

    it('contains the expected five-stage flow for finalize', () => {
      const stages = Array.from(finalizeJenkinsfile.matchAll(/stage\('([^']+)'\)/g)).map(
        (match) => match[1]
      );
      const expectedStages = [
        'Load Common Library',
        'Validate Parameters',
        'Setup Environment',
        'Setup Node.js Environment',
        'PR Comment Finalize',
      ];

      expect(stages).toEqual(expectedStages);
    });

    it('invokes pr-comment init/execute/finalize commands with PR URL context', () => {
      // Issue #407: Changed from --pr ${params.PR_NUMBER} to --pr-url ${params.PR_URL}
      expect(executeJenkinsfile).toMatch(/pr-comment init[\s\S]*--pr-url \${params\.PR_URL}/);
      expect(executeJenkinsfile).toMatch(/pr-comment execute[\s\S]*--agent \${params\.AGENT_MODE \?: 'auto'}/);
      expect(executeJenkinsfile).toMatch(/def batchSizeFlag\s*=\s*params\.BATCH_SIZE\s*\?\s*"--batch-size \${params\.BATCH_SIZE}"/);
      expect(executeJenkinsfile).toMatch(/pr-comment execute[\s\S]*\${batchSizeFlag}/);
      expect(finalizeJenkinsfile).toMatch(/pr-comment finalize[\s\S]*--pr-url \${params\.PR_URL}/);
    });
  });

  describe('TC-012/TC-013/TC-014/TC-015: Validation and dry-run labeling', () => {
    it('validates required parameters and labels builds with [DRY RUN]', () => {
      expect(executeJenkinsfile).toMatch(/PR_URL parameter is required/);
      expect(finalizeJenkinsfile).toMatch(/PR_URL parameter is required/);

      expect(executeJenkinsfile).toMatch(/\[DRY RUN\]/);
      expect(finalizeJenkinsfile).toMatch(/\[DRY RUN\]/);
    });
  });

  describe('TC-017/TC-018: Post-processing and artifacts', () => {
    it('archives PR-scoped artifacts and cleans workspace/REPOS_ROOT', () => {
      const artifactPattern = /\.ai-workflow\/pr-\$\{env\.PR_NUMBER\}\/\*\*\/\*/;
      expect(executeJenkinsfile).toMatch(artifactPattern);
      expect(finalizeJenkinsfile).toMatch(artifactPattern);

      expect(executeJenkinsfile).toMatch(/cleanWs\(\)/);
      expect(finalizeJenkinsfile).toMatch(/cleanWs\(\)/);
      expect(executeJenkinsfile).toMatch(/REPOS_ROOT cleaned up/);
      expect(finalizeJenkinsfile).toMatch(/REPOS_ROOT cleaned up/);
    });
  });

  describe('TC-004/TC-005: Seed job configuration', () => {
    it('parses job-config.yaml and registers both PR comment jobs with DSL paths', () => {
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const executeEntry = jobs['ai_workflow_pr_comment_execute_job'];
      const finalizeEntry = jobs['ai_workflow_pr_comment_finalize_job'];

      expect(executeEntry).toMatchObject({
        name: 'pr_comment_execute',
        displayName: 'PR Comment Execute',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy',
        jenkinsfile: 'Jenkinsfile',
        skipJenkinsfileValidation: true,
      });

      expect(finalizeEntry).toMatchObject({
        name: 'pr_comment_finalize',
        displayName: 'PR Comment Finalize',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy',
        jenkinsfile: 'Jenkinsfile',
        skipJenkinsfileValidation: true,
      });
    });
  });
});
