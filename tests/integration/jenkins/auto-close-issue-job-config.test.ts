/**
 * Integration test for Issue #678: job-config entry for auto-close-issue job
 * Test Strategy: INTEGRATION_ONLY (static validation of seed job configuration)
 * Covered Scenarios: INT-001〜INT-003 相当
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

type ParameterKind = 'choice' | 'string' | 'boolean' | 'nonStoredPassword';

type ParameterDefinition = {
  name: string;
  kind: ParameterKind;
  defaultValue?: string | boolean;
  choices?: string[];
};

type FolderDefinition = {
  name: string;
  displayName: string;
  branch: string;
};

describe('Integration: auto-close-issue job-config entry (Issue #678)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const jobConfigPath = path.join(
    projectRoot,
    'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
  );
  const expectedRelativeJenkinsfile =
    'jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile';
  const dslPath = path.join(
    projectRoot,
    'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_close_issue_job.groovy'
  );

  let jobConfig: Record<string, unknown>;
  let dslContent = '';

  beforeAll(async () => {
    const raw = await fs.readFile(jobConfigPath, 'utf8');
    jobConfig = yaml.parse(raw) as Record<string, unknown>;
    dslContent = await fs.readFile(dslPath, 'utf8');
  });

  it('defines ai_workflow_auto_close_issue_job entry with required properties', () => {
    const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
    const entry = jobs['ai_workflow_auto_close_issue_job'];

    expect(entry).toBeDefined();
    expect(entry).toMatchObject({
      name: 'auto_close_issue',
      displayName: 'Auto Close Issue',
      dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_close_issue_job.groovy',
      jenkinsfile: expectedRelativeJenkinsfile,
    });
    expect(entry!.skipJenkinsfileValidation).toBe(true);
  });

  it('references the actual auto-close-issue Jenkinsfile path', async () => {
    const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
    const entry = jobs['ai_workflow_auto_close_issue_job'];
    const jenkinsfileAbsolute = path.join(projectRoot, entry!.jenkinsfile);

    const exists = await fs.pathExists(jenkinsfileAbsolute);
    expect(exists).toBe(true);
  });

  it('DSL内のscriptPathがjob-configのjenkinsfileと一致している', () => {
    const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
    const entry = jobs['ai_workflow_auto_close_issue_job'];
    const match = /scriptPath\('([^']+)'\)/.exec(dslContent);

    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(entry!.jenkinsfile);
  });

  it('auto-close-issueジョブに必要なパラメータが定義されている', () => {
    const definitions = parseParameterDefinitions(dslContent);
    const expectedOrder = [
      'EXECUTION_MODE',
      'GITHUB_REPOSITORY',
      'AGENT_MODE',
      'LANGUAGE',
      'AUTO_CLOSE_CATEGORY',
      'AUTO_CLOSE_LIMIT',
      'CONFIDENCE_THRESHOLD',
      'DAYS_THRESHOLD',
      'EXCLUDE_LABELS',
      'REQUIRE_APPROVAL',
      'DRY_RUN',
      'GITHUB_TOKEN',
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
      'CODEX_AUTH_JSON',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_API_KEY',
      'ANTHROPIC_API_KEY',
      'JOB_ID',
      'WEBHOOK_URL',
      'WEBHOOK_TOKEN',
      'COST_LIMIT_USD',
      'LOG_LEVEL',
    ];

    expect(definitions.map((def) => def.name)).toEqual(expectedOrder);
    expect(definitions).toHaveLength(expectedOrder.length);

    const findDef = (name: string) => definitions.find((def) => def.name === name);

    expect(findDef('EXECUTION_MODE')?.kind).toBe('choice');
    expect(findDef('EXECUTION_MODE')?.defaultValue).toBe('auto_close_issue');
    expect(findDef('GITHUB_REPOSITORY')?.kind).toBe('string');

    expect(findDef('AUTO_CLOSE_CATEGORY')?.choices).toContain('followup');
    expect(findDef('AUTO_CLOSE_CATEGORY')?.defaultValue).toBe('followup');
    expect(findDef('AUTO_CLOSE_LIMIT')?.defaultValue).toBe('10');
    expect(findDef('CONFIDENCE_THRESHOLD')?.defaultValue).toBe('0.7');
    expect(findDef('DAYS_THRESHOLD')?.defaultValue).toBe('90');
    expect(findDef('EXCLUDE_LABELS')?.defaultValue).toBe('do-not-close,pinned');
    expect(findDef('REQUIRE_APPROVAL')?.defaultValue).toBe(false);
    expect(findDef('DRY_RUN')?.defaultValue).toBe(true);
    expect(findDef('COST_LIMIT_USD')?.defaultValue).toBe('10');

    expect(findDef('LOG_LEVEL')?.kind).toBe('choice');
    expect(findDef('LOG_LEVEL')?.choices).toEqual(['INFO', 'DEBUG', 'WARNING', 'ERROR']);
    expect(findDef('LOG_LEVEL')?.defaultValue).toBe('INFO');

    const nonStoredDefaults = definitions
      .filter((def) => def.kind === 'nonStoredPassword')
      .map((def) => def.name);
    expect(nonStoredDefaults).toEqual([
      'GITHUB_TOKEN',
      'OPENAI_API_KEY',
      'CODEX_API_KEY',
      'CODEX_AUTH_JSON',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_API_KEY',
      'ANTHROPIC_API_KEY',
      'WEBHOOK_URL',
      'WEBHOOK_TOKEN',
    ]);
  });

  it('genericFolders定義はDevelopとStable系9件を含む10件構成である', () => {
    const folders = parseGenericFoldersDefinitions(dslContent);
    const expected: FolderDefinition[] = [
      { name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop' },
      { name: 'stable-1', displayName: 'AI Workflow Executor - Stable 1', branch: '*/main' },
      { name: 'stable-2', displayName: 'AI Workflow Executor - Stable 2', branch: '*/main' },
      { name: 'stable-3', displayName: 'AI Workflow Executor - Stable 3', branch: '*/main' },
      { name: 'stable-4', displayName: 'AI Workflow Executor - Stable 4', branch: '*/main' },
      { name: 'stable-5', displayName: 'AI Workflow Executor - Stable 5', branch: '*/main' },
      { name: 'stable-6', displayName: 'AI Workflow Executor - Stable 6', branch: '*/main' },
      { name: 'stable-7', displayName: 'AI Workflow Executor - Stable 7', branch: '*/main' },
      { name: 'stable-8', displayName: 'AI Workflow Executor - Stable 8', branch: '*/main' },
      { name: 'stable-9', displayName: 'AI Workflow Executor - Stable 9', branch: '*/main' },
    ];

    expect(folders).toEqual(expected);
  });

  it('genericFolders.eachループでjobConfig.nameを含むジョブが10件生成される', () => {
    expect(/genericFolders\.each\s*\{\s*folder\s*->/.test(dslContent)).toBe(true);
    expect(/createJob\(\s*"AI_Workflow\/\$\{folder\.name\}\/\$\{jobConfig\.name\}"/.test(dslContent)).toBe(true);
    expect(/folder\.branch\s*\)/.test(dslContent)).toBe(true);
  });
});

