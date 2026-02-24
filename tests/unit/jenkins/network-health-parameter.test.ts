import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('Unit: ネットワークヘルスチェックパラメータのJenkins連携 (Issue #793)', () => {
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
    // Given: Job DSLファイルを読み込み、NETWORK_HEALTH_CHECKパラメータの宣言を検証する
    // When: booleanParamの記述と説明文を確認する
    // Then: 真偽値と説明が正しく記載されている
    expect(dslContent).toContain("booleanParam('NETWORK_HEALTH_CHECK', true,");
    expect(dslContent).toContain('ネットワークヘルスチェックを有効化');
  });

  it('UT-NTWRK-002: Job DSLの説明文でデフォルト表記がtrue側に存在する', () => {
    // Given: 説明文の記述を前提に読み込む
    // When: デフォルトの記載位置を確認する
    // Then: true側に「デフォルト」が記載され、false側にはない
    expect(dslContent).toContain(
      '- true: フェーズ実行前にCloudWatchメトリクスを確認（デフォルト）'
    );
    expect(dslContent).not.toContain('- false: チェックなし（デフォルト）');
  });

  it('UT-NTWRK-003: Jenkinsfileのパラメータコメントにデフォルト true が明示されている', () => {
    // Given: Jenkinsfileのパラメータ説明を参照する
    // When: NETWORK_HEALTH_CHECKのデフォルト説明を確認する
    // Then: trueのまま記述され、falseの文言は含まれない
    expect(jenkinsfileContent).toContain(
      '* - NETWORK_HEALTH_CHECK: ネットワークヘルスチェック有効化（デフォルト: true）'
    );
    expect(jenkinsfileContent).not.toContain(
      '* - NETWORK_HEALTH_CHECK: ネットワークヘルスチェック有効化（デフォルト: false）'
    );
  });

  it('UT-NTWRK-004: JenkinsfileのValidate ParametersでNetwork Health Checkがログ出力される', () => {
    // Given: Validate Parametersブロックのログ出力を監視
    // When: Network Health Checkパラメータの利用箇所を探す
    // Then: 期待されるecho文が存在してログに出力される
    expect(jenkinsfileContent).toContain(
      'echo "Network Health Check: ${params.NETWORK_HEALTH_CHECK ?: false}"'
    );
  });

  it('UT-NTWRK-005: JenkinsfileのExecute All Phasesでフラグを構築しCLIに渡す', () => {
    // Given: Execute All Phasesブロックにおけるフラグ処理を想定する
    // When: networkHealthCheckFlagの構築とCLI連携コードを検索する
    // Then: フラグ定義とCLI渡しに関する文字列が含まれる
    expect(jenkinsfileContent).toContain(
      "def networkHealthCheckFlag = params.NETWORK_HEALTH_CHECK ? '--network-health-check' : ''"
    );
    expect(jenkinsfileContent).toContain('${networkHealthCheckFlag}');
  });
});
