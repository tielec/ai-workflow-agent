import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import { parse } from 'yaml';

type WorkflowDoc = {
  name?: string;
  on?: {
    push?: { branches?: string[] };
    pull_request?: { branches?: string[] };
  };
  jobs?: Record<string, any>;
};

const WORKFLOWS_DIR = path.join(process.cwd(), '.github', 'workflows');
const loadWorkflow = (filename: string): WorkflowDoc =>
  parse(readFileSync(path.join(WORKFLOWS_DIR, filename), 'utf-8')) as WorkflowDoc;

describe('Tests workflow (test.yml)', () => {
  test('TS-001 parses as valid YAML', () => {
    expect(() => loadWorkflow('test.yml')).not.toThrow();
  });

  test('TS-003 defines push and pull_request triggers for main and develop', () => {
    const workflow = loadWorkflow('test.yml');
    const pushBranches = workflow.on?.push?.branches;
    const prBranches = workflow.on?.pull_request?.branches;

    expect(pushBranches).toEqual(['main', 'develop']);
    expect(prBranches).toEqual(['main', 'develop']);
  });

  test('TS-004 sets matrix for OS and Node versions', () => {
    const workflow = loadWorkflow('test.yml');
    const matrix = workflow.jobs?.test?.strategy?.matrix as
      | { os?: string[]; ['node-version']?: string[] }
      | undefined;

    expect(matrix?.os).toEqual(expect.arrayContaining(['ubuntu-latest', 'windows-latest']));
    expect(matrix?.['node-version']).toEqual(expect.arrayContaining(['18.x', '20.x']));
    expect(matrix?.os).toHaveLength(2);
    expect(matrix?.['node-version']).toHaveLength(2);
  });

  test('TS-005/TS-013 configures steps for checkout, setup-node, npm commands, and coverage upload', () => {
    const workflow = loadWorkflow('test.yml');
    const steps: any[] = workflow.jobs?.test?.steps ?? [];

    const checkoutStep = steps.find((step) => step.uses === 'actions/checkout@v4');
    expect(checkoutStep).toBeDefined();

    const setupNodeStep = steps.find((step) => step.uses === 'actions/setup-node@v4');
    expect(setupNodeStep?.with?.cache).toBe('npm');
    expect(setupNodeStep?.with?.['node-version']).toBeDefined();

    expect(steps.some((step) => step.run === 'npm ci')).toBe(true);

    const testStep = steps.find((step) => step.run === 'npm test');
    expect(testStep?.env?.CI).toBe(true);

    const codecovStep = steps.find((step) => step.uses === 'codecov/codecov-action@v3');
    expect(codecovStep?.if).toBe("matrix.os == 'ubuntu-latest' && matrix.node-version == '20.x'");
    expect(codecovStep?.with?.files).toBe('./coverage/lcov.info');
    expect(codecovStep?.with?.fail_ci_if_error).toBe(false);
  });

  test('TS-012 limits coverage upload to ubuntu-latest + Node.js 20.x matrix combination', () => {
    const workflow = loadWorkflow('test.yml');
    const matrix = workflow.jobs?.test?.strategy?.matrix as
      | { os?: string[]; ['node-version']?: string[] }
      | undefined;
    const combinations =
      matrix?.os?.flatMap((os) =>
        matrix?.['node-version']?.map((nodeVersion) => ({ os, nodeVersion }))
      ) ?? [];

    const allowedCombinations = combinations.filter(
      ({ os, nodeVersion }) => os === 'ubuntu-latest' && nodeVersion === '20.x'
    );
    expect(allowedCombinations).toHaveLength(1);

    const codecovStep = workflow.jobs?.test?.steps?.find(
      (step: any) => step.uses === 'codecov/codecov-action@v3'
    );
    expect(codecovStep?.if).toBe("matrix.os == 'ubuntu-latest' && matrix.node-version == '20.x'");
  });
});

describe('Build workflow (build.yml)', () => {
  test('TS-002 parses as valid YAML', () => {
    expect(() => loadWorkflow('build.yml')).not.toThrow();
  });

  test('TS-006 defines push and pull_request triggers for main and develop', () => {
    const workflow = loadWorkflow('build.yml');
    const pushBranches = workflow.on?.push?.branches;
    const prBranches = workflow.on?.pull_request?.branches;

    expect(pushBranches).toEqual(['main', 'develop']);
    expect(prBranches).toEqual(['main', 'develop']);
  });

  test('TS-007 sets ubuntu-latest runner and Node.js 20.x', () => {
    const workflow = loadWorkflow('build.yml');
    const buildJob = workflow.jobs?.build;
    const setupNodeStep = buildJob?.steps?.find(
      (step: any) => step.uses === 'actions/setup-node@v4'
    );

    expect(buildJob?.['runs-on']).toBe('ubuntu-latest');
    expect(setupNodeStep?.with?.['node-version']).toBe('20.x');
    expect(setupNodeStep?.with?.cache).toBe('npm');
  });

  test('TS-008/TS-015/TS-017 configures expected build steps including dist validation', () => {
    const workflow = loadWorkflow('build.yml');
    const steps: any[] = workflow.jobs?.build?.steps ?? [];

    expect(steps.some((step) => step.uses === 'actions/checkout@v4')).toBe(true);
    expect(steps.some((step) => step.run === 'npm ci')).toBe(true);
    expect(steps.some((step) => step.run === 'npm run build')).toBe(true);

    const distCheckStep = steps.find((step) => step.name === 'Check dist directory');
    expect(distCheckStep?.run).toContain('dist directory not created');
    expect(distCheckStep?.run).toContain('dist directory created');
  });
});

describe('Project scripts for existing commands', () => {
  test('TS-009/TS-010 keep npm scripts for tests and build available', () => {
    const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'));

    expect(packageJson.scripts?.test).toContain('jest');
    expect(packageJson.scripts?.build).toContain('tsc');
  });
});
