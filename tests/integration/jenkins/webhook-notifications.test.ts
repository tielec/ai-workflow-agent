/**
 * Integration tests for Issue #512: Jenkins webhook notifications to Lavable
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Jenkins DSL + Pipeline definitions)
 * Covered Scenarios: IT-001〜IT-018 (existing) + IT-019〜IT-035 (test-scenario.md)
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

const extractInvocationBlock = (content: string, status: 'running' | 'success' | 'failed') => {
  const invocations = Array.from(content.matchAll(/sendWebhook\s*\(\s*\[[\s\S]*?\]\s*\)/g));
  const match = invocations.find(({ 0: block }) =>
    new RegExp(`status:\\s*['"]${status}['"]`).test(block)
  );

  return match ? match[0] : '';
};

beforeAll(async () => {
  await Promise.all([
    ...Object.keys(JOB_DSL_PATHS).map((jobKey) => loadDsl(jobKey as JobKey)),
    ...Object.keys(PIPELINE_PATHS).map((pipelineKey) => loadPipeline(pipelineKey as PipelineKey)),
  ]);

  commonContent = await fs.readFile(path.join(projectRoot, 'jenkins/shared/common.groovy'), 'utf8');
  jenkinsReadme = await fs.readFile(path.join(projectRoot, 'jenkins/README.md'), 'utf8');
}, 30000);

describe('Integration: Jenkins webhook notifications (Issue #512)', () => {
  describe('IT-019〜IT-026, IT-033: common.groovy sendWebhook implementation', () => {
    it('defines sendWebhook with a Map config signature (IT-019) and removes the positional signature', () => {
      expect(commonContent).toMatch(/def sendWebhook\s*\(\s*Map\s+config\s*\)/);
      expect(commonContent).not.toMatch(/def sendWebhook\(String jobId/);
    });

    it('validates required webhook parameters before sending', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if\s*\(\s*!config\?\.\s*status\?\.\s*trim\(\)\s*\|\|\s*!config\.webhookUrl\?\.\s*trim\(\)\s*\|\|\s*!config\.webhookToken\?\.\s*trim\(\)\s*\|\|\s*!config\.jobId\?\.\s*trim\(\)\s*\)/
      );
      expect(sendWebhookBlock).toMatch(/Webhook parameters not provided, skipping notification/);
    });

    it('constructs payload as a Groovy Map literal with job_id and status (IT-033)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /def\s+payload\s*=\s*\[[\s\S]*job_id:\s*config\.jobId[\s\S]*status:\s*config\.status[\s\S]*\]/
      );
    });

    it('conditionally adds build_url to the payload when provided (IT-020)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if\s*\(\s*config\.buildUrl\?\.trim\(\)\s*\)\s*\{[\s\S]*payload\.build_url\s*=\s*config\.buildUrl/
      );
    });

    it('conditionally adds branch_name to the payload when provided (IT-021)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if\s*\(\s*config\.branchName\?\.trim\(\)\s*\)\s*\{[\s\S]*payload\.branch_name\s*=\s*config\.branchName/
      );
    });

    it('conditionally adds pr_url to the payload when provided (IT-022)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if\s*\(\s*config\.prUrl\?\.trim\(\)\s*\)\s*\{[\s\S]*payload\.pr_url\s*=\s*config\.prUrl/
      );
    });

    it('conditionally adds finished_at to the payload when provided (IT-023)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if\s*\(\s*config\.finishedAt\?\.trim\(\)\s*\)\s*\{[\s\S]*payload\.finished_at\s*=\s*config\.finishedAt/
      );
    });

    it('conditionally adds logs_url to the payload when provided (IT-024)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(
        /if\s*\(\s*config\.logsUrl\?\.trim\(\)\s*\)\s*\{[\s\S]*payload\.logs_url\s*=\s*config\.logsUrl/
      );
    });

    it('guards all optional fields with trim checks before adding them (IT-025)', () => {
      const sendWebhookBlock = getSendWebhookBlock();
      const optionalFields = ['errorMessage', 'buildUrl', 'branchName', 'prUrl', 'finishedAt', 'logsUrl'];

      optionalFields.forEach((field) => {
        expect(sendWebhookBlock).toMatch(
          new RegExp(`if\\s*\\(\\s*config\\.${field}\\?\\.trim\\(\\)\\s*\\)`)
        );
      });
    });

    it('uses JsonOutput.toJson for payload serialization (IT-026)', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toMatch(/groovy\.json\.JsonOutput\.toJson\s*\(\s*payload\s*\)/);
    });

    it('posts JSON payloads via HTTP Request Plugin with required settings', () => {
      const sendWebhookBlock = getSendWebhookBlock();

      expect(sendWebhookBlock).toContain('httpRequest');
      expect(sendWebhookBlock).toMatch(/url:\s*config\.webhookUrl/);
      expect(sendWebhookBlock).toMatch(/httpMode:\s*'POST'/);
      expect(sendWebhookBlock).toMatch(/contentType:\s*'APPLICATION_JSON'/);
      expect(sendWebhookBlock).toMatch(
        /customHeaders:\s*\[\[name:\s*'X-Webhook-Token',\s*value:\s*config\.webhookToken\]\]/
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

    it('logs successful webhook delivery with the status value', () => {
      expect(getSendWebhookBlock()).toMatch(/Webhook sent successfully: \${config\.status}/);
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

  describe('IT-027〜IT-032: Jenkinsfile webhook integration', () => {
    it('loads the shared common.groovy library in every Jenkinsfile', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/load 'jenkins\/shared\/common.groovy'/);
      });
    });

    it('uses Map-style sendWebhook invocations and no positional signature (IT-032)', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/sendWebhook\s*\(\s*\[/);
        expect(content).not.toMatch(/sendWebhook\s*\(\s*params\.JOB_ID\s*,\s*params\.WEBHOOK_URL/);
      });
    });

    it('passes webhook parameters from params.* for every invocation', () => {
      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(/jobId:\s*params\.JOB_ID/);
        expect(content).toMatch(/webhookUrl:\s*params\.WEBHOOK_URL/);
        expect(content).toMatch(/webhookToken:\s*params\.WEBHOOK_TOKEN/);
      });
    });

    it('sends running status with build_url and branch_name (IT-027)', () => {
      Object.values(pipelineContents).forEach((content) => {
        const runningBlock = extractInvocationBlock(content, 'running');
        expect(runningBlock).toMatch(/status:\s*'running'/);
        expect(runningBlock).toMatch(/buildUrl:\s*env\.BUILD_URL/);
        expect(runningBlock).toMatch(/branchName:\s*env\.BRANCH_NAME/);
      });
    });

    it('sends success status with all extended fields (IT-028)', () => {
      Object.values(pipelineContents).forEach((content) => {
        const successBlock = extractInvocationBlock(content, 'success');

        expect(successBlock).toMatch(/buildUrl:\s*env\.BUILD_URL/);
        expect(successBlock).toMatch(/branchName:\s*env\.BRANCH_NAME/);
        expect(successBlock).toMatch(/prUrl:\s*prUrl/);
        expect(successBlock).toMatch(/finishedAt:\s*new Date\(\)\.format/);
        expect(successBlock).toContain('logsUrl: "${env.BUILD_URL}console"');
      });
    });

    it('retrieves PR URL from metadata.json using jq or readJSON (IT-030)', () => {
      // Skip auto-issue and pr-comment Jenkinsfiles as they don't use metadata.json for PR URL
      const jenkinsfilesToTest = Object.entries(pipelineContents).filter(
        ([key]) => !key.includes('autoIssue') && !key.includes('prComment')
      );

      jenkinsfilesToTest.forEach(([, content]) => {
        expect(content).toMatch(/metadata\.json/);
        // Either jq or readJSON approach is acceptable
        const hasJq = /jq\s+-r\s+['"]\.pr_url\s*\/\/\s*empty['"]/.test(content);
        const hasReadJSON = /readJSON file:\s*metadataFile/.test(content) && /metadata\.pr_url/.test(content);
        expect(hasJq || hasReadJSON).toBe(true);
      });
    });

    it('sends failed status with error, build_url, finished_at, logs_url and excludes branch/pr (IT-029)', () => {
      Object.values(pipelineContents).forEach((content) => {
        const failureBlock = extractInvocationBlock(content, 'failed');

        expect(failureBlock).toMatch(/status:\s*'failed'/);
        expect(failureBlock).toMatch(/errorMessage:/);
        expect(failureBlock).toMatch(/buildUrl:\s*env\.BUILD_URL/);
        expect(failureBlock).toMatch(/finishedAt:\s*new Date\(\)\.format/);
        expect(failureBlock).toContain('logsUrl: "${env.BUILD_URL}console"');
        expect(failureBlock).not.toMatch(/branchName:/);
        expect(failureBlock).not.toMatch(/prUrl:/);
      });
    });

    it('generates timestamps in ISO 8601 UTC format for success/failure (IT-031)', () => {
      const iso8601Pattern =
        /new Date\(\)\.format\s*\(\s*["']yyyy-MM-dd'T'HH:mm:ss\.SSS'Z'["']\s*,\s*TimeZone\.getTimeZone\s*\(\s*['"]UTC['"]\s*\)\s*\)/;

      Object.values(pipelineContents).forEach((content) => {
        expect(content).toMatch(iso8601Pattern);
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

    it('documents new webhook fields in jenkins/README.md (IT-034)', () => {
      expect(jenkinsReadme).toMatch(/build_url/);
      expect(jenkinsReadme).toMatch(/branch_name/);
      expect(jenkinsReadme).toMatch(/pr_url/);
      expect(jenkinsReadme).toMatch(/finished_at/);
      expect(jenkinsReadme).toMatch(/logs_url/);
    });

    it('lists field coverage per status in the documentation (IT-035)', () => {
      expect(jenkinsReadme).toMatch(/\|\s*`job_id`\s*\|\s*✓\s*\|\s*✓\s*\|\s*✓/);
      expect(jenkinsReadme).toMatch(/\|\s*`build_url`\s*\|\s*✓\s*\|\s*✓\s*\|\s*✓/);
      expect(jenkinsReadme).toMatch(/\|\s*`branch_name`\s*\|\s*✓\s*\|\s*✓\s*\|\s*-/);
      expect(jenkinsReadme).toMatch(/\|\s*`pr_url`\s*\|\s*-\s*\|\s*✓\s*\|\s*-/);
      expect(jenkinsReadme).toMatch(/\|\s*`finished_at`\s*\|\s*-\s*\|\s*✓\s*\|\s*✓/);
      expect(jenkinsReadme).toMatch(/\|\s*`logs_url`\s*\|\s*-\s*\|\s*✓\s*\|\s*✓/);
    });
  });
});
