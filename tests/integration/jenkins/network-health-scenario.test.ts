import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';

const FIXTURE_FILE = 'seed-job-console.log';
const EXECUTE_FILE = 'execute-all-phases-console.log';

describe('Integration: ネットワークヘルスチェック Phase3シナリオの証跡 (Issue #768)', () => {
  const fixtureState = {
    seedLog: '',
    pipelineLog: '',
    dslContent: '',
  };

  beforeAll(async () => {
    const projectRoot = path.resolve(import.meta.dirname, '../../..');
    const fixtureDir = path.join(projectRoot, 'tests/fixtures/jenkins');

    fixtureState.seedLog = await fs.readFile(path.join(fixtureDir, FIXTURE_FILE), 'utf8');
    fixtureState.pipelineLog = await fs.readFile(path.join(fixtureDir, EXECUTE_FILE), 'utf8');
    fixtureState.dslContent = await fs.readFile(
      path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy'),
      'utf8'
    );
  });

  it('シナリオ1: SeedジョブのコンソールにProcessing DSLとGeneratedJob出力が含まれる', () => {
    const { seedLog } = fixtureState;
    expect(seedLog).toContain('Processing DSL script ai_workflow_all_phases_job.groovy');
    expect(seedLog).toContain("GeneratedJob{name='AI_Workflow/develop/all-phases-job'}");
    expect(seedLog).toContain("GeneratedJob{name='AI_Workflow/stable-1/all-phases-job'}");
    expect(seedLog).not.toMatch(/ERROR/);
  });

  it('シナリオ2: UI表示に必要な説明文がJob DSL内に明確に記載されている', () => {
    const { dslContent } = fixtureState;
    expect(dslContent).toContain("booleanParam('NETWORK_HEALTH_CHECK'");
    expect(dslContent).toMatch(/ネットワークヘルスチェック/);
    expect(dslContent).toMatch(/EC2インスタンス/);
    expect(dslContent).toMatch(/CloudWatchメトリクス/);
  });

  it('シナリオ3: Validate Parametersステージで true/false のログが記録される', () => {
    const { pipelineLog } = fixtureState;
    expect(pipelineLog).toMatch(/Stage: Validate Parameters/);
    expect(pipelineLog).toMatch(/Network Health Check: true/);
    expect(pipelineLog).toMatch(/Network Health Check: false/);
  });

  it('シナリオ4: Execute All Phasesステージで--network-health-checkフラグが含まれる', () => {
    const { pipelineLog } = fixtureState;
    const executeLine = pipelineLog.match(/node\s+dist\/index\.js\s+execute[^\n]*--network-health-check[^\n]*/);
    expect(executeLine).toBeTruthy();
    expect(executeLine?.[0]).toContain('--network-health-check');
  });
});
