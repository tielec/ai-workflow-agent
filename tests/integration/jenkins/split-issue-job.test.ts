/**
 * Integration tests for Issue #714: split-issue Jenkins pipeline & Job DSL
 *
 * Test Strategy: UNIT_ONLY (static validation of Job DSL, Jenkinsfile, seed config)
 * Covered Scenarios: UT-001〜UT-028
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

describe('Integration: split-issue Jenkins pipeline (Issue #714)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const execFileAsync = promisify(execFile);
  const longTimeoutMs = 10 * 60 * 1000;
  const paths = {
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile'
    ),
    jobConfig: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
    ),
    validateDsl: path.join(projectRoot, 'jenkins/jobs/dsl/ai-workflow/validate_dsl.sh'),
    distIndex: path.join(projectRoot, 'dist/index.js'),
    rewriteDsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_rewrite_issue_job.groovy'
    ),
    rewriteJenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile'
    ),
  };

  let dslContent = '';
  let jenkinsfileContent = '';
  let jobConfig: Record<string, unknown> = {};
  let validateDslContent = '';

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

  describe('UT-001/UT-002/UT-003: DSL構文とscriptPath参照の検証', () => {
    it('UT-001: DSLファイルが正しいパスに存在する', async () => {
      // Given: DSLのファイルパス

      // When: ファイル存在を確認する
      const exists = await fs.pathExists(paths.dsl);

      // Then: ファイルが存在する
      expect(exists).toBe(true);
    });

    it('UT-002: DSLのscriptPathが正しいJenkinsfileパスを参照している', () => {
      // Given: DSL内容
      const expectedScriptPath =
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile')";

      // When/Then: scriptPathが一致する
      expect(dslContent).toContain(expectedScriptPath);
    });

    it('UT-003: scriptPathが参照するJenkinsfileが存在する', async () => {
      // Given: Jenkinsfileのパス

      // When: ファイル存在を確認する
      const exists = await fs.pathExists(paths.jenkinsfile);

      // Then: ファイルが存在する
      expect(exists).toBe(true);
    });
  });

  describe('UT-004/UT-005/UT-006: job-config.yaml エントリ検証', () => {
    it('UT-004: job-config.yamlがYAMLとしてパースできる', () => {
      // Given: job-config.yaml のパース結果

      // When/Then: パース結果が取得できる
      expect(jobConfig).toBeDefined();
      expect(jobConfig).not.toEqual({});
    });

    it('UT-005: split_issueジョブのエントリが必要項目を満たす', () => {
      // Given: job-config.yaml のパース結果
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;

      // When: split_issue エントリを取得する
      const entry = jobs['ai_workflow_split_issue_job'];

      // Then: 期待する設定が揃っている
      expect(entry).toMatchObject({
        name: 'split_issue',
        displayName: 'Split Issue',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_split_issue_job.groovy',
        jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile',
        skipJenkinsfileValidation: true,
      });
    });

    it('UT-006: rewrite_issueジョブのエントリが変更されていない', () => {
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

  describe('UT-007〜UT-013: Jenkinsfile 構成検証', () => {
    it("UT-007: EXECUTION_MODEが'split_issue'に設定されている", () => {
      // Given: Jenkinsfile内容

      // When/Then: 環境変数定義が含まれる
      expect(jenkinsfileContent).toContain("EXECUTION_MODE = 'split_issue'");
    });

    it('UT-008: 必須パラメータ参照がJenkinsfile内に存在する', () => {
      // Given: Jenkinsfile内容

      // When: 必須パラメータ参照を確認する
      const requiredParams = [
        'params.ISSUE_NUMBER',
        'params.GITHUB_REPOSITORY',
        'params.LANGUAGE',
        'params.AGENT_MODE',
        'params.APPLY',
        'params.DRY_RUN',
        'params.GITHUB_TOKEN',
        'params.MAX_SPLITS',
      ];

      // Then: すべての参照が含まれる
      for (const param of requiredParams) {
        expect(jenkinsfileContent).toContain(param);
      }
    });

    it('UT-009: 必要な7つのステージが定義されている', () => {
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
        'Execute Split Issue',
      ];
      for (const stage of requiredStages) {
        expect(stageSet.has(stage)).toBe(true);
      }
    });

    it('UT-010: split-issue CLIコマンドが正しく組み立てられている', () => {
      // Given: Jenkinsfile内容

      // When/Then: 必須のサブコマンドとオプションが含まれる
      expect(jenkinsfileContent).toContain('node dist/index.js split-issue');
      expect(jenkinsfileContent).toContain('--issue ${issueNumber}');
      expect(jenkinsfileContent).toContain('--language ${params.LANGUAGE}');
      expect(jenkinsfileContent).toContain('--agent ${params.AGENT_MODE ?: \'auto\'}');
      expect(jenkinsfileContent).toContain("def applyFlag = params.APPLY ? '--apply' : ''");
      expect(jenkinsfileContent).toContain(
        "def dryRunFlag = (!params.APPLY && params.DRY_RUN) ? '--dry-run' : ''"
      );
    });

    it('UT-011: MAX_SPLITSパラメータの受け渡しロジックが実装されている', () => {
      // Given: Jenkinsfile内容

      // When/Then: MAX_SPLITS参照とオプション構築が含まれる
      expect(jenkinsfileContent).toContain('params.MAX_SPLITS');
      expect(jenkinsfileContent).toContain('--max-splits');
      expect(jenkinsfileContent).toContain(
        "def maxSplitsOption = params.MAX_SPLITS ? \"--max-splits ${params.MAX_SPLITS}\" : ''"
      );
    });

    it('UT-012: post処理の成功/失敗Webhookとクリーンアップが定義されている', () => {
      // Given: Jenkinsfile内容

      // When/Then: postブロックの内容を確認する
      expect(jenkinsfileContent).toContain('post {');
      expect(jenkinsfileContent).toContain('cleanWs()');
      expect(jenkinsfileContent).toContain("status: 'success'");
      expect(jenkinsfileContent).toContain("status: 'failed'");
      expect(jenkinsfileContent).toContain('REPOS_ROOT cleaned up');
      expect(jenkinsfileContent).toContain('CODEX_HOME cleaned up');
    });

    it('UT-013: パラメータバリデーションが実装されている', () => {
      // Given: Jenkinsfile内容

      // When/Then: バリデーションメッセージが含まれる
      expect(jenkinsfileContent).toContain('ISSUE_NUMBER parameter is required');
      expect(jenkinsfileContent).toContain('ISSUE_NUMBER must be a number');
      expect(jenkinsfileContent).toContain('GITHUB_REPOSITORY parameter is required');
      expect(jenkinsfileContent).toContain("owner/repo");
    });
  });

  describe('UT-014〜UT-018: Job DSL パラメータ定義とフォルダ構成', () => {
    it('UT-014: 必須パラメータがDSL内で定義されている', () => {
      // Given: DSL内容
      const requiredParams = [
        'EXECUTION_MODE',
        'ISSUE_NUMBER',
        'GITHUB_REPOSITORY',
        'AGENT_MODE',
        'LANGUAGE',
        'APPLY',
        'DRY_RUN',
        'MAX_SPLITS',
        'GITHUB_TOKEN',
        'OPENAI_API_KEY',
        'CODEX_API_KEY',
        'CODEX_AUTH_JSON',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_API_KEY',
        'ANTHROPIC_API_KEY',
        'LOG_LEVEL',
        'JOB_ID',
        'WEBHOOK_URL',
        'WEBHOOK_TOKEN',
      ];

      // When/Then: 各パラメータ定義が存在する
      for (const param of requiredParams) {
        expect(dslContent).toMatch(new RegExp(param));
      }
    });

    it('UT-015: MAX_SPLITSがstringParamで定義され、デフォルト値と説明がある', () => {
      // Given: DSL内容

      // When/Then: stringParam定義とデフォルト値が含まれる
      expect(dslContent).toContain("stringParam('MAX_SPLITS'");
      expect(dslContent).toContain("'10'");
      expect(dslContent).toContain('分割Issue数の上限');
    });

    it("UT-016: EXECUTION_MODEが'split_issue'に固定されている", () => {
      // Given: DSL内容

      // When/Then: choiceParamとenvironmentVariablesの設定を確認する
      expect(dslContent).toContain("choiceParam('EXECUTION_MODE', ['split_issue']");
      expect(dslContent).toContain("env('EXECUTION_MODE', 'split_issue')");
    });

    it('UT-017: develop と stable-1〜9 フォルダを展開する定義がある', () => {
      // Given: DSL内容

      // When/Then: genericFolders 定義が存在する
      expect(dslContent).toMatch(/name: 'develop'/);
      expect(dslContent).toMatch(/stable-\$\{i\}/);
    });

    it('UT-018: ログローテーションと並行ビルド防止が設定されている', () => {
      // Given: DSL内容

      // When/Then: 設定が含まれる
      expect(dslContent).toContain('numToKeep(30)');
      expect(dslContent).toContain('daysToKeep(90)');
      expect(dslContent).toContain('disableConcurrentBuilds()');
    });
  });

  describe('UT-019〜UT-023: rewrite-issue との差分検証', () => {
    it("UT-019: Jenkinsfileのモード表示が'Split Issue'に変更されている", () => {
      // Given: Jenkinsfile内容

      // When/Then: モード表示が正しい
      expect(jenkinsfileContent).toContain('Mode: Split Issue');
      expect(jenkinsfileContent).not.toContain('Mode: Rewrite Issue');
    });

    it("UT-020: ビルド説明が'Split Issue'形式になっている", () => {
      // Given: Jenkinsfile内容

      // When/Then: ビルド説明が Split Issue で始まる
      expect(jenkinsfileContent).toContain('Split Issue #');
      expect(jenkinsfileContent).not.toContain('Rewrite Issue #');
    });

    it("UT-021: postセクションのログメッセージが'Split Issue'に変更されている", () => {
      // Given: Jenkinsfile内容

      // When/Then: 成功/失敗メッセージが Split Issue である
      expect(jenkinsfileContent).toContain('Split Issue Success');
      expect(jenkinsfileContent).toContain('Split Issue Failure');
      expect(jenkinsfileContent).toContain('Split issue completed');
      expect(jenkinsfileContent).not.toContain('Rewrite Issue Success');
      expect(jenkinsfileContent).not.toContain('Rewrite Issue Failure');
      expect(jenkinsfileContent).not.toContain('Rewrite issue completed');
    });

    it('UT-022: Job DSLのdescriptionが分割機能の説明になっている', () => {
      // Given: DSL内容

      // When/Then: Split Issue の説明が含まれる
      expect(dslContent).toContain('AI Workflow - Split Issue');
      expect(dslContent).toMatch(/分割|split/i);
      expect(dslContent).not.toContain('AI Workflow - Rewrite Issue');
    });

    it("UT-023: Job DSLのjobKeyが'ai_workflow_split_issue_job'に設定されている", () => {
      // Given: DSL内容

      // When/Then: jobKey が正しく設定されている
      expect(dslContent).toContain("def jobKey = 'ai_workflow_split_issue_job'");
      expect(dslContent).not.toContain('ai_workflow_rewrite_issue_job');
    });
  });

  describe('UT-024/UT-025/UT-026: ビルド・検証・CLIヘルプの実行確認', () => {
    const commandTimeoutMs = 5 * 60 * 1000;
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
      });

      buildStdout = stdout ?? '';
      buildStderr = stderr ?? '';
    });

    it('UT-024: npm run build が成功し dist/index.js が生成される', async () => {
      // Given: build 実行済み

      // When: build の成果物を確認する
      const distExists = await fs.pathExists(paths.distIndex);

      // Then: 生成物が存在し、ビルドが完了している
      expect(distExists).toBe(true);
      expect(`${buildStdout}${buildStderr}`).toBeDefined();
    });

    if (shouldSkipValidate) {
      it.skip('UT-025: npm run validate を実行し正常終了する（再帰実行回避のためスキップ）', () => {
        // Given/When/Then: SKIP_VALIDATE_TEST が設定されているためスキップする
      });
    } else {
      it('UT-025: npm run validate を実行し正常終了する', async () => {
        // Given: validate は lint/test/build をまとめて実行する

        // When: npm run validate を実行する
        // Note: 再帰実行を避けるため、子プロセス側では SKIP_VALIDATE_TEST を有効化する
        const { stdout, stderr } = await execFileAsync('npm', ['run', 'validate'], {
          cwd: projectRoot,
          env: { ...process.env, SKIP_VALIDATE_TEST: '1' },
          timeout: commandTimeoutMs,
          maxBuffer: 50 * 1024 * 1024,
        });

        // Then: 検証コマンドが正常終了する
        expect(stdout).toBeDefined();
        expect(stderr).toBeDefined();
      });
    }

    it('UT-026: node dist/index.js split-issue --help がヘルプを出力する', async () => {
      // Given: build 済みの dist/index.js

      // When: split-issue のヘルプを取得する
      const { stdout } = await execFileAsync('node', [paths.distIndex, 'split-issue', '--help'], {
        cwd: projectRoot,
        env: process.env,
        timeout: commandTimeoutMs,
      });

      // Then: コマンド説明と必須オプションが表示される
      expect(stdout).toContain('Split complex GitHub Issue into feature-based sub-issues');
      expect(stdout).toContain('--issue <number>');
      expect(stdout).toContain('--max-splits <number>');
    });
  });

  describe('UT-027/UT-028: validate_dsl.sh 拡張検証', () => {
    it('UT-027: validate_dsl.sh に split-issue の Jenkinsfile パスが追加されている', () => {
      // Given: validate_dsl.sh の内容

      // When/Then: expected_paths に split-issue パスが含まれる
      expect(validateDslContent).toContain(
        'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile'
      );
    });

    it('UT-028: validate_dsl.sh に split-issue の scriptPath 整合性チェックが追加されている', () => {
      // Given: validate_dsl.sh の内容

      // When/Then: split-issue の scriptPath チェックが含まれる
      expect(validateDslContent).toContain(
        'ai_workflow_split_issue_job.groovy has correct scriptPath'
      );
    });
  });
});
