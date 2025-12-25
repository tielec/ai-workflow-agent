/**
 * Integration tests for Issue #505: Jenkins webhook notifications to Lavable
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Jenkins DSL + Pipeline definitions)
 * Covered Scenarios: IT-001〜IT-018 (test-scenario.md)
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';

const projectRoot = path.resolve(import.meta.dirname, '../../..');

const JOB_DSL_PATHS = {
  allPhases: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
  preset: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy',
  singlePhase: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy',
  rollback: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy',
  autoIssue: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy',
  finalize: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy',
  prCommentExecute:
    'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy',
  prCommentFinalize:
    'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy',
} as const;

type JobKey = keyof typeof JOB_DSL_PATHS;

const PIPELINE_PATHS = {
  allPhases: 'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
  preset: 'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile',
  singlePhase: 'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile',
  rollback: 'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile',
  autoIssue: 'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile',
  finalize: 'jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile',
  prCommentExecute: 'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile',
  prCommentFinalize: 'jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile',
} as const;

type PipelineKey = keyof typeof PIPELINE_PATHS;

const dslContents: Record<JobKey, string> = {} as Record<JobKey, string>;
const pipelineContents: Record<PipelineKey, string> = {} as Record<PipelineKey, string>;
let commonContent = '';
let jenkinsReadme = '';

const loadDsl = async (jobKey: JobKey) => {
  const fullPath = path.join(projectRoot, JOB_DSL_PATHS[jobKey]);
  dslContents[jobKey] = await fs.readFile(fullPath, 'utf8');
};

const loadPipeline = async (pipelineKey: PipelineKey) => {
  const fullPath = path.join(projectRoot, PIPELINE_PATHS[pipelineKey]);
  pipelineContents[pipelineKey] = await fs.readFile(fullPath, 'utf8');
};

const getSendWebhookBlock = () => {
  const match = commonContent.match(/def sendWebhook[\s\S]*?\n}\s*\n\/\/ Groovy/);
  return match ? match[0] : commonContent;
};

beforeAll(async () => {
  await Promise.all([
    ...Object.keys(JOB_DSL_PATHS).map((jobKey) => loadDsl(jobKey as JobKey)),
    ...Object.keys(PIPELINE_PATHS).map((pipelineKey) => loadPipeline(pipelineKey as PipelineKey)),
  ]);

  commonContent = await fs.readFile(path.join(projectRoot, 'jenkins/shared/common.groovy'), 'utf8');
  jenkinsReadme = await fs.readFile(path.join(projectRoot, 'jenkins/README.md'), 'utf8');
});

describe('Integration: Jenkins webhook notifications (Issue #505)', () => {
  describe('IT-001〜IT-006: common.groovy sendWebhook implementation', () => {
    it('defines sendWebhook with the expected signature', () => {
      expect(commonContent).toMatch(
        /def sendWebhook\(String jobId, String webhookUrl, String webhookToken, String status, String errorMessage = ''\)/
      );
    });

    it('skips when webhook parameters are missing and logs the reason', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if \(!webhookUrl\?\.\s*trim\(\) \|\| !webhookToken\?\.\s*trim\(\) \|\| !jobId\?\.\s*trim\(\)\)/
      );
      expect(sendWebhookBlock).toMatch(/Webhook parameters not provided, skipping notification/);
    });

    it('posts JSON payloads via HTTP Request Plugin with required settings', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toContain('httpRequest');
      expect(sendWebhookBlock).toMatch(/httpMode:\s*'POST'/);
      expect(sendWebhookBlock).toMatch(/contentType:\s*'APPLICATION_JSON'/);
      expect(sendWebhookBlock).toMatch(
        /customHeaders:\s*\[\[name:\s*'X-Webhook-Token',\s*value:\s*webhookToken\]\]/
      );
      expect(sendWebhookBlock).toMatch(/validResponseCodes:\s*'200:299'/);
      expect(sendWebhookBlock).toMatch(/timeout:\s*30/);
    });

    it('catches webhook failures without aborting the build', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(/try\s*\{/);
      expect(sendWebhookBlock).toMatch(/catch\s*\(Exception e\)/);
      expect(sendWebhookBlock).toMatch(/Failed to send webhook/);
      expect(sendWebhookBlock).not.toMatch(/throw\s+e|error\s*\(/);
    });

    it('constructs payloads with job_id, status, and optional error fields', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(/\{"job_id": "\$\{jobId\}", "status": "\$\{status\}"\}/);
      expect(sendWebhookBlock).toMatch(/"error": "\$\{errorMessage\}"/);
    });

    it('logs successful webhook delivery with the status value', () => {
      expect(getSendWebhookBlock()).toMatch(/Webhook sent successfully: \${status}/);
    });
  });

  describe('IT-007〜IT-010, IT-016: Job DSL parameter definitions', () => {
    it('defines JOB_ID as a string parameter across all Job DSLs', () => {
      Object.values(dslContents).forEach((content) => {
        expect(content).toContain("stringParam('JOB_ID'");
      });
    });

    it('secures WEBHOOK_URL with nonStoredPasswordParam and avoids stringParam', () => {
      Object.values(dslContents).forEach((content) => {
        expect(content).toContain("nonStoredPasswordParam('WEBHOOK_URL'");
        expect(content).not.toMatch(/stringParam\('WEBHOOK_URL'/);
      });
    });

    it('secures WEBHOOK_TOKEN with nonStoredPasswordParam and avoids stringParam', () => {
      Object.values(dslContents).forEach((content) => {
        expect(content).toContain("nonStoredPasswordParam('WEBHOOK_TOKEN'");
        expect(content).not.toMatch(/stringParam\('WEBHOOK_TOKEN'/);
      });
    });

    it('documents webhook parameters for operators', () => {
      Object.values(dslContents).forEach((content) => {
        expect(content).toMatch(/Lavable Job ID/);
        expect(content).toMatch(/Webhookエンドポイント URL/);
        expect(content).toMatch(/Webhook認証トークン/);
      });
    });

    it('keeps existing retention and core parameters intact', () => {
      const retentionPattern =
        /logRotator\s*\{[\s\S]*numToKeep\(\s*30\s*\)[\s\S]*daysToKeep\(\s*90\s*\)/;

      Object.entries(dslContents).forEach(([jobKey, content]) => {
        expect(content).toMatch(retentionPattern);
        expect(content).toMatch(/GITHUB_TOKEN/);

        const hasPrParam = /PR_URL/.test(content);
        const hasIssueParam = /ISSUE_URL/.test(content);
        const hasRepoParam = /GITHUB_REPOSITORY/.test(content);
        expect(hasPrParam || hasIssueParam || hasRepoParam).toBe(true);

        if (jobKey !== 'prCommentFinalize' && !hasPrParam) {
          expect(content).toMatch(/AGENT_MODE/);
        }
      });
    });
  });

  describe('IT-011〜IT-015, IT-017: Jenkinsfile webhook integration', () => {
    it('loads the shared common.groovy library in every Jenkinsfile', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/load 'jenkins\/shared\/common.groovy'/);
      });
    });

    it('sends running status after loading the common library', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/sendWebhook\([\s\S]*'running'/);
      });
    });

    it('sends success status inside post.success blocks', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/success\s*\{[\s\S]*sendWebhook\([\s\S]*'success'/);
      });
    });

    it('sends failed status with an error payload inside post.failure blocks', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/failure\s*\{[\s\S]*sendWebhook\([\s\S]*'failed'/);
        expect(content).toMatch(/sendWebhook\([\s\S]*'failed'[\s\S]*(errorMessage|currentBuild\.result)/);
      });
    });

    it('passes webhook parameters from params.* for every invocation', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/params\.JOB_ID/);
        expect(content).toMatch(/params\.WEBHOOK_URL/);
        expect(content).toMatch(/params\.WEBHOOK_TOKEN/);
      });
    });

    it('retains expected stage scaffolding', () => {
      const pipelinesRequiringAgentSetup = Object.entries(pipelineContents).filter(
        ([key]) => key !== 'prCommentFinalize'
      );

      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/stage\('Load Common Library'\)/);
        expect(content).toMatch(/stage\('Setup Environment'\)/);
      });

      pipelinesRequiringAgentSetup.forEach(([, content]) => {
        expect(content).toMatch(/stage\('Prepare Agent Credentials'\)/);
      });
    });
  });

  describe('IT-018: Documentation updates', () => {
    it('documents webhook parameters and plugin prerequisites in jenkins/README.md', () => {
      expect(jenkinsReadme).toMatch(/Webhook通知/);
      expect(jenkinsReadme).toMatch(/JOB_ID/);
      expect(jenkinsReadme).toMatch(/WEBHOOK_URL/);
      expect(jenkinsReadme).toMatch(/WEBHOOK_TOKEN/);
      expect(jenkinsReadme).toMatch(/HTTP Request Plugin/);
    });
  });
});
