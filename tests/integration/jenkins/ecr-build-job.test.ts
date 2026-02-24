/**
 * Integration tests for Issue #745: ECR build Jenkins pipeline / Job DSL
 *
 * テスト戦略: UNIT_ONLY（Jenkinsfile / Job DSL / seed config の静的検証）
 * 対応テストシナリオ: UT-001〜UT-037（静的検証 + 任意のvalidate実行）
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

describe('Integration: ECR build Jenkins pipeline (Issue #745)', () => {
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
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_ecr_build_job.groovy'
    ),
    allPhasesDsl: path.join(
      projectRoot,
      'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy'
    ),
    jenkinsfile: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile'
    ),
    readme: path.join(projectRoot, 'jenkins/README.md'),
  };

  let jobConfig: Record<string, unknown> = {};
  let folderConfig: Record<string, unknown> = {};
  let dslContent = '';
  let allPhasesDslContent = '';
  let jenkinsfileContent = '';
  let readmeContent = '';

  jest.setTimeout(longTimeoutMs);

  beforeAll(async () => {
    const [
      jobConfigRaw,
      folderConfigRaw,
      dslRaw,
      allPhasesDslRaw,
      jenkinsfileRaw,
      readmeRaw,
    ] =
      await Promise.all([
      fs.readFile(paths.jobConfig, 'utf8'),
      fs.readFile(paths.folderConfig, 'utf8'),
      fs.readFile(paths.dsl, 'utf8'),
      fs.readFile(paths.allPhasesDsl, 'utf8'),
      fs.readFile(paths.jenkinsfile, 'utf8'),
      fs.readFile(paths.readme, 'utf8'),
    ]);

    jobConfig = yaml.parse(jobConfigRaw) as Record<string, unknown>;
    folderConfig = yaml.parse(folderConfigRaw) as Record<string, unknown>;
    dslContent = dslRaw;
    allPhasesDslContent = allPhasesDslRaw;
    jenkinsfileContent = jenkinsfileRaw;
    readmeContent = readmeRaw;
  });

  describe('UT-001〜UT-003: job-config.yaml エントリ検証', () => {
    it('ai_workflow_ecr_build_job エントリが必須プロパティを持つ', () => {
      // Given: job-config.yaml を読み込む
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_build_job'];

      // Then: 必須プロパティと値が一致する
      expect(entry).toBeDefined();
      expect(entry).toMatchObject({
        name: 'ecr_build',
        displayName: 'ECR Image Build',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_ecr_build_job.groovy',
        jenkinsfile: 'jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile',
      });
      expect(entry!.skipJenkinsfileValidation).toBe(true);
    });

    it('job-config.yaml のJenkinsfileパスが実在する', async () => {
      // Given: job-config.yaml のエントリ
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_build_job'];
      const jenkinsfileAbsolute = path.join(projectRoot, entry!.jenkinsfile);

      // Then: Jenkinsfileが存在する
      const exists = await fs.pathExists(jenkinsfileAbsolute);
      expect(exists).toBe(true);
    });

    it('job-config.yaml のDSLパスが実在する', async () => {
      // Given: job-config.yaml のエントリ
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_build_job'];
      const dslfileAbsolute = path.join(projectRoot, entry!.dslfile);

      // Then: DSLファイルが存在する
      const exists = await fs.pathExists(dslfileAbsolute);
      expect(exists).toBe(true);
    });
  });

  describe('UT-004: folder-config.yaml 更新検証', () => {
    it('AI_Workflow フォルダ説明に ecr_build が追記されている', () => {
      // Given: folder-config.yaml を読み込む
      const folders = (folderConfig.folders || []) as Array<{ path: string; description: string }>;
      const aiWorkflowFolder = folders.find((folder) => folder.path === 'AI_Workflow');

      // Then: 説明文にecr_buildが含まれる
      expect(aiWorkflowFolder).toBeDefined();
      expect(aiWorkflowFolder?.description).toContain('ecr_build');
      expect(aiWorkflowFolder?.description).toMatch(/ecr_build.*ECR.*(ビルド|イメージ)/);
    });
  });

  describe('UT-005〜UT-010: Job DSL の構成検証', () => {
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
      const expectedOrder = [
        'AWS_REGION',
        'ECR_REPOSITORY_NAME',
        'IMAGE_RETENTION_COUNT',
      ];

      // Then: パラメータ順序と件数
      expect(definitions.map((def) => def.name)).toEqual(expectedOrder);
      expect(definitions).toHaveLength(expectedOrder.length);

      const findDef = (name: string) => definitions.find((def) => def.name === name);

      expect(findDef('AWS_REGION')?.defaultValue).toBe('ap-northeast-1');
      expect(findDef('ECR_REPOSITORY_NAME')?.defaultValue).toBe('ai-workflow-agent');
      expect(findDef('IMAGE_RETENTION_COUNT')?.defaultValue).toBe('2');

      expect(findDef('AWS_ACCOUNT_ID')).toBeUndefined();
      expect(findDef('AWS_ACCESS_KEY_ID')).toBeUndefined();
      expect(findDef('AWS_SECRET_ACCESS_KEY')).toBeUndefined();
      expect(findDef('AWS_SESSION_TOKEN')).toBeUndefined();
    });

    it('pipelineJob 設定に logRotator / disableConcurrentBuilds / disabled(false) が含まれる', () => {
      // Given: DSL内容
      const retentionPattern =
        /logRotator\s*\{\s*[\s\S]*numToKeep\(30\)[\s\S]*daysToKeep\(90\)/;

      // Then: 期待設定が存在する
      expect(dslContent).toMatch(retentionPattern);
      expect(dslContent).toContain('disableConcurrentBuilds()');
      expect(dslContent).toContain('disabled(false)');
    });

    it('cpsScm設定にscriptPath/URL/credentialsが定義されている', () => {
      // Given: DSL内容
      expect(dslContent).toContain(
        "scriptPath('jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile')"
      );
      expect(dslContent).toContain("url('https://github.com/tielec/ai-workflow-agent.git')");
      expect(dslContent).toContain("credentials('github-token')");
    });

    it('genericFolders.each によるジョブ生成パターンが定義されている', () => {
      // Given: DSL内容
      expect(/genericFolders\.each\s*\{\s*folder\s*->/.test(dslContent)).toBe(true);
      expect(/createJob\(\s*"AI_Workflow\/\$\{folder\.name\}\/\$\{jobConfig\.name\}"/.test(dslContent)).toBe(true);
      expect(/folder\.branch\s*\)/.test(dslContent)).toBe(true);
    });
  });

  describe('UT-011〜UT-022: Jenkinsfile 構成検証', () => {
    it('5ステージ構成で期待どおりのステージ名を持つ', () => {
      // Given: Jenkinsfile内容
      const stages = extractStageNames(jenkinsfileContent);

      // Then: ステージ構成が一致する
      expect(stages).toEqual([
        'Validate Parameters',
        'ECR Login',
        'Docker Build',
        'Docker Push',
        'Cleanup Old Images',
      ]);
    });

    it("agentが 'ec2-fleet-micro' ラベルで定義される", () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("label 'ec2-fleet-micro'");
    });

    it("triggersにcron 'H 2 * * *' が定義される", () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("cron('H 2 * * *')");
    });

    it('optionsにtimestamps/ansiColor/timeout/disableConcurrentBuildsが含まれる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('timestamps()');
      expect(jenkinsfileContent).toContain("ansiColor('xterm')");
      expect(jenkinsfileContent).toContain('disableConcurrentBuilds()');
      expect(jenkinsfileContent).toMatch(/timeout\(time:\s*30,\s*unit:\s*'MINUTES'\)/);
    });

    it('environmentにAWS/ECRの必要な環境変数のみが定義される', () => {
      // Given: Jenkinsfile内容
      const expectedEnvKeys = [
        'AWS_DEFAULT_REGION',
        'AWS_REGION_VALUE',
        'ECR_REPOSITORY_NAME_VALUE',
        'IMAGE_RETENTION_COUNT_VALUE',
      ];

      // Then: すべての環境変数が存在する
      for (const key of expectedEnvKeys) {
        expect(jenkinsfileContent).toMatch(new RegExp(`${key}\\s*=`));
      }

      expect(jenkinsfileContent).not.toMatch(/AWS_ACCOUNT_ID_VALUE\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).not.toMatch(/AWS_ACCESS_KEY_ID\s*=\s*"\$\{params\.AWS_ACCESS_KEY_ID/);
      expect(jenkinsfileContent).not.toMatch(/AWS_SECRET_ACCESS_KEY\s*=\s*"\$\{params\.AWS_SECRET_ACCESS_KEY/);
      expect(jenkinsfileContent).not.toMatch(/AWS_SESSION_TOKEN\s*=\s*"\$\{params\.AWS_SESSION_TOKEN/);
      expect(jenkinsfileContent).not.toMatch(/ECR_REGISTRY\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).not.toMatch(/ECR_IMAGE_NAME\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
    });

    it('Validate ParametersステージにSTS自動取得ロジックが実装されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('aws sts get-caller-identity --query Account --output text');
      expect(jenkinsfileContent).toMatch(/returnStdout:\s*true/);
      expect(jenkinsfileContent).toMatch(/env\.AWS_ACCOUNT_ID_VALUE\s*=/);
      expect(jenkinsfileContent).toMatch(/AWS STS.*失敗|インスタンスプロファイル.*IAM.*確認/);
      expect(jenkinsfileContent).not.toContain('AWS_ACCOUNT_ID は必須パラメータです');
    });

    it('ECR Loginステージにget-login-passwordとpassword-stdinが含まれる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/aws ecr get-login-password/);
      expect(jenkinsfileContent).toMatch(/--password-stdin/);
      expect(jenkinsfileContent).toMatch(/docker login/);
    });

    it('Docker Buildステージでlatestとbuild-Nタグを付与している', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/-t \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).toMatch(/-t \$\{env\.ECR_IMAGE_NAME\}:build-\$\{env\.BUILD_NUMBER\}/);
    });

    it('Docker Pushステージで2タグをプッシュしている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/docker push \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).toMatch(/docker push \$\{env\.ECR_IMAGE_NAME\}:build-\$\{env\.BUILD_NUMBER\}/);
    });

    it('Cleanup Old Imagesステージにライフサイクルポリシー適用とフォールバック削除がある', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/put-lifecycle-policy/);
      expect(jenkinsfileContent).toMatch(/batch-delete-image/);
    });

    it('postブロックでalways/success/failureが定義される', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/post\s*\{/);
      expect(jenkinsfileContent).toMatch(/always\s*\{/);
      expect(jenkinsfileContent).toMatch(/success\s*\{/);
      expect(jenkinsfileContent).toMatch(/failure\s*\{/);
      expect(jenkinsfileContent).toMatch(/docker rmi \$\{env\.ECR_IMAGE_NAME\}:latest/);
    });

    it('common.groovy を使用しない', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).not.toContain("common = load 'jenkins/shared/common.groovy'");
      expect(jenkinsfileContent).not.toMatch(/common\./);
    });
  });

  describe('UT-023〜UT-024: 整合性/一貫性チェック', () => {
    it('DSLのscriptPathがjob-config.yamlのjenkinsfileと一致する', () => {
      // Given: job-config.yaml と DSL内容
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_build_job'];
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
    });
  });

  describe('UT-027〜UT-037: 追加の仕様検証', () => {
    it('パラメータ数コメントが3個に更新されている', () => {
      // Given: DSL内容
      expect(dslContent).toContain('パラメータ数: 3個');
      expect(dslContent).not.toContain('パラメータ数: 7個');
    });

    it('DSLのdescriptionにSTS自動取得とインスタンスプロファイルの注記がある', () => {
      // Given: DSL内容
      expect(dslContent).toMatch(/AWS_ACCOUNT_ID.*STS|STS.*自動取得/);
      expect(dslContent).toMatch(/インスタンスプロファイル/);
      expect(dslContent).not.toContain('AWS_ACCOUNT_ID（必須）');
      expect(dslContent).not.toContain('AWS認証情報: 手動実行時にオプションで指定');
      expect(dslContent).not.toContain('手動実行時はAWS_ACCESS_KEY_ID等のパラメータ指定可能');
    });

    it('Jenkinsfileのコメントヘッダが3パラメータと自動取得注記に更新されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/\* - AWS_REGION/);
      expect(jenkinsfileContent).toMatch(/\* - ECR_REPOSITORY_NAME/);
      expect(jenkinsfileContent).toMatch(/\* - IMAGE_RETENTION_COUNT/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_ACCOUNT_ID: AWSアカウントID/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_ACCESS_KEY_ID/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_SECRET_ACCESS_KEY/);
      expect(jenkinsfileContent).not.toMatch(/\* - AWS_SESSION_TOKEN/);
      expect(jenkinsfileContent).toMatch(/AWS_ACCOUNT_ID.*STS|get-caller-identity/);
      expect(jenkinsfileContent).toMatch(/インスタンスプロファイル/);
    });

    it('ECR_REGISTRYとECR_IMAGE_NAMEがValidate Parametersステージ内で動的に構築されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/env\.ECR_REGISTRY\s*=.*dkr\.ecr/);
      expect(jenkinsfileContent).toMatch(/env\.ECR_IMAGE_NAME\s*=.*ECR_REGISTRY/);
      expect(jenkinsfileContent).not.toMatch(/ECR_REGISTRY\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).not.toMatch(/ECR_IMAGE_NAME\s*=\s*"\$\{params\.AWS_ACCOUNT_ID/);
      expect(jenkinsfileContent).toMatch(/--password-stdin\s+\$\{env\.ECR_REGISTRY\}/);
      expect(jenkinsfileContent).toMatch(/-t \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).toMatch(/docker push \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).toMatch(/docker rmi \$\{env\.ECR_IMAGE_NAME\}:latest/);
    });

    it("cronトリガー 'H 2 * * *' が維持されている", () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("cron('H 2 * * *')");
    });

    it('IMAGE_RETENTION_COUNTのバリデーションが維持されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('toInteger()');
      expect(jenkinsfileContent).toMatch(/count\s*<\s*1/);
      expect(jenkinsfileContent).toContain('NumberFormatException');
    });

    it('AWS認証パラメータがDSLファイルから完全に削除されている', () => {
      // Given: DSL内容
      expect(dslContent).not.toMatch(/stringParam\('AWS_ACCOUNT_ID'/);
      expect(dslContent).not.toMatch(/stringParam\('AWS_ACCESS_KEY_ID'/);
      expect(dslContent).not.toMatch(/nonStoredPasswordParam\('AWS_SECRET_ACCESS_KEY'/);
      expect(dslContent).not.toMatch(/nonStoredPasswordParam\('AWS_SESSION_TOKEN'/);
    });

    it('jenkins/README.mdのecr_buildパラメータ数が3に更新されている', () => {
      // Given: README内容
      expect(readmeContent).toMatch(/ecr_build.*\|\s*3\s*\|/);
      expect(readmeContent).not.toMatch(/ecr_build.*\|\s*7\s*\|/);
    });

    it('postセクションでenv.ECR_IMAGE_NAMEとenv.ECR_REGISTRYが正しく参照されている', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/docker rmi \$\{env\.ECR_IMAGE_NAME\}:latest \|\| true/);
      expect(jenkinsfileContent).toMatch(/docker rmi \$\{env\.ECR_IMAGE_NAME\}:build-\$\{env\.BUILD_NUMBER\} \|\| true/);
      expect(jenkinsfileContent).toMatch(/Registry: \$\{env\.ECR_REGISTRY\}/);
      expect(jenkinsfileContent).toMatch(/Repository: \$\{env\.ECR_REPOSITORY_NAME_VALUE\}/);
    });

    it('DSLのdescriptionにパラメータ一覧が3個に更新されている', () => {
      // Given: DSL内容
      expect(dslContent).toMatch(/## パラメータ[\s\S]*?AWS_REGION/);
      expect(dslContent).toMatch(/## パラメータ[\s\S]*?ECR_REPOSITORY_NAME/);
      expect(dslContent).toMatch(/## パラメータ[\s\S]*?IMAGE_RETENTION_COUNT/);
      expect(dslContent).not.toMatch(/## パラメータ[\s\S]*?AWS_ACCOUNT_ID（必須）/);
    });
  });

  describe('UT-026: リグレッション検証（任意）', () => {
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
