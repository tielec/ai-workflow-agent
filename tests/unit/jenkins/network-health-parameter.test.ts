import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Unit: ネットワークヘルスチェックパラメータのJenkins連携 (Issue #768)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const paths = {
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile'
    ),
  };

  let dslContent = '';
  let jenkinsfileContent = '';

  beforeAll(async () => {
    const [dslRaw, jenkinsfileRaw] = await Promise.all([
      fs.readFile(paths.dsl, 'utf8'),
      fs.readFile(paths.jenkinsfile, 'utf8'),
    ]);

    dslContent = dslRaw;
    jenkinsfileContent = jenkinsfileRaw;
  });

  it('UT-NTWRK-001: Job DSLにNETWORK_HEALTH_CHECK booleanParamが存在する', () => {
    expect(dslContent).toContain("booleanParam('NETWORK_HEALTH_CHECK', false,");
    expect(dslContent).toContain('ネットワークヘルスチェックを有効化');
  });

  it('UT-NTWRK-002: JenkinsfileのValidate ParametersでNetwork Health Checkがログ出力される', () => {
    expect(jenkinsfileContent).toContain(
      'echo "Network Health Check: ${params.NETWORK_HEALTH_CHECK ?: false}"'
    );
  });

  it('UT-NTWRK-003: JenkinsfileのExecute All Phasesでフラグを構築しCLIに渡す', () => {
    expect(jenkinsfileContent).toContain(
      "def networkHealthCheckFlag = params.NETWORK_HEALTH_CHECK ? '--network-health-check' : ''"
    );
    expect(jenkinsfileContent).toContain('${networkHealthCheckFlag}');
  });
});
