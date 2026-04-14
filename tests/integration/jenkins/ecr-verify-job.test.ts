/**
 * Integration tests for Issue #815: ECR verify Jenkins pipeline / Job DSL
 *
 * テスト戦略: INTEGRATION_ONLY（Jenkinsfile / Job DSL / seed config の静的検証）
 * 対応テストシナリオ: IT-001〜IT-033（静的検証 + 任意のvalidate実行）
 */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'util';
import yaml from 'yaml';

type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

type ParameterKind = 'string' | 'nonStoredPassword';

type ParameterDefinition = {
  name: string;
  kind: ParameterKind;
  defaultValue?: string;
};

describe('Integration: ECR verify Jenkins pipeline (Issue #815)', () => {
  const testDirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDirname, '../../..');
  const execFileAsync = promisify(execFile);
  const longTimeoutMs = 10 * 60 * 1000;

  const paths = {
    jobConfig: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
    ),
    folderConfig: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/folder-config.yaml'
    ),
    dsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_ecr_verify_job.groovy'
    ),
    ecrBuildDsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_ecr_build_job.groovy'
    ),
    allPhasesDsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/ecr-verify/Jenkinsfile'
    ),
    ecrBuildJenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile'
    ),
    readme: path.join(projectRoot, 'jenkins/README.md'),
    rootReadme: path.join(projectRoot, 'README.md'),
  };

  let jobConfig: Record<string, unknown> = {};
  let folderConfig: Record<string, unknown> = {};
  let dslContent = '';
  let ecrBuildDslContent = '';
  let allPhasesDslContent = '';
  let jenkinsfileContent = '';
  let ecrBuildJenkinsfileContent = '';
  let readmeContent = '';
  let rootReadmeContent = '';

  jest.setTimeout(longTimeoutMs);

  beforeAll(async () => {
    const [
      jobConfigRaw,
      folderConfigRaw,
      dslRaw,
      ecrBuildDslRaw,
      allPhasesDslRaw,
      jenkinsfileRaw,
      ecrBuildJenkinsfileRaw,
      readmeRaw,
      rootReadmeRaw,
    ] =
      await Promise.all([
        fs.readFile(paths.jobConfig, 'utf8'),
        fs.readFile(paths.folderConfig, 'utf8'),
        fs.readFile(paths.dsl, 'utf8'),
        fs.readFile(paths.ecrBuildDsl, 'utf8'),
        fs.readFile(paths.allPhasesDsl, 'utf8'),
        fs.readFile(paths.jenkinsfile, 'utf8'),
        fs.readFile(paths.ecrBuildJenkinsfile, 'utf8'),
        fs.readFile(paths.readme, 'utf8'),
        fs.readFile(paths.rootReadme, 'utf8'),
      ]);

    jobConfig = yaml.parse(jobConfigRaw) as Record<string, unknown>;
    folderConfig = yaml.parse(folderConfigRaw) as Record<string, unknown>;
    dslContent = dslRaw;
    ecrBuildDslContent = ecrBuildDslRaw;
    allPhasesDslContent = allPhasesDslRaw;
    jenkinsfileContent = jenkinsfileRaw;
    ecrBuildJenkinsfileContent = ecrBuildJenkinsfileRaw;
    readmeContent = readmeRaw;
    rootReadmeContent = rootReadmeRaw;
  });

  describe('IT-001〜IT-003: job-config.yaml エントリ検証', () => {
    it('ai_workflow_ecr_verify_job エントリが必須プロパティを持つ', () => {
      // Given: job-config.yaml を読み込む
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_verify_job'];

      // Then: 必須プロパティと値が一致する
      expect(entry).toBeDefined();
      expect(entry).toMatchObject({
        name: 'ecr_verify',
        displayName: 'ECR Image Verify',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_ecr_verify_job.groovy',
        jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/ecr-verify/Jenkinsfile',
      });
      expect(entry!.skipJenkinsfileValidation).toBe(true);
    });

    it('job-config.yaml のJenkinsfileパスが実在する', async () => {
      // Given: job-config.yaml のエントリ
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_verify_job'];
      const jenkinsfileAbsolute = path.join(projectRoot, entry!.jenkinsfile);

      // Then: Jenkinsfileが存在する
      const exists = await fs.pathExists(jenkinsfileAbsolute);
      expect(exists).toBe(true);
    });

    it('job-config.yaml のDSLパスが実在する', async () => {
      // Given: job-config.yaml のエントリ
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_verify_job'];
      const dslfileAbsolute = path.join(projectRoot, entry!.dslfile);

      // Then: DSLファイルが存在する
      const exists = await fs.pathExists(dslfileAbsolute);
      expect(exists).toBe(true);
    });
  });

  describe('IT-004: folder-config.yaml 更新検証', () => {
    it('AI_Workflow フォルダ説明に ecr_verify が追記されている', () => {
      // Given: folder-config.yaml を読み込む
      const folders = (folderConfig.folders || []) as Array<{ path: string; description: string }>;
      const aiWorkflowFolder = folders.find((folder) => folder.path === 'AI_Workflow');

      // Then: 説明文にecr_verifyが含まれる
      expect(aiWorkflowFolder).toBeDefined();
      expect(aiWorkflowFolder?.description).toContain('ecr_verify');
      expect(aiWorkflowFolder?.description).toMatch(/ecr_verify.*ECR.*(検証|動作確認|イメージ)/);
    });
  });

  describe('IT-005〜IT-010: Job DSL の構成検証', () => {
    it('genericFolders 定義がDevelopのみの構成になっている', () => {
      // Given: DSL内容

      // Then: develop定義が存在し、stable定義が存在しない
      expect(dslContent).toMatch(/\[name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '\*\/develop'\]/);
      expect(dslContent).not.toMatch(/\(1\.\.9\)\.collect\s*\{\s*i\s*->/);
      expect(dslContent).not.toMatch(/name: "stable-\$\{i\}"/);
      expect(dslContent).not.toMatch(/branch: '\*\/main'/);
    });

    it('パラメータ定義が3個で順序・型・デフォルト値が正しい', () => {
      // Given: parameters ブロック
      const definitions = parseParameterDefinitions(dslContent);
      const expectedOrder = ['AWS_REGION', 'ECR_REPOSITORY_NAME', 'IMAGE_TAG'];

      // Then: パラメータ順序と件数
      expect(definitions.map((def) => def.name)).toEqual(expectedOrder);
      expect(definitions).toHaveLength(expectedOrder.length);

      const findDef = (name: string) => definitions.find((def) => def.name === name);

      expect(findDef('AWS_REGION')?.defaultValue).toBe('ap-northeast-1');
      expect(findDef('ECR_REPOSITORY_NAME')?.defaultValue).toBe('ai-workflow-agent');
      expect(findDef('IMAGE_TAG')?.defaultValue).toBe('latest');

      expect(findDef('AWS_ACCOUNT_ID')).toBeUndefined();
      expect(findDef('AWS_ACCESS_KEY_ID')).toBeUndefined();
      expect(findDef('AWS_SECRET_ACCESS_KEY')).toBeUndefined();
      expect(findDef('AWS_SESSION_TOKEN')).toBeUndefined();
    });

    it('logRotator に numToKeep(30) / daysToKeep(90) が設定されている', () => {
      // Given: DSL内容
      const retentionPattern =
        /logRotator\s*\{\s*[\s\S]*numToKeep\(30\)[\s\S]*daysToKeep\(90\)/;

      // Then: 期待設定が存在する
      expect(dslContent).toMatch(retentionPattern);
    });

    it('cpsScm設定にscriptPath/URL/credentialsが定義されている', () => {
      // Given: DSL内容
      expect(dslContent).toContain(
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/ecr-verify/Jenkinsfile')"
      );
      expect(dslContent).toContain("url('https://github.com/tielec/ai-workflow-agent.git')");
      expect(dslContent).toContain("credentials('github-token')");
    });

    it('disableConcurrentBuilds が有効で、ジョブが有効状態になっている', () => {
      // Given: DSL内容
      expect(dslContent).toContain('disableConcurrentBuilds()');
      expect(dslContent).toContain('disabled(false)');
    });

    it('displayName とパラメータ数コメントが正しく設定されている', () => {
      // Given: DSL内容
      expect(dslContent).toContain('ECR Image Verify');
      expect(dslContent).toContain('パラメータ数: 3個');
    });
  });

  describe('IT-011〜IT-022: Jenkinsfile 構成検証', () => {
    it('5ステージ構成で期待どおりのステージ名を持つ', () => {
      // Given: Jenkinsfile内容
      const stages = extractStageNames(jenkinsfileContent);

      // Then: ステージ構成が一致する
      expect(stages).toEqual([
        'Validate Parameters',
        'Verify ECR Credential Helper',
        'Pull Image',
        'Verify Container',
        'Report Results',
      ]);
    });

    it("agentが 'ec2-fleet-micro' ラベルで定義される", () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("label 'ec2-fleet-micro'");
    });

    it("triggersにcron 'H 9 * * *' が定義され、H 2 が含まれない", () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("cron('H 9 * * *')");
      expect(jenkinsfileContent).not.toContain("cron('H 2 * * *')");
    });

    it('timeoutが15分で設定されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/timeout\(time:\s*15,\s*unit:\s*'MINUTES'\)/);
    });

    it('optionsにtimestamps/ansiColor/disableConcurrentBuildsが含まれる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('timestamps()');
      expect(jenkinsfileContent).toContain("ansiColor('xterm')");
      expect(jenkinsfileContent).toContain('disableConcurrentBuilds()');
    });

    it('environmentに必要な環境変数のみが定義される', () => {
      // Given: Jenkinsfile内容
      const expectedEnvKeys = [
        'AWS_DEFAULT_REGION',
        'AWS_REGION_VALUE',
        'ECR_REPOSITORY_NAME_VALUE',
        'IMAGE_TAG_VALUE',
      ];

      // Then: すべての環境変数が存在する
      for (const key of expectedEnvKeys) {
        expect(jenkinsfileContent).toMatch(new RegExp(`${key}\\s*=`));
      }

      expect(jenkinsfileContent).not.toMatch(/IMAGE_RETENTION_COUNT_VALUE\s*=/);
      expect(jenkinsfileContent).not.toMatch(/AWS_ACCOUNT_ID_VALUE\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).not.toMatch(/AWS_ACCESS_KEY_ID\s*=\s*"\$\{params\.AWS_ACCESS_KEY_ID/);
      expect(jenkinsfileContent).not.toMatch(/AWS_SECRET_ACCESS_KEY\s*=\s*"\$\{params\.AWS_SECRET_ACCESS_KEY/);
      expect(jenkinsfileContent).not.toMatch(/AWS_SESSION_TOKEN\s*=\s*"\$\{params\.AWS_SESSION_TOKEN/);
    });

    it('Validate ParametersステージにSTS自動取得ロジックが実装されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('aws sts get-caller-identity --query Account --output text');
      expect(jenkinsfileContent).toMatch(/returnStdout:\s*true/);
      expect(jenkinsfileContent).toMatch(/env\.AWS_ACCOUNT_ID_VALUE\s*=/);
      expect(jenkinsfileContent).toMatch(/AWS STS.*取得に失敗|インスタンスプロファイル/);
    });

    it('Verify ECR Credential Helperステージにcredential helper検証が含まれる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("stage('Verify ECR Credential Helper')");
      expect(jenkinsfileContent).toMatch(/docker-credential-ecr-login version/);
      expect(jenkinsfileContent).not.toMatch(/aws ecr get-login-password/);
      expect(jenkinsfileContent).not.toMatch(/--password-stdin/);
      expect(jenkinsfileContent).not.toMatch(/docker login/);
    });

    it('Pull Imageステージでdocker pullとreturnStatus判定がある', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/docker pull/);
      expect(jenkinsfileContent).toMatch(/ECR_IMAGE_NAME/);
      expect(jenkinsfileContent).toMatch(/IMAGE_TAG_VALUE/);
      expect(jenkinsfileContent).toMatch(/returnStatus:\s*true/);
    });

    it('Verify Containerステージで13項目の検証が実装されている', () => {
      // Given: Jenkinsfile内容
      const expectedExitCodeCommands = [
        'echo OK',
        'node --version',
        'npm --version',
        'node dist/index.js --help',
        'python3 --version',
        'go version',
        'java -version',
        'ruby --version',
        'git --version',
        'gh --version',
        'aws --version',
        'sudo --version',
      ];

      // Then: 12項目のコマンドが含まれる
      for (const command of expectedExitCodeCommands) {
        expect(jenkinsfileContent).toContain(command);
      }

      expect(jenkinsfileContent).toContain('AGENT_CAN_INSTALL_PACKAGES');
      expect(jenkinsfileContent).toMatch(/sh -c 'echo \\\$AGENT_CAN_INSTALL_PACKAGES'/);
      expect(jenkinsfileContent).toContain('docker run --rm');
      expect(jenkinsfileContent).toContain('PASS:');
      expect(jenkinsfileContent).toContain('FAIL:');
      expect(jenkinsfileContent).toMatch(/failed\s*<</);
      expect(jenkinsfileContent).toMatch(/failed\.join/);
    });

    it('postブロックでローカルイメージのクリーンアップが行われる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/post\s*\{/);
      expect(jenkinsfileContent).toMatch(/always\s*\{/);
      expect(jenkinsfileContent).toMatch(/success\s*\{/);
      expect(jenkinsfileContent).toMatch(/failure\s*\{/);
      expect(jenkinsfileContent).toMatch(/docker rmi .*\|\| true/);
    });

    it('common.groovy を使用しない', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).not.toContain("common = load 'jenkins/shared/common.groovy'");
      expect(jenkinsfileContent).not.toMatch(/common\./);
    });
  });

  describe('IT-023〜IT-024: 整合性/一貫性チェック', () => {
    it('DSLのscriptPathがjob-config.yamlのjenkinsfileと一致する', () => {
      // Given: job-config.yaml と DSL内容
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_verify_job'];
      const match = /scriptPath\('([^']+)'\)/.exec(dslContent);

      // Then: scriptPathが一致する
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe(entry!.jenkinsfile);
    });

    it('genericFoldersがdevelopのみの独立した定義になっている', () => {
      // Given: all_phases と ECR DSL の genericFolders 定義

      // Then: all_phases は stable-1..9 を含み、ECR DSL は含まない
      expect(allPhasesDslContent).toMatch(/\(1\.\.9\)\.collect\s*\{\s*i\s*->/);
      expect(dslContent).not.toMatch(/\(1\.\.9\)\.collect\s*\{\s*i\s*->/);
      expect(dslContent).toMatch(/\[name: 'develop'/);
      expect(ecrBuildDslContent).toMatch(/\[name: 'develop'/);
    });
  });

  describe('IT-025〜IT-032: 追加の仕様検証', () => {
    it('jenkins/README.mdにecr_verifyのパラメータ数3が記載されている', () => {
      // Given: README内容
      expect(readmeContent).toMatch(/ecr_verify.*\|\s*3\s*\|/);
    });

    it('プロジェクトルートREADME.mdにecr-verify Jenkinsfileの記載がある', () => {
      // Given: ルートREADME内容
      expect(rootReadmeContent).toContain('ecr-verify/Jenkinsfile');
    });

    it('パラメータ数コメントが3個に設定されている', () => {
      // Given: DSL内容
      expect(dslContent).toContain('パラメータ数: 3個');
    });

    it('DSLのdescriptionにSTS自動取得とインスタンスプロファイルの注記がある', () => {
      // Given: DSL内容
      expect(dslContent).toMatch(/AWS_ACCOUNT_ID.*STS|STS.*自動取得/);
      expect(dslContent).toMatch(/インスタンスプロファイル/);
    });

    it('Jenkinsfileのコメントヘッダが3パラメータと自動取得注記に更新されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/\* - AWS_REGION/);
      expect(jenkinsfileContent).toMatch(/\* - ECR_REPOSITORY_NAME/);
      expect(jenkinsfileContent).toMatch(/\* - IMAGE_TAG/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_ACCOUNT_ID: AWSアカウントID/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_ACCESS_KEY_ID/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_SECRET_ACCESS_KEY/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_SESSION_TOKEN/);
      expect(jenkinsfileContent).toMatch(/STS|get-caller-identity/);
      expect(jenkinsfileContent).toMatch(/インスタンスプロファイル/);
    });

    it('ECR_REGISTRYとECR_IMAGE_NAMEがValidate Parametersステージ内で動的に構築されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/env\.ECR_REGISTRY\s*=.*dkr\.ecr/);
      expect(jenkinsfileContent).toMatch(/env\.ECR_IMAGE_NAME\s*=.*ECR_REGISTRY/);
      expect(jenkinsfileContent).not.toMatch(/ECR_REGISTRY\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).not.toMatch(/ECR_IMAGE_NAME\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).not.toMatch(/aws ecr get-login-password/);
      expect(jenkinsfileContent).not.toMatch(/--password-stdin/);
      expect(jenkinsfileContent).not.toMatch(/docker login/);
      expect(jenkinsfileContent).toMatch(/docker rmi \$\{env\.ECR_IMAGE_NAME\}/);
    });

    it('Verify Containerステージで docker run --rm と returnStatus 判定が使用されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('docker run --rm');
      expect(jenkinsfileContent).toMatch(/returnStatus:\s*true/);
    });

    it('Report Resultsステージに検証結果サマリ出力が実装されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('VERIFY_TOTAL');
      expect(jenkinsfileContent).toContain('VERIFY_PASSED');
      expect(jenkinsfileContent).toContain('VERIFY_FAILED_COUNT');
    });

    it('ecr-buildとのStage 1-2が同一パターンである', () => {
      // Given: ecr-verify / ecr-build のJenkinsfile
      expect(jenkinsfileContent).toContain('aws sts get-caller-identity --query Account --output text');
      expect(ecrBuildJenkinsfileContent).toContain('aws sts get-caller-identity --query Account --output text');
      expect(jenkinsfileContent).toContain("stage('Verify ECR Credential Helper')");
      expect(ecrBuildJenkinsfileContent).toContain("stage('Verify ECR Credential Helper')");
      expect(jenkinsfileContent).toContain('docker-credential-ecr-login version');
      expect(ecrBuildJenkinsfileContent).toContain('docker-credential-ecr-login version');
      expect(jenkinsfileContent).toContain("label 'ec2-fleet-micro'");
      expect(ecrBuildJenkinsfileContent).toContain("label 'ec2-fleet-medium'");
      expect(jenkinsfileContent).toContain('timestamps()');
      expect(ecrBuildJenkinsfileContent).toContain('timestamps()');
      expect(jenkinsfileContent).toContain("ansiColor('xterm')");
      expect(ecrBuildJenkinsfileContent).toContain("ansiColor('xterm')");
      expect(jenkinsfileContent).toContain('disableConcurrentBuilds()');
      expect(ecrBuildJenkinsfileContent).toContain('disableConcurrentBuilds()');
    });
  });

  describe('IT-026: リグレッション検証（任意）', () => {
    const shouldSkipValidate = process.env.SKIP_VALIDATE_TEST === '1';

    if (shouldSkipValidate) {
      it.skip('npm run validate を実行し正常終了する（再帰実行回避のためスキップ）', () => {
        // Given/When/Then: SKIP_VALIDATE_TEST が設定されているためスキップ
      });
    } else {
      it('npm run validate を実行し正常終了する', async () => {
        // Given/When: npm run validate を実行する（再帰回避のため SKIP_VALIDATE_TEST を注入）
        const { stdout, stderr } = await execFileAsync('npm', ['run', 'validate'], {
          cwd: projectRoot,
          env: { ...process.env, SKIP_VALIDATE_TEST: '1' },
          timeout: longTimeoutMs,
          maxBuffer: 50 * 1024 * 1024,
        });

        // Then: 正常終了しログが取得できる
        expect(`${stdout ?? ''}${stderr ?? ''}`).toBeDefined();
      });
    }
  });
});

function extractStageNames(content: string): string[] {
  return Array.from(content.matchAll(/stage\('([^']+)'\)/g)).map((m) => m[1]);
}

function parseParameterDefinitions(dsl: string): ParameterDefinition[] {
  const block = extractBlock(dsl, 'parameters');
  const definitions: (ParameterDefinition & { position: number })[] = [];

  const stringRegex = /stringParam\(\s*'([^']+)'\s*,\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = stringRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'string',
      defaultValue: match[2],
    });
  }

  const nonStoredRegex = /nonStoredPasswordParam\(\s*'([^']+)'/g;
  while ((match = nonStoredRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'nonStoredPassword',
    });
  }

  definitions.sort((a, b) => a.position - b.position);
  return definitions.map(({ position, ...rest }) => rest);
}

function extractBlock(source: string, blockName: string): string {
  const token = `${blockName} {`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`ブロック '${blockName}' がDSL内に見つかりません`);
  }

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`ブロック '${blockName}' の終了が見つかりません`);
}
