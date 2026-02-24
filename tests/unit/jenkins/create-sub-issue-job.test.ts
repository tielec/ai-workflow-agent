import { beforeAll, describe, expect, it } from '@jest/globals';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

const execFileAsync = promisify(execFile);

type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

describe('Unit: create-sub-issue Jenkins pipeline (Issue #741)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const paths = {
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_create_sub_issue_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile'
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
      const err = error as Error & { stdout?: string; stderr?: string; code?: number };
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

  it('UT-A01/UT-A02/UT-A03: DSLのscriptPathがJenkinsfileを参照し、ファイルが存在する', async () => {
    // Given: DSLのscriptPath定義とJenkinsfileのパス
    const expectedScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile')";

    // When: Jenkinsfileの存在を確認する
    const exists = await fs.pathExists(paths.jenkinsfile);

    // Then: DSLのscriptPathが一致し、Jenkinsfileが存在する
    expect(dslContent).toContain(expectedScriptPath);
    expect(exists).toBe(true);
  });

  it('UT-E01: job-config.yaml の create_sub_issue エントリが正しい', () => {
    // Given: job-config.yaml のパース結果
    const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;

    // When: create_sub_issue エントリを取得する
    const entry = jobs['ai_workflow_create_sub_issue_job'];

    // Then: 期待する設定が揃っている
    expect(entry).toMatchObject({
      name: 'create_sub_issue',
      displayName: 'Create Sub Issue',
      dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_create_sub_issue_job.groovy',
      jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile',
      skipJenkinsfileValidation: true,
    });
  });

  it('UT-B01/UT-B02/UT-B03/UT-B04/UT-B05/UT-B06/UT-B08/UT-D04: DSLの主要設定が定義されている', () => {
    // Given: DSL内容

    // When/Then: 主要な固定値とパラメータ定義が存在する
    expect(dslContent).toContain("def jobKey = 'ai_workflow_create_sub_issue_job'");
    expect(dslContent).toContain("choiceParam('EXECUTION_MODE', ['create_sub_issue']");
    expect(dslContent).toContain("stringParam('ISSUE_NUMBER'");
    expect(dslContent).toContain('親Issue番号');
    expect(dslContent).toContain("textParam('DESCRIPTION'");
    expect(dslContent).toContain('サブIssueの説明');
    expect(dslContent).toContain('必須');
    expect(dslContent).toContain('1-1000文字');
    expect(dslContent).toContain("choiceParam('ISSUE_TYPE', ['bug', 'task', 'enhancement']");
    expect(dslContent).toContain("stringParam('LABELS'");
    expect(dslContent).toContain('カンマ区切り');
    expect(dslContent).toContain("env('EXECUTION_MODE', 'create_sub_issue')");

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

    for (const param of requiredSecrets) {
      expect(dslContent).toContain(param);
    }
  });

  it('UT-B10/UT-B11/UT-B12/UT-B13/UT-B14: DSLの運用設定が一致する', () => {
    // Given/When/Then: ログローテーションと並行ビルド設定
    expect(dslContent).toContain('numToKeep(30)');
    expect(dslContent).toContain('daysToKeep(90)');
    expect(dslContent).toContain('disableConcurrentBuilds()');

    // Git SCM 設定
    expect(dslContent).toContain("url('https://github.com/tielec/ai-workflow-agent.git')");
    expect(dslContent).toContain("credentials('github-token')");

    // フォルダ構成
    expect(dslContent).toContain("name: 'develop'");
    expect(dslContent).toContain('(1..9).collect');

    // description セクション
    expect(dslContent).toContain('Create Sub Issue');
    expect(dslContent).toContain('親Issue');
    expect(dslContent).toContain('サブIssue');
  });

  it('UT-C01/UT-C03/UT-C07/UT-C08/UT-C09/UT-C10: Jenkinsfileの主要バリデーションが定義されている', () => {
    // Given: Jenkinsfile内容

    // When/Then: EXECUTION_MODEと必須チェック
    expect(jenkinsfileContent).toContain("EXECUTION_MODE = 'create_sub_issue'");
    expect(jenkinsfileContent).toContain('if (!params.ISSUE_NUMBER?.trim())');
    expect(jenkinsfileContent).toContain('ISSUE_NUMBER parameter is required');
    expect(jenkinsfileContent).toContain('if (!params.ISSUE_NUMBER.isInteger())');
    expect(jenkinsfileContent).toContain('ISSUE_NUMBER must be a number');
    expect(jenkinsfileContent).toContain('if (!params.DESCRIPTION?.trim())');
    expect(jenkinsfileContent).toContain('DESCRIPTION parameter is required');
    expect(jenkinsfileContent).toContain('if (!params.GITHUB_REPOSITORY?.trim())');
    expect(jenkinsfileContent).toContain("GITHUB_REPOSITORY must be in 'owner/repo' format");

    // ステージ構成
    const stages = Array.from(jenkinsfileContent.matchAll(/stage\('([^']+)'\)/g)).map(
      (match) => match[1]
    );
    const stageSet = new Set(stages);
    const requiredStages = [
      'Load Common Library',
      'Prepare Codex auth.json',
      'Prepare Agent Credentials',
      'Validate Parameters',
      'Setup Environment',
      'Setup Node.js Environment',
      'Execute Create Sub Issue',
    ];
    for (const stage of requiredStages) {
      expect(stageSet.has(stage)).toBe(true);
    }
  });

  it('UT-C14/UT-C15/UT-C16/UT-C17/UT-D01/UT-D02/UT-D03: CLI引数構築と安全な引き渡しが行われている', () => {
    // Given/When/Then: CLIコマンドとフラグ構築
    expect(jenkinsfileContent).toContain('node dist/index.js create-sub-issue');
    expect(jenkinsfileContent).toContain('--parent-issue ${parentIssueNumber}');
    expect(jenkinsfileContent).toContain('--type ${issueType}');
    expect(jenkinsfileContent).toContain("def applyFlag = params.APPLY ? '--apply' : ''");
    expect(jenkinsfileContent).toContain(
      "def dryRunFlag = (!params.APPLY && params.DRY_RUN) ? '--dry-run' : ''"
    );
    expect(jenkinsfileContent).toContain("def labelsFlag = params.LABELS?.trim() ? '--labels' : ''");
    expect(jenkinsfileContent).toContain(
      "def customInstructionFlag = params.CUSTOM_INSTRUCTION?.trim() ? '--custom-instruction' : ''"
    );

    // DESCRIPTION/LABELS/CUSTOM_INSTRUCTION を環境変数経由で渡す
    expect(jenkinsfileContent).toContain('withEnv([');
    expect(jenkinsfileContent).toContain('DESCRIPTION_PARAM');
    expect(jenkinsfileContent).toContain('LABELS_PARAM');
    expect(jenkinsfileContent).toContain('CUSTOM_INSTRUCTION_PARAM');
    expect(jenkinsfileContent).toContain('--description "\\$DESCRIPTION_PARAM"');
    expect(jenkinsfileContent).toContain('"\\$LABELS_PARAM"');
    expect(jenkinsfileContent).toContain('"\\$CUSTOM_INSTRUCTION_PARAM"');
  });

  it('UT-C19/UT-C20/UT-C21: postセクションのクリーンアップとWebhook通知が定義されている', () => {
    // Given/When/Then: always/success/failure が定義されている
    expect(jenkinsfileContent).toContain('post {');
    expect(jenkinsfileContent).toContain('cleanWs()');
    expect(jenkinsfileContent).toContain("status: 'success'");
    expect(jenkinsfileContent).toContain("status: 'failed'");
    expect(jenkinsfileContent).toContain('REPOS_ROOT cleaned up');
    expect(jenkinsfileContent).toContain('CODEX_HOME cleaned up');
  });

  it('UT-A02/UT-A03: validate_dsl.sh に create-sub-issue の検証項目が追加されている', () => {
    // Given/When/Then: expected_paths と scriptPath 検証が含まれる
    expect(validateDslContent).toContain(
      '"jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile"'
    );
    expect(validateDslContent).toContain(
      'ai_workflow_create_sub_issue_job.groovy has correct scriptPath'
    );
    expect(validateDslContent).toContain(
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile')"
    );
  });

  it('UT-A01: validate_dsl.sh を実行して create-sub-issue の検証が成功する', async () => {
    // Given: validate_dsl.sh を bash で実行する
    const { stdout } = await execFileAsync('bash', [paths.validateDsl], {
      cwd: projectRoot,
    });

    // Then: 期待する出力が含まれ、全体が成功している
    expect(stdout).toContain('✓ jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile exists');
    expect(stdout).toContain('✓ ai_workflow_create_sub_issue_job.groovy has correct scriptPath');
    expect(stdout).toContain('=== ✓ All validations passed ===');
  });

  it('UT-A02: Jenkinsfile が未作成の場合に validate_dsl.sh が失敗する', async () => {
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
        '✗ jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile NOT FOUND'
      );
      expect(result.stdout).toContain('=== ✗ Validation failed - please fix the errors above ===');
    } finally {
      // 後始末: Jenkinsfile を元に戻す
      await fs.move(backupPath, paths.jenkinsfile, { overwrite: true });
    }
  });

  it('UT-A03: scriptPath 不一致の場合に validate_dsl.sh が失敗する', async () => {
    // Given: DSL の scriptPath を一時的に誤った値に変更する
    const originalDsl = await fs.readFile(paths.dsl, 'utf8');
    const expectedScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile')";
    const wrongScriptPath =
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile_WRONG')";

    if (!originalDsl.includes(expectedScriptPath)) {
      throw new Error('事前条件: create-sub-issue の scriptPath 定義が見つかりません。');
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
        '✗ ai_workflow_create_sub_issue_job.groovy has incorrect scriptPath'
      );
      expect(result.stdout).toContain('=== ✗ Validation failed - please fix the errors above ===');
    } finally {
      // 後始末: DSL を元に戻す
      await fs.writeFile(paths.dsl, originalDsl, 'utf8');
    }
  });
});
