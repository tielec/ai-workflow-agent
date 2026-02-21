/**
 * Integration tests for Issue #725: ECR build Jenkins pipeline / Job DSL
 *
 * テスト戦略: UNIT_ONLY（Jenkinsfile / Job DSL / seed config の静的検証）
 * 対応テストシナリオ: UT-001〜UT-026（静的検証 + 任意のvalidate実行）
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

type GenericFolder = {
  name: string;
  displayName: string;
  branch: string;
};

describe('Integration: ECR build Jenkins pipeline (Issue #725)', () => {
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
  };

  let jobConfig: Record<string, unknown> = {};
  let folderConfig: Record<string, unknown> = {};
  let dslContent = '';
  let allPhasesDslContent = '';
  let jenkinsfileContent = '';

  jest.setTimeout(longTimeoutMs);

  beforeAll(async () => {
    const [jobConfigRaw, folderConfigRaw, dslRaw, allPhasesDslRaw, jenkinsfileRaw] =
      await Promise.all([
      fs.readFile(paths.jobConfig, 'utf8'),
      fs.readFile(paths.folderConfig, 'utf8'),
      fs.readFile(paths.dsl, 'utf8'),
      fs.readFile(paths.allPhasesDsl, 'utf8'),
      fs.readFile(paths.jenkinsfile, 'utf8'),
    ]);

    jobConfig = yaml.parse(jobConfigRaw) as Record<string, unknown>;
    folderConfig = yaml.parse(folderConfigRaw) as Record<string, unknown>;
    dslContent = dslRaw;
    allPhasesDslContent = allPhasesDslRaw;
    jenkinsfileContent = jenkinsfileRaw;
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
    it('genericFolders 定義がDevelop + Stable(1..9)の構成になっている', () => {
      // Given: DSL内容

      // Then: develop定義とstable-1..9のcollectが存在する
      expect(dslContent).toMatch(/\[name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '\*\/develop'\]/);
      expect(dslContent).toMatch(/\(1\.\.9\)\.collect\s*\{\s*i\s*->/);
      expect(dslContent).toMatch(/name: "stable-\$\{i\}"/);
      expect(dslContent).toMatch(/branch: '\*\/main'/);
    });

    it('パラメータ定義が7個で順序・型・デフォルト値が正しい', () => {
      // Given: parameters ブロック
      const definitions = parseParameterDefinitions(dslContent);
      const expectedOrder = [
        'AWS_ACCOUNT_ID',
        'AWS_REGION',
        'ECR_REPOSITORY_NAME',
        'IMAGE_RETENTION_COUNT',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
      ];

      // Then: パラメータ順序と件数
      expect(definitions.map((def) => def.name)).toEqual(expectedOrder);
      expect(definitions).toHaveLength(expectedOrder.length);

      const findDef = (name: string) => definitions.find((def) => def.name === name);

      expect(findDef('AWS_ACCOUNT_ID')?.kind).toBe('string');
      expect(findDef('AWS_REGION')?.defaultValue).toBe('ap-northeast-1');
      expect(findDef('ECR_REPOSITORY_NAME')?.defaultValue).toBe('ai-workflow-agent');
      expect(findDef('IMAGE_RETENTION_COUNT')?.defaultValue).toBe('2');
      expect(findDef('AWS_ACCESS_KEY_ID')?.defaultValue).toBe('');
      expect(findDef('AWS_SECRET_ACCESS_KEY')?.kind).toBe('nonStoredPassword');
      expect(findDef('AWS_SESSION_TOKEN')?.kind).toBe('nonStoredPassword');
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

    it('AWS_SECRET_ACCESS_KEY と AWS_SESSION_TOKEN が nonStoredPasswordParam で定義される', () => {
      // Given: DSL内容

      // Then: センシティブ値は非保存パスワード形式
      expect(dslContent).toContain("nonStoredPasswordParam('AWS_SECRET_ACCESS_KEY'");
      expect(dslContent).toContain("nonStoredPasswordParam('AWS_SESSION_TOKEN'");
      expect(dslContent).not.toMatch(/stringParam\('AWS_SECRET_ACCESS_KEY'/);
      expect(dslContent).not.toMatch(/stringParam\('AWS_SESSION_TOKEN'/);
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

    it('environmentにAWS/ECRの主要な環境変数が定義される', () => {
      // Given: Jenkinsfile内容
      const expectedEnvKeys = [
        'AWS_DEFAULT_REGION',
        'AWS_REGION_VALUE',
        'AWS_ACCOUNT_ID_VALUE',
        'ECR_REPOSITORY_NAME_VALUE',
        'IMAGE_RETENTION_COUNT_VALUE',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'ECR_REGISTRY',
        'ECR_IMAGE_NAME',
      ];

      // Then: すべての環境変数が存在する
      for (const key of expectedEnvKeys) {
        expect(jenkinsfileContent).toMatch(new RegExp(`${key}\\s*=`));
      }
    });

    it('Validate ParametersステージでAWS_ACCOUNT_ID必須チェックがある', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain('AWS_ACCOUNT_ID は必須パラメータです');
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

  describe('UT-023〜UT-025: 整合性/一貫性チェック', () => {
    it('DSLのscriptPathがjob-config.yamlのjenkinsfileと一致する', () => {
      // Given: job-config.yaml と DSL内容
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_ecr_build_job'];
      const match = /scriptPath\('([^']+)'\)/.exec(dslContent);

      // Then: scriptPathが一致する
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe(entry!.jenkinsfile);
    });

    it('genericFoldersがall_phasesジョブと完全一致する', () => {
      // Given: all_phases と ECR DSL の genericFolders 定義
      const expectedFolders = extractGenericFolders(allPhasesDslContent);
      const actualFolders = extractGenericFolders(dslContent);

      // Then: 既存ジョブとフォルダ定義が完全一致する
      expect(actualFolders).toEqual(expectedFolders);
    });

    it('AWS認証パラメータの定義パターンが一貫している', () => {
      // Given: DSL内容
      expect(dslContent).toMatch(/stringParam\('AWS_ACCESS_KEY_ID',\s*''/);
      expect(dslContent).toMatch(/nonStoredPasswordParam\('AWS_SECRET_ACCESS_KEY'/);
      expect(dslContent).toMatch(/nonStoredPasswordParam\('AWS_SESSION_TOKEN'/);
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
          maxBuffer: 50 * 1024 * 1024, // 50MB: VM Modules 警告等で stderr が大きくなるため
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

function extractGenericFolders(dsl: string): GenericFolder[] {
  const developMatch =
    /name:\s*'develop'[\s\S]*?displayName:\s*'([^']+)'[\s\S]*?branch:\s*'([^']+)'/.exec(
      dsl
    );
  if (!developMatch) {
    throw new Error('genericFolders の develop 定義が見つかりません');
  }

  const rangeMatch = /\((\d+)\.\.(\d+)\)\.collect/.exec(dsl);
  if (!rangeMatch) {
    throw new Error('genericFolders の stable 範囲定義が見つかりません');
  }

  const stableMatch =
    /name:\s*"stable-\$\{i\}"[\s\S]*?displayName:\s*"([^"]*?)\$\{i\}([^"]*?)"[\s\S]*?branch:\s*'([^']+)'/.exec(
      dsl
    );
  if (!stableMatch) {
    throw new Error('genericFolders の stable 定義が見つかりません');
  }

  const rangeStart = Number(rangeMatch[1]);
  const rangeEnd = Number(rangeMatch[2]);
  const stablePrefix = stableMatch[1];
  const stableSuffix = stableMatch[2];
  const stableBranch = stableMatch[3];

  const folders: GenericFolder[] = [
    {
      name: 'develop',
      displayName: developMatch[1],
      branch: developMatch[2],
    },
  ];

  for (let index = rangeStart; index <= rangeEnd; index += 1) {
    folders.push({
      name: `stable-${index}`,
      displayName: `${stablePrefix}${index}${stableSuffix}`,
      branch: stableBranch,
    });
  }

  return folders;
}