function parseParameterDefinitions(dsl: string): ParameterDefinition[] {
  const block = extractBlock(dsl, 'parameters');
  const definitions: (ParameterDefinition & { position: number })[] = [];

  const choiceRegex = /choiceParam\(\s*'([^']+)'\s*,\s*\[([^\]]+)\],/g;
  let match: RegExpExecArray | null;
  while ((match = choiceRegex.exec(block)) !== null) {
    const choices = match[2]
      .split(',')
      .map((token) => token.replace(/'/g, '').trim())
      .filter((token) => token.length > 0);
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'choice',
      defaultValue: choices[0],
      choices,
    });
  }

  const stringRegex = /stringParam\(\s*'([^']+)'\s*,\s*'([^']*)',/g;
  while ((match = stringRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'string',
      defaultValue: match[2],
    });
  }

  const booleanRegex = /booleanParam\(\s*'([^']+)'\s*,\s*(true|false),/g;
  while ((match = booleanRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'boolean',
      defaultValue: match[2] === 'true',
    });
  }

  const nonStoredRegex = /nonStoredPasswordParam\(\s*'([^']+)'/g;
  while ((match = nonStoredRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'nonStoredPassword',
    });
  }

  definitions.sort((a, b) => a.position - b.position);
  return definitions.map(({ position, ...rest }) => rest);
}

function parseGenericFoldersDefinitions(dsl: string): FolderDefinition[] {
  const arrayLiteral = extractArrayLiteral(dsl, 'genericFolders');
  const inner = arrayLiteral.slice(1, -1);
  const entries: FolderDefinition[] = [];
  let depth = 0;
  let entryStart = -1;

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === '[') {
      if (depth === 0) {
        entryStart = index;
      }
      depth += 1;
    } else if (char === ']') {
      depth -= 1;
      if (depth === 0 && entryStart !== -1) {
        const entry = inner.slice(entryStart, index + 1);
        entries.push(parseFolderEntry(entry));
        entryStart = -1;
      }
    }
  }

  if (entries.length === 0) {
    throw new Error('genericFolders定義が見つかりませんでした');
  }

  return entries;
}

function parseFolderEntry(entry: string): FolderDefinition {
  const folderRegex = /name:\s*['"]([^'"]+)['"],\s*displayName:\s*['"]([^'"]+)['"],\s*branch:\s*['"]([^'"]+)['"]/;
  const match = folderRegex.exec(entry);
  if (!match) {
    throw new Error(`genericFoldersのエントリのパースに失敗しました: ${entry}`);
  }

  return {
    name: match[1],
    displayName: match[2],
    branch: match[3],
  };
}

function extractArrayLiteral(source: string, arrayName: string): string {
  const token = `${arrayName}`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`${arrayName} 定義がDSL内に見つかりません`);
  }

  const openIndex = source.indexOf('[', start);
  if (openIndex === -1) {
    throw new Error(`${arrayName} の開始ブラケットが見つかりません`);
  }

  const closeIndex = findMatchingBracket(source, openIndex, '[', ']');
  return source.slice(openIndex, closeIndex + 1);
}

function findMatchingBracket(source: string, startIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error('対応する閉じブラケットが見つかりません');
}

function extractBlock(source: string, blockName: string): string {
  const token = `${blockName} {`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`ブロック \'${blockName}\' がDSL内に見つかりません`);
  }

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`ブロック \'${blockName}\' の終了が見つかりません`);
}
