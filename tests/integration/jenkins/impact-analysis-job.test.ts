/**
 * Integration tests for Issue #858: impact-analysis Jenkins pipeline & Job DSL
 *
 * Test Strategy: UNIT_INTEGRATION (統合テスト部分)
 * Covered Scenarios: IT-001〜IT-014
 *
 * リファレンス: tests/integration/jenkins/rewrite-issue-job.test.ts
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

describe('Integration: impact-analysis Jenkins pipeline (Issue #858)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const execFileAsync = promisify(execFile);
  const longTimeoutMs = 10 * 60 * 1000;
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
    distIndex: path.join(projectRoot, 'dist/index.js'),
  };

  let dslContent: string;
  let jenkinsfileContent: string;
  let jobConfig: Record<string, unknown>;
  let validateDslContent: string;

  jest.setTimeout(longTimeoutMs);

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
  // 3.2 DSL 構文と scriptPath 参照の検証
  // ===========================================================================

  describe('IT-001: scriptPathがJenkinsfileの実パスを参照し、ファイルが存在する', () => {
    it('scriptPathがJenkinsfileの実パスを参照し、ファイルが存在する', async () => {
      // Given: DSLのscriptPath定義とJenkinsfileのパス
      const expectedScriptPath =
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile')";

      // When: DSL内容とファイル存在を確認する
      const exists = await fs.pathExists(paths.jenkinsfile);

      // Then: scriptPathが一致し、Jenkinsfileが存在する
      expect(dslContent).toContain(expectedScriptPath);
      expect(exists).toBe(true);
    });
  });

  // ===========================================================================
  // 3.3 job-config.yaml エントリ検証
  // ===========================================================================

  describe('IT-002: impact_analysisジョブのエントリが必要項目を満たす', () => {
    it('impact_analysisジョブのエントリが必要項目を満たす', () => {
      // Given: job-config.yaml のパース結果
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;

      // When: impact_analysis エントリを取得する
      const entry = jobs['ai_workflow_impact_analysis_job'];

      // Then: 期待する設定が揃っている
      expect(entry).toMatchObject({
        name: 'impact_analysis',
        displayName: 'Impact Analysis',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_impact_analysis_job.groovy',
        jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile',
        skipJenkinsfileValidation: true,
      });
    });
  });

  // ===========================================================================
  // 3.4 Jenkinsfile 構成検証
  // ===========================================================================

  describe('IT-003/IT-004/IT-005/IT-006: Jenkinsfile 構成検証', () => {
    it('IT-003: 必須パラメータ参照とEXECUTION_MODEが定義されている', () => {
      // Given: Jenkinsfile内容

      // When: パラメータ参照と環境変数定義を確認する
      const requiredParams = [
        'params.PR_NUMBER',
        'params.PR_URL',
        'params.GITHUB_REPOSITORY',
        'params.LANGUAGE',
        'params.AGENT_MODE',
        'params.DRY_RUN',
        'params.CUSTOM_INSTRUCTION',
        'params.GITHUB_TOKEN',
      ];

      // Then: すべての参照が含まれる
      for (const param of requiredParams) {
        expect(jenkinsfileContent).toContain(param);
      }
      expect(jenkinsfileContent).toContain("EXECUTION_MODE = 'impact_analysis'");
    });

    it('IT-004: 必要なステージが定義されている', () => {
      // Given: Jenkinsfile内容

      // When: stage 名を抽出する
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

    it('IT-005: impact-analysis CLIコマンドが正しく組み立てられている', () => {
      // Given: Jenkinsfile内容

      // When/Then: 基本コマンドが含まれる
      expect(jenkinsfileContent).toContain('node dist/index.js impact-analysis');

      // When/Then: PR_URL オプション組み立てロジックが含まれる
      expect(jenkinsfileContent).toContain('--pr-url');

      // When/Then: PR_NUMBER オプション組み立てロジックが含まれる
      expect(jenkinsfileContent).toContain('--pr ${env.PR_NUMBER}');

      // When/Then: エージェントモードが含まれる
      expect(jenkinsfileContent).toContain("--agent ${params.AGENT_MODE ?: 'auto'}");

      // When/Then: customInstructionFlag の条件組み立てロジックが含まれる
      expect(jenkinsfileContent).toContain('customInstructionFlag');

      // When/Then: dryRunFlag の条件組み立てロジックが含まれる
      expect(jenkinsfileContent).toContain('dryRunFlag');
    });

    it('IT-006: post処理のWebhookとクリーンアップが定義されている', () => {
      // Given: Jenkinsfile内容

      // When/Then: post ブロックが存在する
      expect(jenkinsfileContent).toContain('post {');

      // When/Then: cleanWs() が含まれる
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
  });

  // ===========================================================================
  // 3.5 Job DSL パラメータ定義とフォルダ構成
  // ===========================================================================

  describe('IT-007/IT-008: Job DSL パラメータ定義とフォルダ構成', () => {
    it('IT-007: 必須パラメータがDSL内で定義されている', () => {
      // Given: DSL内容
      const requiredParams = [
        'EXECUTION_MODE',
        'PR_NUMBER',
        'PR_URL',
        'GITHUB_REPOSITORY',
        'AGENT_MODE',
        'LANGUAGE',
        'DRY_RUN',
        'CUSTOM_INSTRUCTION',
        'GITHUB_TOKEN',
        'CODEX_API_KEY',
        'CLAUDE_CODE_OAUTH_TOKEN',
      ];

      // When/Then: 各パラメータ定義が存在する
      for (const param of requiredParams) {
        expect(dslContent).toMatch(new RegExp(param));
      }
    });

    it('IT-008: developとstable-1〜9フォルダを展開する定義がある', () => {
      // Given: DSL内容

      // When/Then: genericFolders の定義が存在する
      expect(dslContent).toMatch(/name: 'develop'/);
      expect(dslContent).toMatch(/stable-\$\{i\}/);
    });
  });

  // ===========================================================================
  // 3.6 CUSTOM_INSTRUCTION パラメータとログ出力の検証
  // ===========================================================================

  describe('IT-009/IT-010: CUSTOM_INSTRUCTION パラメータとログ出力の検証', () => {
    it('IT-009: DSLにCUSTOM_INSTRUCTION textParamが追加されている', () => {
      // Given/When/Then: textParam 定義が存在する
      expect(dslContent).toMatch(/textParam\('CUSTOM_INSTRUCTION'/);

      // When/Then: 説明文に文字数制限の記載がある
      expect(dslContent).toContain('500文字');
    });

    it('IT-010: Validate ParametersステージでCustom Instruction値をログ出力している', () => {
      // Given/When/Then: Validate Parameters ステージ内で Custom Instruction のログ出力パターンが存在する
      const validateStagePattern =
        /stage\('Validate Parameters'\)[\s\S]*?echo "Custom Instruction: \${params\.CUSTOM_INSTRUCTION \?: '\(none\)'}"/;
      expect(jenkinsfileContent).toMatch(validateStagePattern);
    });
  });

  // ===========================================================================
  // 3.7 ビルド・検証・CLI ヘルプの実行確認
  // ===========================================================================

  describe('IT-011/IT-012/IT-013: ビルド/検証/CLIヘルプの実行確認', () => {
    const commandTimeoutMs = 10 * 60 * 1000;
    let buildStdout = '';
    let buildStderr = '';

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

    it('IT-011: npm run buildが成功しdist/index.jsが生成される', async () => {
      // Given: build 実行済み

      // When: build の成果物を確認する
      const distExists = await fs.pathExists(paths.distIndex);

      // Then: 生成物が存在し、ビルドが完了している
      expect(distExists).toBe(true);
      expect(`${buildStdout}${buildStderr}`).toBeDefined();
    });

    it('IT-012: validate_dsl.shを実行し正常終了する', async () => {
      // Given: validate_dsl.sh のパス

      // When: スクリプトを実行する
      const { stdout } = await execFileAsync('bash', [paths.validateDsl], {
        cwd: projectRoot,
      });

      // Then: 成功メッセージが含まれる
      expect(stdout).toContain('All validations passed');
    });

    it('IT-013: node dist/index.js impact-analysis --helpがヘルプを出力する', async () => {
      // Given: build 済みの dist/index.js

      // When: impact-analysis のヘルプを取得する
      const { stdout } = await execFileAsync(
        'node',
        [paths.distIndex, 'impact-analysis', '--help'],
        {
          cwd: projectRoot,
          env: process.env,
          timeout: commandTimeoutMs,
          maxBuffer: 10 * 1024 * 1024,
        }
      );

      // Then: コマンド説明と必須オプションが表示される
      expect(stdout).toContain('--pr');
    });
  });

  // ===========================================================================
  // 3.8 validate_dsl.sh 拡張検証
  // ===========================================================================

  describe('IT-014: validate_dsl.sh 拡張検証', () => {
    it('impact-analysis JenkinsfileとDSLの検証が追加されている', () => {
      // Given: validate_dsl.sh の内容

      // When/Then: expected_paths に impact-analysis Jenkinsfile が含まれる
      expect(validateDslContent).toContain(
        'jenkins/jobs/pipeline/ai-workflow/impact-analysis/Jenkinsfile'
      );

      // When/Then: scriptPath 整合性チェックに impact-analysis DSL が含まれる
      expect(validateDslContent).toContain(
        'ai_workflow_impact_analysis_job.groovy has correct scriptPath'
      );
    });
  });
});
