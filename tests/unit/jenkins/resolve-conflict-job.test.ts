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

describe('Unit: resolve-conflict Jenkins pipeline (Issue #728)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const paths = {
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_resolve_conflict_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile'
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

  it('UT-A05/UT-A07: DSLのscriptPathがJenkinsfileを参照し、ファイルが存在する', async () => {
    // Given: DSLのscriptPath定義とJenkinsfileのパス
    const expectedScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile')";

    // When: Jenkinsfileの存在を確認する
    const exists = await fs.pathExists(paths.jenkinsfile);

    // Then: DSLのscriptPathが一致し、Jenkinsfileが存在する
    expect(dslContent).toContain(expectedScriptPath);
    expect(exists).toBe(true);
  });

  it('UT-A05/UT-A07: job-config.yaml の resolve_conflict エントリが正しい', () => {
    // Given: job-config.yaml のパース結果
    const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;

    // When: resolve_conflict エントリを取得する
    const entry = jobs['ai_workflow_resolve_conflict_job'];

    // Then: 期待する設定が揃っている
    expect(entry).toMatchObject({
      name: 'resolve_conflict',
      displayName: 'Resolve Conflict',
      dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_resolve_conflict_job.groovy',
      jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile',
      skipJenkinsfileValidation: true,
    });
  });

  it('UT-B02/UT-B03/UT-B05/UT-B06: DSLの主要パラメータが定義されている', () => {
    // Given: DSL内容
    const requiredParams = [
      "choiceParam('EXECUTION_MODE', ['resolve_conflict']",
      "stringParam('PR_URL'",
      "stringParam('GITHUB_REPOSITORY'",
      "choiceParam('AGENT_MODE', ['auto', 'codex', 'claude']",
      "choiceParam('LANGUAGE', ['ja', 'en']",
      "booleanParam('DRY_RUN'",
      "booleanParam('PUSH'",
      "booleanParam('SQUASH'",
      "choiceParam('LOG_LEVEL', ['INFO', 'DEBUG', 'WARNING', 'ERROR']",
    ];

    // When/Then: DSL内に定義が存在する
    for (const param of requiredParams) {
      expect(dslContent).toContain(param);
    }
  });

  it('UT-B02: DSLの固定値（EXECUTION_MODE/WORKFLOW_VERSION）が設定されている', () => {
    // Given/When/Then: 環境変数に固定値が含まれる
    expect(dslContent).toContain("env('EXECUTION_MODE', 'resolve_conflict')");
    expect(dslContent).toContain("env('WORKFLOW_VERSION', '0.2.0')");
  });

  it('UT-B07: 認証パラメータがnonStoredPasswordParamで定義されている', () => {
    // Given: DSL内容
    const requiredSecrets = [
      "nonStoredPasswordParam('GITHUB_TOKEN'",
      "nonStoredPasswordParam('OPENAI_API_KEY'",
      "nonStoredPasswordParam('CODEX_API_KEY'",
      "nonStoredPasswordParam('CODEX_AUTH_JSON'",
      "nonStoredPasswordParam('CLAUDE_CODE_OAUTH_TOKEN'",
      "nonStoredPasswordParam('CLAUDE_CODE_API_KEY'",
      "nonStoredPasswordParam('ANTHROPIC_API_KEY'",
    ];

    // When/Then: 全ての認証パラメータが存在する
    for (const param of requiredSecrets) {
      expect(dslContent).toContain(param);
    }
  });

  it('UT-FR6: Jenkinsfileの必須ステージが定義されている', () => {
    // Given: Jenkinsfile内容
    const stages = Array.from(jenkinsfileContent.matchAll(/stage\('([^']+)'\)/g)).map(
      (match) => match[1]
    );
    const stageSet = new Set(stages);

    // Then: 必須ステージがすべて含まれる
    const requiredStages = [
      'Load Common Library',
      'Prepare Codex auth.json',
      'Prepare Agent Credentials',
      'Validate Parameters',
      'Setup Environment',
      'Setup Node.js Environment',
      'Execute Resolve Conflict',
    ];
    for (const stage of requiredStages) {
      expect(stageSet.has(stage)).toBe(true);
    }
  });

  it('UT-FR7: JenkinsfileにPR_URLバリデーションとPR番号抽出がある', () => {
    // Given/When/Then: 正規表現と環境変数設定が含まれる
    expect(jenkinsfileContent).toContain(
      'def prUrlPattern = ~/^https:\/\/github\\.com\/([^\/]+)\/([^\/]+)\/pull\/(\\d+)$/'
    );
    expect(jenkinsfileContent).toContain('env.REPO_OWNER = matcher[0][1]');
    expect(jenkinsfileContent).toContain('env.REPO_NAME = matcher[0][2]');
    expect(jenkinsfileContent).toContain('env.PR_NUMBER = matcher[0][3]');
    expect(jenkinsfileContent).toContain('env.ISSUE_NUMBER = env.PR_NUMBER');
  });

  it('UT-FR8/FR9/FR10: 4フェーズ実行とオプション構成が定義されている', () => {
    // Given/When/Then: 各フェーズコマンドが含まれる
    expect(jenkinsfileContent).toContain('node dist/index.js resolve-conflict init');
    expect(jenkinsfileContent).toContain('node dist/index.js resolve-conflict analyze');
    expect(jenkinsfileContent).toContain('node dist/index.js resolve-conflict execute');
    expect(jenkinsfileContent).toContain('node dist/index.js resolve-conflict finalize');

    // DRY_RUN安全策とオプション付与
    expect(jenkinsfileContent).toContain(
      "def pushFlag = (params.PUSH && !params.DRY_RUN) ? '--push' : ''"
    );
    expect(jenkinsfileContent).toContain('def dryRunFlag = params.DRY_RUN ? \'--dry-run\' : \'\'');
    expect(jenkinsfileContent).toContain("def squashFlag = params.SQUASH ? '--squash' : ''");
  });

  it('UT-A05: validate_dsl.sh に resolve-conflict の Jenkinsfile パスが追加されている', () => {
    // Given/When/Then: expected_paths に Jenkinsfile が含まれる
    expect(validateDslContent).toContain(
      '"jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile"'
    );
  });

  it('UT-A07: validate_dsl.sh に resolve-conflict の scriptPath 整合性チェックがある', () => {
    // Given/When/Then: scriptPath の一致確認が追加されている
    expect(validateDslContent).toContain(
      "ai_workflow_resolve_conflict_job.groovy has correct scriptPath"
    );
    expect(validateDslContent).toContain(
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile')"
    );
  });

  it('UT-A09/UT-A10: validate_dsl.sh を実行して resolve-conflict の検証が成功する', async () => {
    // Given: validate_dsl.sh を bash で実行する
    const { stdout } = await execFileAsync('bash', [paths.validateDsl], {
      cwd: projectRoot,
    });

    // Then: 期待する出力が含まれ、全体が成功している
    expect(stdout).toContain('✓ jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile exists');
    expect(stdout).toContain('✓ ai_workflow_resolve_conflict_job.groovy has correct scriptPath');
    expect(stdout).toContain('=== ✓ All validations passed ===');
  });

  it('UT-A06: Jenkinsfile が未作成の場合に validate_dsl.sh が失敗する', async () => {
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
        '✗ jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile NOT FOUND'
      );
      expect(result.stdout).toContain('=== ✗ Validation failed - please fix the errors above ===');
    } finally {
      // 後始末: Jenkinsfile を元に戻す
      await fs.move(backupPath, paths.jenkinsfile, { overwrite: true });
    }
  });

  it('UT-A08: scriptPath 不一致の場合に validate_dsl.sh が失敗する', async () => {
    // Given: DSL の scriptPath を一時的に誤った値に変更する
    const originalDsl = await fs.readFile(paths.dsl, 'utf8');
    const expectedScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile')";
    const wrongScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile_WRONG')";

    if (!originalDsl.includes(expectedScriptPath)) {
      throw new Error('事前条件: resolve-conflict の scriptPath 定義が見つかりません。');
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
        '✗ ai_workflow_resolve_conflict_job.groovy has incorrect scriptPath'
      );
      expect(result.stdout).toContain('=== ✗ Validation failed - please fix the errors above ===');
    } finally {
      // 後始末: DSL を元に戻す
      await fs.writeFile(paths.dsl, originalDsl, 'utf8');
    }
  });
});
