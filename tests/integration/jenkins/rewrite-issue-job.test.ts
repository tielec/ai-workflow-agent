/**
 * Integration tests for Issue #674: rewrite-issue Jenkins pipeline & Job DSL
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Job DSL, Jenkinsfile, seed config, and validation script)
 * Covered Scenarios: IT-001〜IT-016
 */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { promisify } from 'util';
import yaml from 'yaml';

type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

describe('Integration: rewrite-issue Jenkins pipeline (Issue #674)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const execFileAsync = promisify(execFile);
  const longTimeoutMs = 10 * 60 * 1000;
  const paths = {
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_rewrite_issue_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile'
    ),
    jobConfig: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
    ),
    validateDsl: path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/validate_dsl.sh'),
    distIndex: path.join(projectRoot, 'dist/index.js'),
  };

  let dslContent: string;
  let jenkinsfileContent: string;
  let jobConfig: Record<string, unknown>;
  let validateDslContent: string;

  jest.setTimeout(longTimeoutMs);

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

  describe('IT-001/IT-002/IT-003: DSL構文とscriptPath参照の検証', () => {
    it('scriptPathがJenkinsfileの実パスを参照し、ファイルが存在する', async () => {
      // Given: DSLのscriptPath定義とJenkinsfileのパス
      const expectedScriptPath =
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile')";

      // When: DSL内容とファイル存在を確認する
      const exists = await fs.pathExists(paths.jenkinsfile);

      // Then: scriptPathが一致し、Jenkinsfileが存在する
      expect(dslContent).toContain(expectedScriptPath);
      expect(exists).toBe(true);
    });
  });

  describe('IT-004/IT-005: job-config.yaml エントリ検証', () => {
    it('rewrite_issueジョブのエントリが必要項目を満たす', () => {
      // Given: job-config.yaml のパース結果
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;

      // When: rewrite_issue エントリを取得する
      const entry = jobs['ai_workflow_rewrite_issue_job'];

      // Then: 期待する設定が揃っている
      expect(entry).toMatchObject({
        name: 'rewrite_issue',
        displayName: 'Rewrite Issue',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_rewrite_issue_job.groovy',
        jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile',
        skipJenkinsfileValidation: true,
      });
    });
  });

  describe('IT-006/IT-007/IT-008/IT-009/IT-010: Jenkinsfile 構成検証', () => {
    it('必須パラメータ参照とEXECUTION_MODEが定義される', () => {
      // Given: Jenkinsfile内容

      // When: パラメータ参照と環境変数定義を確認する
      const requiredParams = [
        'params.ISSUE_NUMBER',
        'params.GITHUB_REPOSITORY',
        'params.LANGUAGE',
        'params.AGENT_MODE',
        'params.APPLY',
        'params.DRY_RUN',
        'params.GITHUB_TOKEN',
      ];

      // Then: すべての参照が含まれる
      for (const param of requiredParams) {
        expect(jenkinsfileContent).toContain(param);
      }
      expect(jenkinsfileContent).toContain("EXECUTION_MODE = 'rewrite_issue'");
    });

    it('必要なステージが定義される', () => {
      // Given: Jenkinsfile内容

      // When: stage 名を抽出する
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
        'Execute Rewrite Issue',
      ];
      for (const stage of requiredStages) {
        expect(stageSet.has(stage)).toBe(true);
      }
    });

    it('rewrite-issue CLIコマンドが正しく組み立てられている', () => {
      // Given: Jenkinsfile内容

      // When: CLIコマンド構文を確認する
      // Then: 必須のサブコマンドとオプションが含まれる
      expect(jenkinsfileContent).toContain('node dist/index.js rewrite-issue');
      expect(jenkinsfileContent).toContain('--issue ${issueNumber}');
      expect(jenkinsfileContent).toContain('--language ${params.LANGUAGE}');
      expect(jenkinsfileContent).toContain('--agent ${params.AGENT_MODE ?: \'auto\'}');
      expect(jenkinsfileContent).toContain("def applyFlag = params.APPLY ? '--apply' : ''");
      expect(jenkinsfileContent).toContain(
        "def dryRunFlag = (!params.APPLY && params.DRY_RUN) ? '--dry-run' : ''"
      );
    });

    it('post処理の成功/失敗Webhookとクリーンアップが定義される', () => {
      // Given: Jenkinsfile内容

      // When: postブロックの内容を確認する
      // Then: always/success/failureが定義され、クリーンアップと通知が含まれる
      expect(jenkinsfileContent).toContain('post {');
      expect(jenkinsfileContent).toContain('cleanWs()');
      expect(jenkinsfileContent).toContain("status: 'success'");
      expect(jenkinsfileContent).toContain("status: 'failed'");
      expect(jenkinsfileContent).toContain('REPOS_ROOT cleaned up');
      expect(jenkinsfileContent).toContain('CODEX_HOME cleaned up');
    });
  });

  describe('IT-011/IT-012: Job DSL パラメータ定義とフォルダ構成', () => {
    it('必須パラメータがDSL内で定義される', () => {
      // Given: DSL内容
      const requiredParams = [
        'EXECUTION_MODE',
        'ISSUE_NUMBER',
        'GITHUB_REPOSITORY',
        'AGENT_MODE',
        'LANGUAGE',
        'APPLY',
        'DRY_RUN',
        'GITHUB_TOKEN',
        'CODEX_API_KEY',
        'CLAUDE_CODE_OAUTH_TOKEN',
      ];

      // When/Then: 各パラメータ定義が存在する
      for (const param of requiredParams) {
        expect(dslContent).toMatch(new RegExp(param));
      }
    });

    it('develop と stable-1〜9 フォルダを展開する定義がある', () => {
      // Given: DSL内容

      // When/Then: genericFolders の定義が存在する
      expect(dslContent).toMatch(/name: 'develop'/);
      expect(dslContent).toMatch(/stable-\$\{i\}/);
    });
  });

  describe('IT-013/IT-014/IT-015: ビルド/検証/CLIヘルプの実行確認', () => {
    const commandTimeoutMs = 10 * 60 * 1000;
    let buildStdout = '';
    let buildStderr = '';
    const shouldSkipValidate = process.env.SKIP_VALIDATE_TEST === '1';

    beforeAll(async () => {
      // Given: TypeScriptのビルドが必要
      // When: npm run build を実行する
      const { stdout, stderr } = await execFileAsync('npm', ['run', 'build'], {
        cwd: projectRoot,
        env: process.env,
        timeout: commandTimeoutMs,
        maxBuffer: 50 * 1024 * 1024,
      });

      buildStdout = stdout ?? '';
      buildStderr = stderr ?? '';
    });

    it('npm run build が成功し dist/index.js が生成される', async () => {
      // Given: build 実行済み

      // When: build の成果物を確認する
      const distExists = await fs.pathExists(paths.distIndex);

      // Then: 生成物が存在し、ビルドが完了している
      expect(distExists).toBe(true);
      expect(`${buildStdout}${buildStderr}`).toBeDefined();
    });

    if (shouldSkipValidate) {
      it.skip('npm run validate を実行し正常終了する（再帰実行回避のためスキップ）', () => {
        // Given/When/Then: SKIP_VALIDATE_TEST が設定されているためスキップする
      });
    } else {
      it('npm run validate を実行し正常終了する', async () => {
        // Given: validate は lint/test/build をまとめて実行する

        // When: npm run validate を実行する
        // Note: 再帰実行を避けるため、子プロセス側では SKIP_VALIDATE_TEST を有効化する
        const { stdout, stderr } = await execFileAsync('npm', ['run', 'validate'], {
          cwd: projectRoot,
          env: { ...process.env, SKIP_VALIDATE_TEST: '1' },
          timeout: commandTimeoutMs,
          maxBuffer: 50 * 1024 * 1024, // 50MB: VM Modules 警告等で stderr が大きくなるため
        });

        // Then: 検証コマンドが正常終了する
        expect(stdout).toBeDefined();
        expect(stderr).toBeDefined();
      });
    }

    it('node dist/index.js rewrite-issue --help がヘルプを出力する', async () => {
      // Given: build 済みの dist/index.js

      // When: rewrite-issue のヘルプを取得する
      const { stdout } = await execFileAsync('node', [paths.distIndex, 'rewrite-issue', '--help'], {
        cwd: projectRoot,
        env: process.env,
        timeout: commandTimeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      // Then: コマンド説明と必須オプションが表示される
      expect(stdout).toContain('Rewrite existing GitHub Issue with repository context');
      expect(stdout).toContain('--issue <number>');
    });
  });

  describe('IT-016: validate_dsl.sh 拡張検証', () => {
    it('rewrite-issue Jenkinsfile と DSL の検証が追加されている', () => {
      // Given: validate_dsl.sh の内容

      // When/Then: expected_paths と scriptPath整合性チェックに rewrite-issue が含まれる
      expect(validateDslContent).toContain(
        'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile'
      );
      expect(validateDslContent).toContain(
        "ai_workflow_rewrite_issue_job.groovy has correct scriptPath"
      );
    });
  });

  describe('IT-001/IT-002/IT-003: validate_dsl.sh 実行検証', () => {
    it('validate_dsl.sh を実行し正常終了する', async () => {
      // Given: validate_dsl.sh のパス

      // When: スクリプトを実行する
      const { stdout } = await execFileAsync('bash', [paths.validateDsl], {
        cwd: projectRoot,
      });

      // Then: 成功メッセージが含まれる
      expect(stdout).toContain('All validations passed');
    });
  });
});
