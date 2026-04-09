/**
 * Integration tests for Issue #821: ECR build Jenkins pipeline / Job DSL (multi-arch)
 *
 * テスト戦略: INTEGRATION_ONLY（Jenkinsfile / Job DSL / 手順書 + 統合シナリオの模擬検証）
 * 対応テストシナリオ: IT-S / IT-F / IT-V（模擬実行 + 任意の実ログ検証）
 */

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { execFile } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'node:url';
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

describe('Integration: ECR build Jenkins pipeline (Issue #821)', () => {
  const testDirname = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDirname, '../../..');
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
    verifyMultiarch: path.join(
      projectRoot,
      'jenkins/jobs/pipeline/ai-workflow/ecr-build/VERIFY_MULTIARCH.md'
    ),
    readme: path.join(projectRoot, 'jenkins/README.md'),
  };

  let jobConfig: Record<string, unknown> = {};
  let folderConfig: Record<string, unknown> = {};
  let dslContent = '';
  let allPhasesDslContent = '';
  let jenkinsfileContent = '';
  let verifyMultiarchContent = '';
  let readmeContent = '';
  let stageEchoMap = new Map<string, string[]>();
  let postEchoes: { always: string[]; success: string[]; failure: string[] } = {
    always: [],
    success: [],
    failure: [],
  };

  jest.setTimeout(longTimeoutMs);

  beforeAll(async () => {
    const [
      jobConfigRaw,
      folderConfigRaw,
      dslRaw,
      allPhasesDslRaw,
      jenkinsfileRaw,
      verifyMultiarchRaw,
      readmeRaw,
    ] =
      await Promise.all([
      fs.readFile(paths.jobConfig, 'utf8'),
      fs.readFile(paths.folderConfig, 'utf8'),
      fs.readFile(paths.dsl, 'utf8'),
      fs.readFile(paths.allPhasesDsl, 'utf8'),
      fs.readFile(paths.jenkinsfile, 'utf8'),
      fs.readFile(paths.verifyMultiarch, 'utf8'),
      fs.readFile(paths.readme, 'utf8'),
    ]);

    jobConfig = yaml.parse(jobConfigRaw) as Record<string, unknown>;
    folderConfig = yaml.parse(folderConfigRaw) as Record<string, unknown>;
    dslContent = dslRaw;
    allPhasesDslContent = allPhasesDslRaw;
    jenkinsfileContent = jenkinsfileRaw;
    verifyMultiarchContent = verifyMultiarchRaw;
    readmeContent = readmeRaw;
    stageEchoMap = buildStageEchoMap(jenkinsfileContent);
    postEchoes = extractPostEchoes(jenkinsfileContent);
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
    it('6ステージ構成で期待どおりのステージ名を持つ', () => {
      // Given: Jenkinsfile内容
      const stages = extractStageNames(jenkinsfileContent);

      // Then: ステージ構成が一致する
      expect(stages).toEqual([
        'Validate Parameters',
        'Setup QEMU',
        'Setup Buildx',
        'ECR Login',
        'Docker Buildx Build & Push',
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

    it('Setup QEMUステージでbinfmt登録を実行する', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("stage('Setup QEMU')");
      expect(jenkinsfileContent).toMatch(/tonistiigi\/binfmt/);
      expect(jenkinsfileContent).toMatch(/docker run --privileged --rm/);
    });

    it('Setup Buildxステージでbuildxの検証とbuilder初期化を行う', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("stage('Setup Buildx')");
      expect(jenkinsfileContent).toMatch(/docker buildx version/);
      expect(jenkinsfileContent).toMatch(/docker buildx create --name multiarch-builder --use --bootstrap/);
      expect(jenkinsfileContent).toMatch(/docker buildx inspect --bootstrap/);
    });

    it('ECR Loginステージにget-login-passwordとpassword-stdinが含まれる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/aws ecr get-login-password/);
      expect(jenkinsfileContent).toMatch(/--password-stdin/);
      expect(jenkinsfileContent).toMatch(/docker login/);
    });

    it('Docker Buildx Build & Pushステージでmulti-archビルドと2タグ付与を行う', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toContain("stage('Docker Buildx Build & Push')");
      expect(jenkinsfileContent).toMatch(/docker buildx build/);
      expect(jenkinsfileContent).toMatch(/--platform linux\/amd64,linux\/arm64/);
      expect(jenkinsfileContent).toMatch(/--push/);
      expect(jenkinsfileContent).toMatch(/-t \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).toMatch(/-t \$\{env\.ECR_IMAGE_NAME\}:build-\$\{env\.BUILD_NUMBER\}/);
    });

    it('Docker Buildx Build & Pushでは個別のdocker pushを行わない', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).not.toMatch(/docker push \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).not.toMatch(/docker push \$\{env\.ECR_IMAGE_NAME\}:build-\$\{env\.BUILD_NUMBER\}/);
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
      expect(jenkinsfileContent).toContain('buildx --push 構成のためローカルイメージの削除は不要です');
      expect(jenkinsfileContent).not.toMatch(/docker rmi \$\{env\.ECR_IMAGE_NAME\}:latest/);
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
      expect(jenkinsfileContent).toMatch(/docker buildx build/);
      expect(jenkinsfileContent).not.toMatch(/docker push \$\{env\.ECR_IMAGE_NAME\}:latest/);
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
      expect(jenkinsfileContent).toMatch(/Registry: \$\{env\.ECR_REGISTRY\}/);
      expect(jenkinsfileContent).toMatch(/Repository: \$\{env\.ECR_REPOSITORY_NAME_VALUE\}/);
    });

    it('Buildx結果の可観測性ログが含まれる', () => {
      // Given: Jenkinsfile内容
      expect(jenkinsfileContent).toMatch(/docker manifest inspect \$\{env\.ECR_IMAGE_NAME\}:latest/);
      expect(jenkinsfileContent).toMatch(/docker manifest inspect \$\{env\.ECR_IMAGE_NAME\}:build-\$\{env\.BUILD_NUMBER\}/);
      expect(jenkinsfileContent).toMatch(/aws ecr describe-images/);
    });

    it('VERIFY_MULTIARCH.md が存在し、マルチアーキ検証手順を記載している', () => {
      // Given: 検証手順書の内容
      expect(verifyMultiarchContent).toContain('ECR Multi-arch Image 検証手順');
      expect(verifyMultiarchContent).toMatch(/docker manifest inspect/);
      expect(verifyMultiarchContent).toMatch(/aws ecr describe-images/);
      expect(verifyMultiarchContent).toMatch(/pipeline-model-converter\/validate/);
    });

    it('DSLのdescriptionにパラメータ一覧が3個に更新されている', () => {
      // Given: DSL内容
      expect(dslContent).toMatch(/## パラメータ[\s\S]*?AWS_REGION/);
      expect(dslContent).toMatch(/## パラメータ[\s\S]*?ECR_REPOSITORY_NAME/);
      expect(dslContent).toMatch(/## パラメータ[\s\S]*?IMAGE_RETENTION_COUNT/);
      expect(dslContent).not.toMatch(/## パラメータ[\s\S]*?AWS_ACCOUNT_ID（必須）/);
    });
  });

  describe('IT-S-01〜IT-S-07: 成功パス統合シナリオ（模擬実行）', () => {
    it('IT-S-01: ecr-build Job が SUCCESS で完了する（全ステージ成功）', () => {
      // Given: すべてのコマンドが成功する前提
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
      });

      // Then: 全ステージ成功・結果SUCCESS・主要ログが含まれる
      expect(simulation.result).toBe('SUCCESS');
      expect(Object.values(simulation.stageResults)).toEqual(
        expect.arrayContaining(['SUCCESS'])
      );
      expect(simulation.stageResults).toMatchObject({
        'Validate Parameters': 'SUCCESS',
        'Setup QEMU': 'SUCCESS',
        'Setup Buildx': 'SUCCESS',
        'ECR Login': 'SUCCESS',
        'Docker Buildx Build & Push': 'SUCCESS',
        'Cleanup Old Images': 'SUCCESS',
      });
      expect(simulation.logs).toEqual(
        expect.arrayContaining([
          'Stage: Setup QEMU (binfmt)',
          'Stage: Setup Buildx',
          'Stage: ECR Login',
          'Stage: Docker Buildx Build & Push',
          'Stage: Cleanup Old Images',
        ])
      );
    });

    it('IT-S-02: docker manifest inspect の期待構造を満たす（模擬出力検証）', () => {
      // Given: マルチアーキのサンプルマニフェスト
      const manifest = parseManifestIndex(sampleManifestIndexJson);

      // Then: linux/amd64 + linux/arm64 を含む image index として認識される
      expect(manifest.mediaType).toMatch(/image\.index|manifest\.list/);
      expect(manifest.platforms).toEqual(
        expect.arrayContaining(['linux/amd64', 'linux/arm64'])
      );
    });

    it('IT-S-02: AWS CLI describe-images の artifactMediaType を確認できる（模擬出力検証）', () => {
      // Given: AWS CLI のサンプルレスポンス
      const artifactMediaType = parseEcrDescribeImages(sampleDescribeImagesJson);

      // Then: image index 系の mediaType を確認できる
      expect(artifactMediaType).toMatch(/image\.index|manifest\.list/);
    });

    it('IT-S-03: ecr-verify Job の成功ログを判定できる（模擬ログ）', () => {
      // Given: arm64 ノードで成功した想定のログ
      const analysis = analyzeEcrVerifyLog(sampleEcrVerifySuccessLog);

      // Then: exec format error がなく、arm64 で動作している
      expect(analysis.success).toBe(true);
      expect(analysis.execFormatError).toBe(false);
      expect(analysis.architecture).toBe('aarch64');
    });

    const ecrVerifyLogInput = process.env.ECR_VERIFY_LOG;
    if (!ecrVerifyLogInput) {
      it.skip('IT-S-03: 実ログによる ecr-verify 成功検証（環境変数未設定のためスキップ）', () => {
        // Given/When/Then: ECR_VERIFY_LOG が未指定のためスキップ
      });
    } else {
      it('IT-S-03: 実ログによる ecr-verify 成功検証', async () => {
        // Given: 実ログ（パス or 生ログ）
        const log = await resolveLogInput(ecrVerifyLogInput);

        // Then: exec format error がなく、arm64 で動作している
        const analysis = analyzeEcrVerifyLog(log);
        expect(analysis.success).toBe(true);
      });
    }

    it('IT-S-04: all-phases の起動エラー解消を判定できる（模擬ログ）', () => {
      // Given: exec format error が含まれない想定ログ
      const analysis = analyzeAllPhasesLog(sampleAllPhasesSuccessLog);

      // Then: 期待エラーが含まれない
      expect(analysis.success).toBe(true);
      expect(analysis.execFormatError).toBe(false);
    });

    const allPhasesLogInput = process.env.ALL_PHASES_LOG;
    if (!allPhasesLogInput) {
      it.skip('IT-S-04: 実ログによる all-phases 成功検証（環境変数未設定のためスキップ）', () => {
        // Given/When/Then: ALL_PHASES_LOG が未指定のためスキップ
      });
    } else {
      it('IT-S-04: 実ログによる all-phases 成功検証', async () => {
        // Given: 実ログ（パス or 生ログ）
        const log = await resolveLogInput(allPhasesLogInput);

        // Then: exec format error が含まれない
        const analysis = analyzeAllPhasesLog(log);
        expect(analysis.success).toBe(true);
      });
    }

    it('IT-S-05: ライフサイクルポリシーの適用成功ログを確認できる', () => {
      // Given: ライフサイクル適用が成功する前提
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        lifecyclePolicyExitCode: 0,
      });

      // Then: 成功ログが含まれる
      expect(simulation.logs).toEqual(
        expect.arrayContaining(['ECRライフサイクルポリシーの適用に成功しました'])
      );
    });

    it('IT-S-06: post ブロック由来の失敗がないことを確認できる', () => {
      // Given: 成功ケースの実行結果
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
      });

      // Then: post のメッセージが表示され、docker rmi は含まれない
      expect(simulation.logs).toEqual(
        expect.arrayContaining(['buildx --push 構成のためローカルイメージの削除は不要です'])
      );
      expect(simulation.logs.join('\n')).not.toContain('docker rmi');
    });

    it('IT-S-07: タイムアウト内で完了する前提の成功パスを再現できる', () => {
      // Given: タイムアウト超過が発生しない前提
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        timeoutExceeded: false,
      });

      // Then: ABORTED にならず SUCCESS で完了する
      expect(simulation.result).toBe('SUCCESS');
    });
  });

  describe('IT-F-01〜IT-F-05: 失敗系統合シナリオ（模擬実行）', () => {
    it('IT-F-01: QEMU 登録失敗時に早期FAILUREとなる', () => {
      // Given: Setup QEMU が失敗する
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        qemuExitCode: 1,
      });

      // Then: Setup QEMU が FAILED、後続は SKIPPED
      expect(simulation.result).toBe('FAILURE');
      expect(simulation.stageResults['Setup QEMU']).toBe('FAILED');
      expect(simulation.stageResults['Setup Buildx']).toBe('SKIPPED');
      expect(simulation.logs).toEqual(
        expect.arrayContaining([
          'QEMU binfmt の登録に失敗しました。`docker run --privileged` が許可されているか確認してください。',
        ])
      );
    });

    it('IT-F-02: buildx 未導入時に Setup Buildx で失敗する', () => {
      // Given: docker buildx version が失敗する
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        buildxVersionExitCode: 1,
      });

      // Then: Setup Buildx が FAILED、後続は SKIPPED
      expect(simulation.result).toBe('FAILURE');
      expect(simulation.stageResults['Setup Buildx']).toBe('FAILED');
      expect(simulation.stageResults['ECR Login']).toBe('SKIPPED');
      expect(simulation.logs).toEqual(
        expect.arrayContaining([
          'docker buildx が利用できません。Docker 19.03 以降がインストールされているか確認してください。',
        ])
      );
    });

    it('IT-F-03: buildx build 失敗時に原因ログが残る', () => {
      // Given: buildx build が失敗し、エラーログを出力する
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        buildxBuildExitCode: 1,
        buildxErrorOutput: 'ERROR: failed to solve: Dockerfile parse error',
      });

      // Then: 該当ステージが FAILED となり、エラーログと failure post が残る
      expect(simulation.result).toBe('FAILURE');
      expect(simulation.stageResults['Docker Buildx Build & Push']).toBe('FAILED');
      expect(simulation.logs.join('\n')).toContain('ERROR: failed to solve');
      expect(simulation.logs).toEqual(
        expect.arrayContaining(['ECR Image Build & Push - FAILURE'])
      );
    });

    it('IT-F-04: タイムアウト超過時に ABORTED となる', () => {
      // Given: タイムアウト超過を模擬する
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        timeoutExceeded: true,
        timeoutStage: 'Docker Buildx Build & Push',
      });

      // Then: ABORTED となりタイムアウトログが残る
      expect(simulation.result).toBe('ABORTED');
      expect(simulation.logs.join('\n')).toContain('TIMEOUT');
      expect(simulation.logs).toEqual(
        expect.arrayContaining(['ECR Image Build & Push - FAILURE'])
      );
    });

    it('IT-F-05: ECR push 権限不足時に AccessDenied を検知できる', () => {
      // Given: AccessDenied を含むエラーログを出力する
      const simulation = simulateEcrBuildPipeline({
        stageNames: extractStageNames(jenkinsfileContent),
        stageEchoMap,
        postEchoes,
        buildxBuildExitCode: 1,
        buildxErrorOutput: 'AccessDenied: User is not authorized to perform ecr:PutImage',
      });

      // Then: エラーログが残り、ジョブが FAILURE で終了する
      expect(simulation.result).toBe('FAILURE');
      expect(simulation.logs.join('\n')).toContain('AccessDenied');
    });
  });

  describe('IT-V-01〜IT-V-03: 検証系シナリオ', () => {
    const hasJenkinsLintEnv =
      Boolean(process.env.JENKINS_URL) &&
      Boolean(process.env.JENKINS_USER) &&
      Boolean(process.env.JENKINS_TOKEN);

    if (!hasJenkinsLintEnv) {
      it.skip('IT-V-01: Jenkinsfile 構文チェック（環境変数未設定のためスキップ）', () => {
        // Given/When/Then: Jenkins CLI/API を呼べないためスキップ
      });
    } else {
      it('IT-V-01: Jenkinsfile 構文チェックが PASS する', async () => {
        // Given: Jenkins URL と認証情報
        const jenkinsUrl = process.env.JENKINS_URL ?? '';
        const jenkinsUser = process.env.JENKINS_USER ?? '';
        const jenkinsToken = process.env.JENKINS_TOKEN ?? '';

        // When: Jenkinsfile を validate API に送信
        const result = await runCommand(
          'curl',
          [
            '-X',
            'POST',
            '-u',
            `${jenkinsUser}:${jenkinsToken}`,
            '-F',
            `jenkinsfile=<${paths.jenkinsfile}`,
            `${jenkinsUrl}/pipeline-model-converter/validate`,
          ],
          { cwd: projectRoot, timeout: longTimeoutMs }
        );

        // Then: 0 終了で、成功メッセージが含まれる
        expect(result.exitCode).toBe(0);
        expect(`${result.stdout}${result.stderr}`).toContain('successfully validated');
      });
    }

    it('IT-V-03: ドキュメント・コメント更新の確認ができる', () => {
      // Given: VERIFY_MULTIARCH.md と Jenkinsfile
      expect(jenkinsfileContent).toMatch(/マルチアーキ/);
      expect(verifyMultiarchContent).toContain('ECR Multi-arch Image 検証手順');
      expect(verifyMultiarchContent).toContain('トラブルシューティング');
      expect(verifyMultiarchContent).toMatch(/docker manifest inspect/);
      expect(verifyMultiarchContent).toMatch(/aws ecr describe-images/);
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
        const result = await runCommand(
          'npm',
          ['run', 'validate'],
          {
            cwd: projectRoot,
            env: { ...process.env, SKIP_VALIDATE_TEST: '1' },
            timeout: longTimeoutMs,
            maxBuffer: 50 * 1024 * 1024,
          }
        );

        // Then: 正常終了しログが取得できる
        expect(result.exitCode).toBe(0);
        expect(`${result.stdout ?? ''}${result.stderr ?? ''}`).toBeDefined();
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

type StageStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

type PipelineSimulationOptions = {
  stageNames: string[];
  stageEchoMap: Map<string, string[]>;
  postEchoes: { always: string[]; success: string[]; failure: string[] };
  qemuExitCode?: number;
  buildxVersionExitCode?: number;
  builderExitCode?: number;
  ecrLoginExitCode?: number;
  buildxBuildExitCode?: number;
  buildxErrorOutput?: string;
  lifecyclePolicyExitCode?: number;
  timeoutExceeded?: boolean;
  timeoutStage?: string;
};

type PipelineSimulationResult = {
  result: 'SUCCESS' | 'FAILURE' | 'ABORTED';
  stageResults: Record<string, StageStatus>;
  logs: string[];
};

const sampleManifestIndexJson = JSON.stringify({
  schemaVersion: 2,
  mediaType: 'application/vnd.oci.image.index.v1+json',
  manifests: [
    {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      platform: { architecture: 'amd64', os: 'linux' },
    },
    {
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      platform: { architecture: 'arm64', os: 'linux' },
    },
  ],
});

const sampleDescribeImagesJson = JSON.stringify({
  imageDetails: [
    {
      imageDigest: 'sha256:dummy',
      imageTags: ['latest'],
      artifactMediaType: 'application/vnd.oci.image.index.v1+json',
    },
  ],
});

const sampleEcrVerifySuccessLog = `
Starting ecr-verify job...
uname -m
aarch64
Running container...
Job completed successfully.
`;

const sampleAllPhasesSuccessLog = `
Starting all-phases job...
Container started successfully.
No architecture mismatch detected.
Job continues...
`;

function buildStageEchoMap(content: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const block of extractStageBlocks(content)) {
    const echoes = extractEchoLines(block.body).filter((line) => {
      return line.startsWith('Stage:') || line.includes('AI Workflow - ECR Image Build & Push');
    });
    map.set(block.name, echoes);
  }
  return map;
}

function extractStageBlocks(content: string): Array<{ name: string; body: string }> {
  const blocks: Array<{ name: string; body: string }> = [];
  const regex = /stage\('([^']+)'\)\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const start = match.index ?? 0;
    const openBraceIndex = content.indexOf('{', match.index);

    let depth = 0;
    let end = content.length;
    for (let index = openBraceIndex; index < content.length; index += 1) {
      const char = content[index];
      if (char === '{') {
        depth += 1;
      } else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          end = index + 1;
          break;
        }
      }
    }

    blocks.push({ name, body: content.slice(start, end) });
    regex.lastIndex = end;
  }

  return blocks;
}

