/**
 * Unit tests for Issue #858: impact-analysis Jenkins pipeline & Job DSL
 *
 * Test Strategy: UNIT_INTEGRATION (ユニットテスト部分)
 * Covered Scenarios: UT-A01, UT-A02, UT-A06, UT-A08, UT-B01〜B03, UT-C01〜C05, UT-D01〜D03, UT-E01〜E04
 *
 * リファレンス: tests/unit/jenkins/resolve-conflict-job.test.ts
 */

import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

describe('Unit: impact-analysis Jenkins pipeline (Issue #858)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const paths = {
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_impact_analysis_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile'
    ),
    jobConfig: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
    ),
    validateDsl: path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/validate_dsl.sh'),
  };

  let dslContent = '';
  let jenkinsfileContent = '';
  let jobConfig: Record<string, unknown> = {};
  let validateDslContent = '';

  /**
   * Jenkinsfile 内の指定ステージブロックを抽出するヘルパー関数
   * @param stageName ステージ名
   * @returns ステージブロックの文字列
   */
  const getStageBlock = (stageName: string) => {
    const needle = `stage('${stageName}')`;
    const startIndex = jenkinsfileContent.indexOf(needle);
    if (startIndex === -1) {
      throw new Error(`事前条件: ${needle} が見つかりません。`);
    }
    const nextIndex = jenkinsfileContent.indexOf("stage('", startIndex + needle.length);
    const endIndex = nextIndex === -1 ? jenkinsfileContent.length : nextIndex;
    return jenkinsfileContent.slice(startIndex, endIndex);
  };

  /**
   * validate_dsl.sh を実行し結果を返却するヘルパー関数
   */
  const runValidateDsl = async () => {
    try {
      const { stdout, stderr } = await execFileAsync('bash', [paths.validateDsl], {
        cwd: projectRoot,
      });
      return { ok: true, stdout, stderr: stderr ?? '', code: 0 };
    } catch (error) {
      const err = error as Error & {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        ok: false,
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        code: err.code ?? 1,
      };
    }
  };

  beforeAll(async () => {
    // Given: 4ファイルを並列読み込み
    const [dslRaw, jfRaw, jobConfigRaw, validateDslRaw] = await Promise.all([
      fs.readFile(paths.dsl, 'utf8'),
      fs.readFile(paths.jenkinsfile, 'utf8'),
      fs.readFile(paths.jobConfig, 'utf8'),
      fs.readFile(paths.validateDsl, 'utf8'),
    ]);

    dslContent = dslRaw;
    jenkinsfileContent = jfRaw;
    jobConfig = yaml.parse(jobConfigRaw) as Record<string, unknown>;
    validateDslContent = validateDslRaw;
  });

  // ===========================================================================
  // 2.2 構成・ファイル整合性テスト
  // ===========================================================================

  it('UT-A01: DSLのscriptPathがJenkinsfileを参照し、ファイルが存在する', async () => {
    // Given: DSLのscriptPath定義とJenkinsfileのパス
    const expectedScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile')";

    // When: Jenkinsfileの存在を確認する
    const exists = await fs.pathExists(paths.jenkinsfile);

    // Then: DSLのscriptPathが一致し、Jenkinsfileが存在する
    expect(dslContent).toContain(expectedScriptPath);
    expect(exists).toBe(true);
  });

  it('UT-A02: job-config.yaml の impact_analysis エントリが正しい', () => {
    // Given: job-config.yaml のパース結果
    const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;

    // When: impact_analysis エントリを取得する
    const entry = jobs['ai_workflow_impact_analysis_job'];

    // Then: 期待する全フィールドが一致する
    expect(entry).toMatchObject({
      name: 'impact_analysis',
      displayName: 'Impact Analysis',
      dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_impact_analysis_job.groovy',
      jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile',
      skipJenkinsfileValidation: true,
    });
  });

  // ===========================================================================
  // 2.3 DSL パラメータ定義テスト
  // ===========================================================================

  it('UT-B01: DSLの主要パラメータが定義されている', () => {
    // Given: DSL内容
    const requiredParams = [
      // 固有パラメータ
      "choiceParam('EXECUTION_MODE', ['impact_analysis']",
      "stringParam('PR_NUMBER'",
      "stringParam('PR_URL'",
      // 共通パラメータ
      "stringParam('GITHUB_REPOSITORY'",
      "choiceParam('AGENT_MODE', ['auto', 'codex', 'claude']",
      "choiceParam('LANGUAGE', ['ja', 'en']",
      // 実行オプション
      "booleanParam('DRY_RUN'",
      "textParam('CUSTOM_INSTRUCTION'",
      // その他
      "choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR']",
    ];

    // When/Then: DSL内に全パラメータ定義が存在する
    for (const param of requiredParams) {
      expect(dslContent).toContain(param);
    }
  });

  it('UT-B02: DSLの固定値（EXECUTION_MODE / WORKFLOW_VERSION）が設定されている', () => {
    // Given/When/Then: 環境変数に固定値が含まれる
    expect(dslContent).toContain("env('EXECUTION_MODE', 'impact_analysis')");
    expect(dslContent).toContain("env('WORKFLOW_VERSION', '0.2.0')");
  });

  it('UT-B03: 認証パラメータがnonStoredPasswordParamで定義されている', () => {
    // Given: DSL内容
    const requiredSecrets = [
      "nonStoredPasswordParam('GITHUB_TOKEN'",
      "nonStoredPasswordParam('OPENAI_API_KEY'",
      "nonStoredPasswordParam('CODEX_API_KEY'",
      "nonStoredPasswordParam('CODEX_AUTH_JSON'",
      "nonStoredPasswordParam('CLAUDE_CODE_OAUTH_TOKEN'",
      "nonStoredPasswordParam('CLAUDE_CODE_API_KEY'",
      "nonStoredPasswordParam('ANTHROPIC_API_KEY'",
      "nonStoredPasswordParam('WEBHOOK_URL'",
      "nonStoredPasswordParam('WEBHOOK_TOKEN'",
    ];

    // When/Then: 全ての認証パラメータがnonStoredPasswordParamで定義されている
    for (const param of requiredSecrets) {
      expect(dslContent).toContain(param);
    }
  });

  // ===========================================================================
  // 2.4 Jenkinsfile ステージ構成テスト
  // ===========================================================================

  it('UT-C01: Jenkinsfileの必須ステージが定義されている', () => {
    // Given: Jenkinsfile内容からステージ名を抽出する
    const stages = Array.from(jenkinsfileContent.matchAll(/stage\('([^']+)'\)/g)).map(
      (match) => match[1]
    );
    const stageSet = new Set(stages);

    // Then: 7つの必須ステージがすべて含まれる
    const requiredStages = [
      'Load Common Library',
      'Prepare Codex auth.json',
      'Prepare Agent Credentials',
      'Validate Parameters',
      'Setup Environment',
      'Setup Node.js Environment',
      'Execute Impact Analysis',
    ];
    for (const stage of requiredStages) {
      expect(stageSet.has(stage)).toBe(true);
    }
  });

  it('UT-C02: JenkinsfileにPR_NUMBER/PR_URL排他バリデーションがある', () => {
    // Given: Jenkinsfile内容

    // When/Then: PR_URL パース用正規表現が含まれる
    expect(jenkinsfileContent).toContain(
      'def prUrlPattern = ~/^https:\\/\\/github\\.com\\/([^\\/]+)\\/([^\\/]+)\\/pull\\/(\\d+)$/'
    );

    // When/Then: 環境変数設定が含まれる
    expect(jenkinsfileContent).toContain('env.REPO_OWNER = matcher[0][1]');
    expect(jenkinsfileContent).toContain('env.REPO_NAME = matcher[0][2]');
    expect(jenkinsfileContent).toContain('env.PR_NUMBER = matcher[0][3]');

    // When/Then: 両方未指定時のエラーが含まれる
    expect(jenkinsfileContent).toContain(
      'PR_NUMBER または PR_URL のいずれかを指定してください'
    );

    // When/Then: 両方指定時のエラーが含まれる
    expect(jenkinsfileContent).toContain(
      'PR_NUMBER と PR_URL は同時に指定できません'
    );

    // When/Then: GITHUB_REPOSITORY 必須チェックが含まれる
    expect(jenkinsfileContent).toContain('GITHUB_REPOSITORY パラメータ');

    // When/Then: GITHUB_REPOSITORY フォーマットチェックが含まれる
    expect(jenkinsfileContent).toContain("owner/repo");
  });

  it('UT-C03: JenkinsfileのCLIコマンドが正しく組み立てられている', () => {
    // Given: Jenkinsfile内容

    // When/Then: 基本コマンドが含まれる
    expect(jenkinsfileContent).toContain('node dist/index.js impact-analysis');

    // When/Then: PR_URL オプション組み立てが含まれる
    expect(jenkinsfileContent).toContain('--pr-url');

    // When/Then: PR_NUMBER オプション組み立てが含まれる
    expect(jenkinsfileContent).toContain('--pr ${env.PR_NUMBER}');

    // When/Then: エージェントモードオプションが含まれる
    expect(jenkinsfileContent).toContain("--agent ${params.AGENT_MODE ?: 'auto'}");

    // When/Then: カスタム指示フラグ組み立てが含まれる
    expect(jenkinsfileContent).toContain('--custom-instruction');

    // When/Then: DRY_RUN フラグ組み立てが含まれる
    expect(jenkinsfileContent).toContain('--dry-run');

    // When/Then: 言語オプション組み立てが含まれる
    expect(jenkinsfileContent).toContain('--language');
  });

  it('UT-C04: JenkinsfileにEXECUTION_MODEが設定されている', () => {
    // Given/When/Then: EXECUTION_MODE が 'impact_analysis' に設定されている
    expect(jenkinsfileContent).toContain("EXECUTION_MODE = 'impact_analysis'");
  });

  it('UT-C05: postブロックにWebhook通知とクリーンアップが含まれている', () => {
    // Given: Jenkinsfile内容

    // When/Then: post ブロックが存在する
    expect(jenkinsfileContent).toContain('post {');

    // When/Then: ワークスペースクリーンアップが含まれる
    expect(jenkinsfileContent).toContain('cleanWs()');

    // When/Then: 成功時 Webhook が含まれる
    expect(jenkinsfileContent).toContain("status: 'success'");

    // When/Then: 失敗時 Webhook が含まれる
    expect(jenkinsfileContent).toContain("status: 'failed'");

    // When/Then: REPOS_ROOT クリーンアップが含まれる
    expect(jenkinsfileContent).toContain('REPOS_ROOT cleaned up');

    // When/Then: CODEX_HOME クリーンアップが含まれる
    expect(jenkinsfileContent).toContain('CODEX_HOME cleaned up');
  });

  // ===========================================================================
  // 2.5 Execute Impact Analysis ステージ詳細テスト
  // ===========================================================================

  it('UT-E01: Execute Impact Analysisステージでdir(env.WORKFLOW_DIR)が呼ばれている', () => {
    // Given: Execute Impact Analysis ステージブロックを抽出する
    const stageBlock = getStageBlock('Execute Impact Analysis');

    // When/Then: dir(env.WORKFLOW_DIR) が含まれる
    expect(stageBlock).toContain('dir(env.WORKFLOW_DIR)');
  });

  it('UT-E02: DSL description()にステージ名が含まれている', () => {
    // Given: DSL内容

    // When/Then: description 内に全7ステージの名称が含まれる
    const expectedStages = [
      '1. Load Common Library',
      '2. Prepare Codex auth.json',
      '3. Prepare Agent Credentials',
      '4. Validate Parameters',
      '5. Setup Environment',
      '6. Setup Node.js Environment',
      '7. Execute Impact Analysis',
    ];
    for (const stage of expectedStages) {
      expect(dslContent).toContain(stage);
    }
  });

  it('UT-E03: JenkinsfileのヘッダーにCUSTOM_INSTRUCTIONがドキュメント化されている', () => {
    // Given: Jenkinsfile内容

    // When/Then: ヘッダーコメント内にCUSTOM_INSTRUCTIONの記載がある
    expect(jenkinsfileContent).toMatch(/\* - CUSTOM_INSTRUCTION: カスタム指示/);
  });

  it('UT-E04: Validate ParametersステージでCustom Instruction値をログ出力している', () => {
    // Given: Jenkinsfile内容

    // When/Then: Validate Parameters ステージ内で Custom Instruction のログ出力パターンが存在する
    const validateStagePattern =
      /stage\('Validate Parameters'\)[\s\S]*?echo "Custom Instruction: \${params\.CUSTOM_INSTRUCTION \?: '\(none\)'}"/;
    expect(jenkinsfileContent).toMatch(validateStagePattern);
  });

  // ===========================================================================
  // 2.6 validate_dsl.sh 検証テスト
  // ===========================================================================

  it('UT-D01: validate_dsl.shにimpact-analysisのJenkinsfileパスが追加されている', () => {
    // Given/When/Then: expected_paths 配列に impact-analysis/Jenkinsfile が含まれる
    expect(validateDslContent).toContain(
      '"jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile"'
    );
  });

  it('UT-D02: validate_dsl.shにimpact-analysisのscriptPath整合性チェックがある', () => {
    // Given/When/Then: scriptPath 整合性チェックのエントリが含まれる
    expect(validateDslContent).toContain(
      'ai_workflow_impact_analysis_job.groovy has correct scriptPath'
    );
    expect(validateDslContent).toContain(
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile')"
    );
  });

  it('UT-D03: validate_dsl.shを実行してimpact-analysisの検証が成功する', async () => {
    // Given: validate_dsl.sh を bash で実行する
    const { stdout } = await execFileAsync('bash', [paths.validateDsl], {
      cwd: projectRoot,
    });

    // Then: impact-analysis のパス存在確認と scriptPath 整合性が成功する
    expect(stdout).toContain(
      '✓ jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile exists'
    );
    expect(stdout).toContain(
      '✓ ai_workflow_impact_analysis_job.groovy has correct scriptPath'
    );

    // Then: 全体が成功する
    expect(stdout).toContain('=== ✓ All validations passed ===');
  });

  // ===========================================================================
  // 2.7 異常系テスト（validate_dsl.sh）
  // ===========================================================================

  it('UT-A06: Jenkinsfileが未作成の場合にvalidate_dsl.shが失敗する', async () => {
    // Given: Jenkinsfile を一時的に退避する
    const backupPath = `${paths.jenkinsfile}.bak`;
    await fs.move(paths.jenkinsfile, backupPath, { overwrite: true });

    try {
      // When: validate_dsl.sh を実行する
      const result = await runValidateDsl();

      // Then: Jenkinsfile 未存在が検出され、失敗する
      expect(result.ok).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        '✗ jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile NOT FOUND'
      );
      expect(result.stdout).toContain(
        '=== ✗ Validation failed - please fix the errors above ==='
      );
    } finally {
      // 後始末: Jenkinsfile を元に戻す
      await fs.move(backupPath, paths.jenkinsfile, { overwrite: true });
    }
  });

  it('UT-A08: scriptPath不一致の場合にvalidate_dsl.shが失敗する', async () => {
    // Given: DSL の scriptPath を一時的に誤った値に変更する
    const originalDsl = await fs.readFile(paths.dsl, 'utf8');
    const expectedScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile')";
    const wrongScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile_WRONG')";

    if (!originalDsl.includes(expectedScriptPath)) {
      throw new Error('事前条件: impact-analysis の scriptPath 定義が見つかりません。');
    }

    const modifiedDsl = originalDsl.replace(expectedScriptPath, wrongScriptPath);
    await fs.writeFile(paths.dsl, modifiedDsl, 'utf8');

    try {
      // When: validate_dsl.sh を実行する
      const result = await runValidateDsl();

      // Then: scriptPath 不一致が検出され、失敗する
      expect(result.ok).toBe(false);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain(
        '✗ ai_workflow_impact_analysis_job.groovy has incorrect scriptPath'
      );
      expect(result.stdout).toContain(
        '=== ✗ Validation failed - please fix the errors above ==='
      );
    } finally {
      // 後始末: DSL を元に戻す
      await fs.writeFile(paths.dsl, originalDsl, 'utf8');
    }
  });
});
