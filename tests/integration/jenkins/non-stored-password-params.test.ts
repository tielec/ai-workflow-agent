/**
 * Integration tests for Issue #462: Non-stored password parameters for sensitive Jenkins DSL inputs
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Job DSL files)
 * Covered Scenarios: IT-001〜IT-015 (seed job reapply + parameter definition/UI/log/DRY_RUN checks)
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

const projectRoot = path.resolve(import.meta.dirname, '../../..');

const JOB_DSL_PATHS = {
  allPhases: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
  preset: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy',
  singlePhase: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy',
  rollback: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy',
  finalize: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy',
  autoIssue: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy',
  autoCloseIssue: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_close_issue_job.groovy',
  validateCredentials: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_validate_credentials_job.groovy',
  prCommentExecute:
    'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy',
  prCommentFinalize:
    'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy',
  rewriteIssue: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_rewrite_issue_job.groovy',
  ecrBuild: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_ecr_build_job.groovy',
  resolveConflict: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_resolve_conflict_job.groovy',
} as const;

type JobKey = keyof typeof JOB_DSL_PATHS;

const PIPELINE_PATHS = {
  allPhases: 'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
  prCommentExecute: 'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile',
  prCommentFinalize: 'jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile',
  validateCredentials: 'jenkins/jobs/pipeline/ai-workflow/validate-credentials/Jenkinsfile',
} as const;

type PipelineKey = keyof typeof PIPELINE_PATHS;

const SEED_JOB_PATHS = {
  pipeline: 'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/Jenkinsfile',
  jobConfig: 'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml',
  folderConfig: 'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/folder-config.yaml',
  foldersDsl: 'jenkins/jobs/dsl/folders.groovy',
} as const;

const EXPECTED_SEED_JOB_KEYS = [
  'ai_workflow_all_phases_job',
  'ai_workflow_preset_job',
  'ai_workflow_single_phase_job',
  'ai_workflow_rollback_job',
  'ai_workflow_finalize_job',
  'ai_workflow_auto_issue_job',
  'ai_workflow_auto_close_issue_job',
  'ai_workflow_validate_credentials_job',
  'ai_workflow_pr_comment_execute_job',
  'ai_workflow_pr_comment_finalize_job',
  'ai_workflow_rewrite_issue_job',
  'ai_workflow_ecr_build_job',
  'ai_workflow_resolve_conflict_job',
] as const;

const SEED_JOB_KEY_TO_PATH: Record<(typeof EXPECTED_SEED_JOB_KEYS)[number], string> = {
  ai_workflow_all_phases_job: JOB_DSL_PATHS.allPhases,
  ai_workflow_preset_job: JOB_DSL_PATHS.preset,
  ai_workflow_single_phase_job: JOB_DSL_PATHS.singlePhase,
  ai_workflow_rollback_job: JOB_DSL_PATHS.rollback,
  ai_workflow_finalize_job: JOB_DSL_PATHS.finalize,
  ai_workflow_auto_issue_job: JOB_DSL_PATHS.autoIssue,
  ai_workflow_auto_close_issue_job: JOB_DSL_PATHS.autoCloseIssue,
  ai_workflow_validate_credentials_job: JOB_DSL_PATHS.validateCredentials,
  ai_workflow_pr_comment_execute_job: JOB_DSL_PATHS.prCommentExecute,
  ai_workflow_pr_comment_finalize_job: JOB_DSL_PATHS.prCommentFinalize,
  ai_workflow_rewrite_issue_job: JOB_DSL_PATHS.rewriteIssue,
  ai_workflow_ecr_build_job: JOB_DSL_PATHS.ecrBuild,
  ai_workflow_resolve_conflict_job: JOB_DSL_PATHS.resolveConflict,
};

const dslContents: Record<JobKey, string> = {} as Record<JobKey, string>;
const pipelineContents: Record<PipelineKey, string> = {} as Record<PipelineKey, string>;
let commonSharedContent = '';
let seedJobPipeline = '';
let seedJobConfig: Record<string, any> = {};
let seedFolderConfig: Record<string, any> = {};
let seedFoldersDsl = '';

const loadDsl = async (jobKey: JobKey) => {
  const fullPath = path.join(projectRoot, JOB_DSL_PATHS[jobKey]);
  dslContents[jobKey] = await fs.readFile(fullPath, 'utf8');
};

const loadPipeline = async (pipelineKey: PipelineKey) => {
  const fullPath = path.join(projectRoot, PIPELINE_PATHS[pipelineKey]);
  pipelineContents[pipelineKey] = await fs.readFile(fullPath, 'utf8');
};

const expectParamSecured = (jobKey: JobKey, paramName: string) => {
  const content = dslContents[jobKey];

  // Given: Job DSL content is loaded
  expect(content).toBeDefined();

  // Then: Target parameter is defined as nonStoredPasswordParam and not as string/text param
  expect(content).toContain(`nonStoredPasswordParam('${paramName}'`);
  expect(content).not.toMatch(new RegExp(`stringParam\\('${paramName}'`));
  expect(content).not.toMatch(new RegExp(`textParam\\('${paramName}'`));
};

const expectDefaultDocumented = (jobKey: JobKey, paramName: string, defaultText: string) => {
  const content = dslContents[jobKey];
  const defaultPattern = new RegExp(
    `nonStoredPasswordParam\\('${paramName}'[\\s\\S]*${defaultText}`
  );

  // Then: Description still documents the prior default value for operator awareness
  expect(content).toMatch(defaultPattern);
};

const expectCodexAuthCaution = (jobKey: JobKey) => {
  const content = dslContents[jobKey];
  const cautionPattern =
    /CODEX_AUTH_JSON[\s\S]*注意:\s*入力フィールドが単一行のパスワード形式に変更されます/;

  // Then: UI change note is present so users know the input format differs from textParam
  expect(content).toMatch(cautionPattern);
};

const expectNoDescriptionLeakage = (pipelineKey: PipelineKey, paramNames: string[]) => {
  const content = pipelineContents[pipelineKey];
  paramNames.forEach((paramName) => {
    const descriptionPattern = new RegExp(
      `currentBuild\\.description[^\\n]*params\\.${paramName}`,
      'i'
    );
    expect(content).not.toMatch(descriptionPattern);
  });
};

const expectDryRunGuardrails = (pipelineKey: PipelineKey) => {
  const content = pipelineContents[pipelineKey];

  // DRY_RUN should be consulted and plumbed through command flags or labels
  expect(content).toMatch(/params\.DRY_RUN/);
  expect(content).toMatch(/--dry-run|\[DRY RUN]/);
};

const expectJobRetentionPreserved = (jobKey: JobKey) => {
  const content = dslContents[jobKey];
  const retentionPattern =
    /logRotator\s*\{\s*[\s\S]*numToKeep\(\s*30\s*\)[\s\S]*daysToKeep\(\s*90\s*\)/;

  // Then: Existing build history retention settings remain intact
  expect(content).toMatch(retentionPattern);
};

const ALL_PHASES_SENSITIVE_PARAMS = [
  'ISSUE_URL',
  'BRANCH_NAME',
  'BASE_BRANCH',
  'GIT_COMMIT_USER_NAME',
  'GIT_COMMIT_USER_EMAIL',
  'CODEX_AUTH_JSON',
] as const;

const SENSITIVE_SAMPLE_VALUES = [
  'https://github.com/tielec/test-repo/issues/999',
  'test-branch-999',
  'Test User',
  'test@example.com',
  '{"test": "value"}',
];

describe('Integration: Sensitive Jenkins parameters use nonStoredPasswordParam (Issue #462)', () => {
  beforeAll(async () => {
    await Promise.all([
      ...Object.keys(JOB_DSL_PATHS).map((jobKey) => loadDsl(jobKey as JobKey)),
      ...Object.keys(PIPELINE_PATHS).map((pipelineKey) =>
        loadPipeline(pipelineKey as PipelineKey)
      ),
    ]);
    const sharedPath = path.join(projectRoot, 'jenkins/shared/common.groovy');
    commonSharedContent = await fs.readFile(sharedPath, 'utf8');
    seedJobPipeline = await fs.readFile(path.join(projectRoot, SEED_JOB_PATHS.pipeline), 'utf8');
    seedJobConfig = yaml.parse(
      await fs.readFile(path.join(projectRoot, SEED_JOB_PATHS.jobConfig), 'utf8')
    );
    seedFolderConfig = yaml.parse(
      await fs.readFile(path.join(projectRoot, SEED_JOB_PATHS.folderConfig), 'utf8')
    );
    seedFoldersDsl = await fs.readFile(path.join(projectRoot, SEED_JOB_PATHS.foldersDsl), 'utf8');
  });

  describe('IT-001: Job DSL seed job reapplication completes without errors', () => {
    it('lists all AI Workflow jobs with valid DSL paths for the seed job execution', () => {
      const jobConfig = seedJobConfig['jenkins-jobs'] ?? {};
      const aiWorkflowJobs = Object.entries(jobConfig).filter(([key]) =>
        key.startsWith('ai_workflow_')
      );
      const aiWorkflowJobKeys = aiWorkflowJobs.map(([key]) => key);

      expect(aiWorkflowJobs).toHaveLength(EXPECTED_SEED_JOB_KEYS.length);
      expect(aiWorkflowJobKeys.sort()).toEqual([...EXPECTED_SEED_JOB_KEYS].sort());

      aiWorkflowJobs.forEach(([jobKey, jobDef]) => {
        const expectedDslPath = SEED_JOB_KEY_TO_PATH[jobKey as keyof typeof SEED_JOB_KEY_TO_PATH];
        expect(jobDef.dslfile).toBe(expectedDslPath);
        expect(fs.existsSync(path.join(projectRoot, expectedDslPath))).toBe(true);
      });
    });

    it('keeps the seed pipeline configured to reapply DSL definitions with cleanup', () => {
      expect(seedJobPipeline).toMatch(/jobDsl\(/);
      expect(seedJobPipeline).toMatch(/removedJobAction: 'DELETE'/);
      expect(seedJobPipeline).toMatch(/removedViewAction: 'DELETE'/);
      expect(seedJobPipeline).toMatch(/AI Workflow seed job completed successfully!/);
    });

    it('provides all validation inputs so the seed job run will not raise errors', () => {
      expect(fs.existsSync(path.join(projectRoot, SEED_JOB_PATHS.folderConfig))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, SEED_JOB_PATHS.foldersDsl))).toBe(true);
      const folderCount = (seedFolderConfig.folders ?? []).length;
      expect(folderCount).toBeGreaterThan(0);
      expect(seedFoldersDsl).toContain('folder');
    });
  });

  describe('IT-002: ISSUE_URL is secured as non-stored password', () => {
    it.each<JobKey>(['allPhases', 'preset', 'singlePhase', 'rollback', 'finalize'])(
      'uses nonStoredPasswordParam for ISSUE_URL in %s',
      (jobKey) => {
        expectParamSecured(jobKey, 'ISSUE_URL');
        expect(dslContents[jobKey]).toMatch(/GitHub Issue URL/);
      }
    );
  });

  describe('IT-003: PR_URL is secured as non-stored password', () => {
    it.each<JobKey>(['prCommentExecute', 'prCommentFinalize'])(
      'uses nonStoredPasswordParam for PR_URL in %s',
      (jobKey) => {
        expectParamSecured(jobKey, 'PR_URL');
        expect(dslContents[jobKey]).toMatch(/Pull Request URL/);
      }
    );
  });

  describe('IT-004: BRANCH_NAME is masked and not persisted', () => {
    it.each<JobKey>(['allPhases', 'preset', 'singlePhase', 'rollback', 'finalize'])(
      'uses nonStoredPasswordParam for BRANCH_NAME in %s',
      (jobKey) => {
        expectParamSecured(jobKey, 'BRANCH_NAME');
        expect(dslContents[jobKey]).toMatch(/作業ブランチ名/);
      }
    );
  });

  describe('IT-005: BASE_BRANCH avoids stringParam in applicable jobs', () => {
    it.each<JobKey>(['allPhases', 'preset', 'singlePhase', 'finalize'])(
      'uses nonStoredPasswordParam for BASE_BRANCH in %s',
      (jobKey) => {
        expectParamSecured(jobKey, 'BASE_BRANCH');
        expect(dslContents[jobKey]).toMatch(/ベースブランチ/);
      }
    );
  });

  describe('IT-006: GIT_COMMIT_USER_NAME retains default info while using non-stored param', () => {
    it.each<JobKey>([
      'allPhases',
      'preset',
      'singlePhase',
      'rollback',
      'finalize',
      'prCommentExecute',
      'prCommentFinalize',
    ])('defines GIT_COMMIT_USER_NAME as masked param in %s', (jobKey) => {
      expectParamSecured(jobKey, 'GIT_COMMIT_USER_NAME');
      expectDefaultDocumented(jobKey, 'GIT_COMMIT_USER_NAME', 'デフォルト値: AI Workflow Bot');
    });
  });

  describe('IT-007: GIT_COMMIT_USER_EMAIL retains default info while using non-stored param', () => {
    it.each<JobKey>([
      'allPhases',
      'preset',
      'singlePhase',
      'rollback',
      'finalize',
      'prCommentExecute',
      'prCommentFinalize',
    ])('defines GIT_COMMIT_USER_EMAIL as masked param in %s', (jobKey) => {
      expectParamSecured(jobKey, 'GIT_COMMIT_USER_EMAIL');
      expectDefaultDocumented(jobKey, 'GIT_COMMIT_USER_EMAIL', 'デフォルト値: ai-workflow@example.com');
    });
  });

  describe('IT-008: CODEX_AUTH_JSON uses nonStoredPasswordParam with caution note', () => {
    it.each<JobKey>([
      'allPhases',
      'preset',
      'singlePhase',
      'rollback',
      'finalize',
      'autoIssue',
      'prCommentExecute',
      'prCommentFinalize',
      'resolveConflict',
    ])('defines CODEX_AUTH_JSON securely in %s', (jobKey) => {
      expectParamSecured(jobKey, 'CODEX_AUTH_JSON');
      expectCodexAuthCaution(jobKey);
    });
  });

  describe('IT-009: UI renders masked password fields for sensitive parameters', () => {
    it('ensures all sensitive inputs on all-phases job use nonStoredPasswordParam', () => {
      ALL_PHASES_SENSITIVE_PARAMS.forEach((paramName) => {
        expectParamSecured('allPhases', paramName);
      });
      expectCodexAuthCaution('allPhases');
    });
  });

  describe('IT-010: Build history does not persist sensitive parameter values', () => {
    it('avoids embedding sensitive params in build descriptions that are persisted', () => {
      expectNoDescriptionLeakage('allPhases', [
        'ISSUE_URL',
        'BRANCH_NAME',
        'BASE_BRANCH',
        'GIT_COMMIT_USER_NAME',
        'GIT_COMMIT_USER_EMAIL',
        'CODEX_AUTH_JSON',
      ]);
    });
  });

  describe('IT-011: Console logs avoid plain-text exposure of provided secrets', () => {
    it('never checks in sample secret values that would leak in logs', () => {
      const repositoryText = Object.values(pipelineContents).join('\n');
      SENSITIVE_SAMPLE_VALUES.forEach((sample) => {
        expect(repositoryText).not.toContain(sample);
      });
    });

    it('references sensitive params through Jenkins params.* so masking can apply', () => {
      const content = pipelineContents.allPhases + commonSharedContent;
      ALL_PHASES_SENSITIVE_PARAMS.forEach((paramName) => {
        expect(content).toMatch(new RegExp(`params\\.${paramName}`));
      });
    });
  });

  describe('IT-012: DRY_RUN mode executes safely without real side effects', () => {
    it('short-circuits destructive steps when DRY_RUN is enabled', () => {
      expectDryRunGuardrails('allPhases');
    });
  });

  describe('IT-013: Parameter descriptions remain visible after type change', () => {
    it('keeps descriptive help text for all sensitive parameters', () => {
      expect(dslContents.allPhases).toMatch(/ISSUE_URL（必須）: GitHub Issue URL/);
      expect(dslContents.allPhases).toMatch(/作業ブランチ名（任意）/);
      expect(dslContents.allPhases).toMatch(/ベースブランチ（任意）/);
      expectDefaultDocumented('allPhases', 'GIT_COMMIT_USER_NAME', 'デフォルト値: AI Workflow Bot');
      expectDefaultDocumented(
        'allPhases',
        'GIT_COMMIT_USER_EMAIL',
        'デフォルト値: ai-workflow@example.com'
      );
      expect(dslContents.allPhases).toMatch(/Codex auth\.json の内容（任意）/);
    });
  });

  describe('IT-014: Existing build history remains accessible', () => {
    it.each<JobKey>(Object.keys(JOB_DSL_PATHS) as JobKey[])(
      'retains log rotation settings in %s',
      (jobKey) => {
        expectJobRetentionPreserved(jobKey);
      }
    );
  });

  describe('IT-015: PR comment jobs respect secured PR_URL parameter', () => {
    it('keeps PR_URL masked and flows through pipeline steps (execute)', () => {
      expectParamSecured('prCommentExecute', 'PR_URL');
      expectNoDescriptionLeakage('prCommentExecute', ['PR_URL']);
      expect(pipelineContents.prCommentExecute).toMatch(/--pr-url \${params.PR_URL}/);
      expectDryRunGuardrails('prCommentExecute');
    });

    it('keeps PR_URL masked and flows through pipeline steps (finalize)', () => {
      expectParamSecured('prCommentFinalize', 'PR_URL');
      expectNoDescriptionLeakage('prCommentFinalize', ['PR_URL']);
      expect(pipelineContents.prCommentFinalize).toMatch(/--pr-url \${params.PR_URL}/);
      expectDryRunGuardrails('prCommentFinalize');
    });
  });
});