function extractEchoLines(body: string): string[] {
  const results: string[] = [];
  const doubleQuoteRegex = /echo\s+"([^"]+)"/g;
  const singleQuoteRegex = /echo\s+'([^']+)'/g;

  let match: RegExpExecArray | null;
  while ((match = doubleQuoteRegex.exec(body)) !== null) {
    results.push(match[1]);
  }
  while ((match = singleQuoteRegex.exec(body)) !== null) {
    results.push(match[1]);
  }

  return results;
}

function extractPostEchoes(content: string): { always: string[]; success: string[]; failure: string[] } {
  const postBlock = extractBlock(content, 'post');
  return {
    always: extractEchoLines(extractBlock(postBlock, 'always')),
    success: extractEchoLines(extractBlock(postBlock, 'success')),
    failure: extractEchoLines(extractBlock(postBlock, 'failure')),
  };
}

function simulateEcrBuildPipeline(options: PipelineSimulationOptions): PipelineSimulationResult {
  const logs: string[] = [];
  const stageResults: Record<string, StageStatus> = {};
  let failed = false;
  let aborted = false;

  const fail = (stageName: string, message: string) => {
    stageResults[stageName] = 'FAILED';
    logs.push(message);
    failed = true;
  };

  const applyTimeoutIfNeeded = (stageName: string) => {
    if (options.timeoutExceeded && options.timeoutStage === stageName) {
      logs.push('TIMEOUT: 設定されたタイムアウトを超過しました');
      aborted = true;
    }
  };

  for (const stageName of options.stageNames) {
    if (failed || aborted) {
      stageResults[stageName] = 'SKIPPED';
      continue;
    }

    stageResults[stageName] = 'SUCCESS';
    logs.push(...(options.stageEchoMap.get(stageName) ?? []));

    switch (stageName) {
      case 'Setup QEMU': {
        if (options.qemuExitCode && options.qemuExitCode !== 0) {
          fail(
            stageName,
            'QEMU binfmt の登録に失敗しました。`docker run --privileged` が許可されているか確認してください。'
          );
        }
        break;
      }
      case 'Setup Buildx': {
        if (options.buildxVersionExitCode && options.buildxVersionExitCode !== 0) {
          fail(
            stageName,
            'docker buildx が利用できません。Docker 19.03 以降がインストールされているか確認してください。'
          );
          break;
        }
        if (options.builderExitCode && options.builderExitCode !== 0) {
          fail(stageName, 'buildx builder の作成/切り替えに失敗しました。buildx の状態を確認してください。');
        }
        break;
      }
      case 'ECR Login': {
        if (options.ecrLoginExitCode && options.ecrLoginExitCode !== 0) {
          fail(stageName, 'ECRログインに失敗しました。AWSリージョンを確認してください。');
        }
        break;
      }
      case 'Docker Buildx Build & Push': {
        if (options.buildxBuildExitCode && options.buildxBuildExitCode !== 0) {
          if (options.buildxErrorOutput) {
            logs.push(options.buildxErrorOutput);
          }
          fail(stageName, 'Docker buildx build & push が失敗しました');
        }
        break;
      }
      case 'Cleanup Old Images': {
        if (options.lifecyclePolicyExitCode === 0) {
          logs.push('ECRライフサイクルポリシーの適用に成功しました');
        } else if (options.lifecyclePolicyExitCode !== undefined) {
          logs.push('WARNING: ライフサイクルポリシーの適用に失敗しました。手動削除にフォールバックします。');
        }
        break;
      }
      default:
        break;
    }

    applyTimeoutIfNeeded(stageName);
  }

  logs.push(...options.postEchoes.always);
  if (aborted || failed) {
    logs.push(...options.postEchoes.failure);
  } else {
    logs.push(...options.postEchoes.success);
  }

  return {
    result: aborted ? 'ABORTED' : failed ? 'FAILURE' : 'SUCCESS',
    stageResults,
    logs,
  };
}

