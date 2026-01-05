/**
 * Integration tests for Issue #577: LANGUAGE parameter and --language option plumbing in Jenkins jobs
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Groovy DSL and Jenkinsfile contents)
 * Covered Scenarios: IT-001〜IT-012 from Phase 3 test plan
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';

const projectRoot = path.resolve(import.meta.dirname, '../../..');

const DSL_PATHS = [
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy',
] as const;

const DSL_ORDER_ANCHOR: Record<(typeof DSL_PATHS)[number], 'AGENT_MODE' | 'LOG_LEVEL'> = {
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_preset_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_single_phase_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_rollback_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_issue_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_execute_job.groovy': 'AGENT_MODE',
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_pr_comment_finalize_job.groovy': 'LOG_LEVEL',
};

const JENKINSFILE_PATHS = [
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile',
] as const;

const LANGUAGE_OPTION_COMMAND_COUNTS: Record<(typeof JENKINSFILE_PATHS)[number], number> = {
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile': 2,
  'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile': 2,
  'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile': 2,
  'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile': 3,
  'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile': 1,
  'jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile': 1,
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile': 3,
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile': 1,
};

const dslContents: Map<string, string> = new Map();
const pipelineContents: Map<string, string> = new Map();

const countChar = (text: string, char: string): number =>
  Array.from(text).filter((c) => c === char).length;

const countSnippet = (text: string, snippet: string): number =>
  text.split(snippet).length - 1;

beforeAll(async () => {
  for (const dslPath of DSL_PATHS) {
    const content = await fs.readFile(path.join(projectRoot, dslPath), 'utf8');
    dslContents.set(dslPath, content);
  }

  for (const pipelinePath of JENKINSFILE_PATHS) {
    const content = await fs.readFile(path.join(projectRoot, pipelinePath), 'utf8');
    pipelineContents.set(pipelinePath, content);
  }
});

describe('Integration: Jenkins LANGUAGE parameter and option propagation (Issue #577)', () => {
  describe('IT-001〜IT-004: DSL LANGUAGE parameter', () => {
    it.each(DSL_PATHS)('defines LANGUAGE choiceParam exactly once: %s', (dslPath) => {
      const content = dslContents.get(dslPath)!;
      expect(countSnippet(content, "choiceParam('LANGUAGE'")).toBe(1);
    });

    it.each(DSL_PATHS)('uses ja/en ordering with ja default: %s', (dslPath) => {
      const content = dslContents.get(dslPath)!;
      expect(content).toContain("choiceParam('LANGUAGE', ['ja', 'en']");
    });

    it.each(DSL_PATHS)('documents LANGUAGE parameter in Japanese and English: %s', (dslPath) => {
      const content = dslContents.get(dslPath)!;
      expect(content).toContain('ワークフロー言語');
      expect(content).toContain('日本語（デフォルト）');
      expect(content).toContain('English');
    });

    it.each(DSL_PATHS)(
      'places LANGUAGE immediately after %s anchor parameter',
      (dslPath) => {
        const content = dslContents.get(dslPath)!;
        const anchor = DSL_ORDER_ANCHOR[dslPath];
        const anchorToken =
          anchor === 'AGENT_MODE'
            ? "choiceParam('AGENT_MODE'"
            : "choiceParam('LOG_LEVEL'";

        const anchorIndex = content.indexOf(anchorToken);
        const languageIndex = content.indexOf("choiceParam('LANGUAGE'");

        expect(anchorIndex).toBeGreaterThanOrEqual(0);
        expect(languageIndex).toBeGreaterThan(anchorIndex);
      }
    );
  });

  describe('IT-005〜IT-009: Jenkinsfile language wiring', () => {
    it.each(JENKINSFILE_PATHS)(
      'defines AI_WORKFLOW_LANGUAGE env var with ja default: %s',
      (pipelinePath) => {
        const content = pipelineContents.get(pipelinePath)!;
        expect(content).toMatch(
          /AI_WORKFLOW_LANGUAGE\s*=\s*"\$\{params\.LANGUAGE\s*\?:\s*'ja'\}"/
        );
      }
    );

    it.each(JENKINSFILE_PATHS)(
      'declares languageOption flag variable consistently: %s',
      (pipelinePath) => {
        const content = pipelineContents.get(pipelinePath)!;
        expect(content).toMatch(
          /def\s+languageOption\s*=\s*params\.LANGUAGE\s*\?\s*"--language \${params\.LANGUAGE}"\s*:\s*['"]{2}/
        );
      }
    );

    it.each(JENKINSFILE_PATHS)(
      'positions AI_WORKFLOW_LANGUAGE after WORKFLOW_VERSION: %s',
      (pipelinePath) => {
        const content = pipelineContents.get(pipelinePath)!;
        const workflowVersionIndex = content.indexOf('WORKFLOW_VERSION');
        const languageIndex = content.indexOf('AI_WORKFLOW_LANGUAGE');

        expect(workflowVersionIndex).toBeGreaterThanOrEqual(0);
        expect(languageIndex).toBeGreaterThan(workflowVersionIndex);
      }
    );

    it.each(JENKINSFILE_PATHS)(
      'adds ${languageOption} to every node command: %s',
      (pipelinePath) => {
        const content = pipelineContents.get(pipelinePath)!;
        const matches = content.match(/node\s+dist\/index\.js[\s\S]*?\$\{languageOption\}/g);
        const expectedCount = LANGUAGE_OPTION_COMMAND_COUNTS[pipelinePath];

        expect(matches?.length ?? 0).toBe(expectedCount);
      }
    );

    it('has consistent AI_WORKFLOW_LANGUAGE definition across all Jenkinsfiles', () => {
      const definitions = JENKINSFILE_PATHS.map((pipelinePath) => {
        const content = pipelineContents.get(pipelinePath)!;
        return content.match(
          /AI_WORKFLOW_LANGUAGE\s*=\s*"\$\{params\.LANGUAGE\s*\?:\s*'ja'\}"/
        )?.[0];
      });

      const uniqueDefinitions = new Set(definitions);
      expect(uniqueDefinitions.size).toBe(1);
    });
  });

  describe('IT-010〜IT-012: Groovy structural consistency checks', () => {
    it.each(DSL_PATHS)('keeps DSL delimiters balanced: %s', (dslPath) => {
      const content = dslContents.get(dslPath)!;
      expect(countChar(content, '(')).toBe(countChar(content, ')'));
      expect((content.match(/'''/g)?.length ?? 0) % 2).toBe(0);
    });

    it.each(JENKINSFILE_PATHS)('keeps Jenkinsfile delimiters balanced: %s', (pipelinePath) => {
      const content = pipelineContents.get(pipelinePath)!;
      expect(countChar(content, '(')).toBe(countChar(content, ')'));
      expect(countChar(content, '{')).toBe(countChar(content, '}'));
    });

    it.each(DSL_PATHS)(
      'uses LANGUAGE choiceParam pattern consistent with existing parameter conventions: %s',
      (dslPath) => {
        const content = dslContents.get(dslPath)!;
        if (DSL_ORDER_ANCHOR[dslPath] === 'AGENT_MODE') {
          expect(content).toContain("choiceParam('AGENT_MODE'");
        } else {
          expect(content).toContain("choiceParam('LOG_LEVEL'");
        }
        expect(content).toContain("choiceParam('LANGUAGE', ['ja', 'en']");
      }
    );
  });
});