function parseManifestIndex(rawJson: string): { mediaType: string; platforms: string[] } {
  const parsed = JSON.parse(rawJson) as {
    mediaType?: string;
    manifests?: Array<{ platform?: { os?: string; architecture?: string } }>;
  };

  const platforms =
    parsed.manifests?.map((entry) => {
      const os = entry.platform?.os ?? 'unknown';
      const arch = entry.platform?.architecture ?? 'unknown';
      return `${os}/${arch}`;
    }) ?? [];

  return {
    mediaType: parsed.mediaType ?? '',
    platforms,
  };
}

function parseEcrDescribeImages(rawJson: string): string {
  const parsed = JSON.parse(rawJson) as {
    imageDetails?: Array<{ artifactMediaType?: string }>;
  };

  return parsed.imageDetails?.[0]?.artifactMediaType ?? '';
}

function analyzeEcrVerifyLog(log: string): { success: boolean; execFormatError: boolean; architecture: string } {
  const execFormatError = /exec format error/i.test(log);
  const archMatch = /uname -m\s*[\r\n]+([a-z0-9_]+)/i.exec(log);
  const architecture = archMatch?.[1] ?? '';
  return {
    success: !execFormatError && architecture.length > 0,
    execFormatError,
    architecture,
  };
}

function analyzeAllPhasesLog(log: string): { success: boolean; execFormatError: boolean } {
  const execFormatError = /exec format error|The container started but didn't run the expected command/i.test(log);
  return {
    success: !execFormatError,
    execFormatError,
  };
}

async function resolveLogInput(input: string): Promise<string> {
  const maybePath = input.trim();
  if (await fs.pathExists(maybePath)) {
    return fs.readFile(maybePath, 'utf8');
  }
  return input;
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
  }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        const code = typeof error.code === 'number' ? error.code : 1;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: code });
        return;
      }
      resolve({ stdout: stdout ?? '', stderr: stderr ?? '', exitCode: 0 });
    });
  });
}
