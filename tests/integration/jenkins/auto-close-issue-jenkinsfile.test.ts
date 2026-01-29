/**
 * Integration Tests for Issue #652: auto-close-issue Jenkinsパイプライン/Job DSL
 *
 * テスト戦略: INTEGRATION_ONLY（Jenkinsfile / Job DSL の静的検証）
 * 対応テストシナリオ: IT-001〜IT-018 を中心にカバー
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../..');
const JENKINSFILE_PATH = path.join(
  PROJECT_ROOT,
  'jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile'
);
const JOB_DSL_PATH = path.join(
  PROJECT_ROOT,
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_auto_close_issue_job.groovy'
);
const AUTO_ISSUE_JENKINSFILE_PATH = path.join(
  PROJECT_ROOT,
  'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile'
);

let jenkinsfileContent = '';
let jobDslContent = '';
let autoIssueJenkinsfileContent = '';

const extractStageNames = (content: string): string[] => {
  return Array.from(content.matchAll(/stage\('([^']+)'\)/g)).map((m) => m[1]);
};

beforeAll(async () => {
  [jenkinsfileContent, jobDslContent, autoIssueJenkinsfileContent] = await Promise.all([
    fs.readFile(JENKINSFILE_PATH, 'utf8'),
    fs.readFile(JOB_DSL_PATH, 'utf8'),
    fs.readFile(AUTO_ISSUE_JENKINSFILE_PATH, 'utf8'),
  ]);
});

describe('Integration: auto-close-issue Jenkinsfile / Job DSL (Issue #652)', () => {
  it('IT-001: Jenkinsfileが7ステージ構成で期待どおりのステージ名を持つ', () => {
    const stages = extractStageNames(jenkinsfileContent);
    expect(stages).toEqual([
      'Load Common Library',
      'Prepare Codex auth.json',
      'Prepare Agent Credentials',
      'Validate Parameters',
      'Setup Environment',
      'Setup Node.js Environment',
      'Execute Auto Close Issue',
    ]);
  });

  it('IT-018: auto-issueパイプラインと補助ステージ構成が一致している', () => {
    const stages = extractStageNames(jenkinsfileContent);
    const autoIssueStages = extractStageNames(autoIssueJenkinsfileContent);

    // メインステージを除外して比較
    const filteredStages = stages.filter((name) => name !== 'Execute Auto Close Issue');
    const filteredAutoIssueStages = autoIssueStages.filter(
      (name) => name !== 'Execute Auto Issue'
    );

    expect(filteredStages).toEqual(filteredAutoIssueStages);
  });

  it('IT-002/IT-003: Job DSLがscriptPathやdisableConcurrentBuildsを含み、フォルダ生成を定義している', () => {
    expect(jobDslContent).toContain(
      "scriptPath('jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile')"
    );
    expect(jobDslContent).toContain('disableConcurrentBuilds()');
    expect(jobDslContent).toMatch(/logRotator\s*\{\s*[^}]*numToKeep\(30\)[\s\S]*daysToKeep\(90\)/);
    expect(jobDslContent).toMatch(/"stable-1".*branch:\s*'\*\/main'/);
    expect(jobDslContent).toMatch(/"stable-9".*branch:\s*'\*\/main'/);
    expect(jobDslContent).toMatch(/"develop".*branch:\s*'\*\/develop'/);
  });

  it('IT-004: パラメータ定義が期待値・デフォルト値を持つ（20件以上定義されている）', () => {
    const paramMatches =
      jobDslContent.match(/(stringParam|choiceParam|booleanParam|nonStoredPasswordParam)\('/g) ??
      [];
    expect(paramMatches.length).toBeGreaterThanOrEqual(20);

    expect(jobDslContent).toContain("choiceParam('AUTO_CLOSE_CATEGORY'");
    expect(jobDslContent).toMatch(/choiceParam\('AUTO_CLOSE_CATEGORY'[\s\S]*followup[\s\S]*stale[\s\S]*old[\s\S]*all/);
    expect(jobDslContent).toMatch(/stringParam\('AUTO_CLOSE_LIMIT'\s*,\s*'10'/);
    expect(jobDslContent).toMatch(/stringParam\('CONFIDENCE_THRESHOLD'\s*,\s*'0\.7'/);
    expect(jobDslContent).toMatch(/stringParam\('DAYS_THRESHOLD'\s*,\s*'90'/);
    expect(jobDslContent).toMatch(/stringParam\('EXCLUDE_LABELS'\s*,\s*'do-not-close,pinned'/);
    expect(jobDslContent).toMatch(/booleanParam\('DRY_RUN'\s*,\s*true/);
    expect(jobDslContent).toMatch(/booleanParam\('REQUIRE_APPROVAL'\s*,\s*false/);
    expect(jobDslContent).toMatch(/choiceParam\('LANGUAGE'[\s\S]*'ja'[\s\S]*'en'/);
  });

  it('IT-005/IT-006/IT-007/IT-008: CLIオプション組み立てに空文字ガードとドライラン既定値がある', () => {
    expect(jenkinsfileContent).toContain('node dist/index.js auto-close-issue');
    expect(jenkinsfileContent).toMatch(
      /def\s+excludeLabelsFlag\s*=\s*params\.EXCLUDE_LABELS\?\.trim\(\)\s*\?\s*"--exclude-labels '\$\{params\.EXCLUDE_LABELS\}'"\s*:\s*''/
    );
    expect(jenkinsfileContent).toMatch(
      /def\s+requireApprovalFlag\s*=\s*params\.REQUIRE_APPROVAL\s*\?\s*'--require-approval'\s*:\s*''/
    );
    expect(jenkinsfileContent).toMatch(
      /def\s+dryRunFlag\s*=\s*dryRunDefault\s*\?\s*'--dry-run'\s*:\s*''/
    );
    expect(jenkinsfileContent).toMatch(/--category\s+\$\{category\}/);
    expect(jenkinsfileContent).toMatch(/--limit\s+\$\{limit\}/);
    expect(jenkinsfileContent).toMatch(/--confidence-threshold\s+\$\{confidenceThreshold\}/);
    expect(jenkinsfileContent).toMatch(/--days-threshold\s+\$\{daysThreshold\}/);
    expect(jenkinsfileContent).toMatch(/--agent\s+\$\{agentMode\}/);
    expect(jenkinsfileContent).toMatch(/\$\{languageOption\}/);
  });

  it('IT-009〜IT-012: パラメータ検証エラーメッセージが定義されている', () => {
    expect(jenkinsfileContent).toContain(
      "error(\"GITHUB_REPOSITORY parameter is required for auto_close_issue mode\")"
    );
    expect(jenkinsfileContent).toContain(
      "error(\"GITHUB_REPOSITORY must be in 'owner/repo' format: ${params.GITHUB_REPOSITORY}\")"
    );
    expect(jenkinsfileContent).toContain(
      "error(\"AUTO_CLOSE_LIMIT must be an integer between 1 and 50: ${limit}\")"
    );
    expect(jenkinsfileContent).toContain(
      "error(\"CONFIDENCE_THRESHOLD must be a decimal between 0.0 and 1.0: ${confidenceThreshold}\")"
    );
    expect(jenkinsfileContent).toContain(
      "error(\"DAYS_THRESHOLD must be a positive integer: ${daysThreshold}\")"
    );
  });

  it('IT-014/IT-015: Webhook通知がsuccess/failedステータスで送信される', () => {
    expect(jenkinsfileContent).toMatch(/status:\s*'success'/);
    expect(jenkinsfileContent).toMatch(/status:\s*'failed'/);
    expect(jenkinsfileContent).toMatch(/logsUrl:\s*"\$\{env\.BUILD_URL\}console"/);
  });

  it('IT-016: Post処理でアーティファクト保存とクリーンアップが行われる', () => {
    expect(jenkinsfileContent).toContain(
      "archiveArtifacts artifacts: 'auto-close-issue-results.json'"
    );
    expect(jenkinsfileContent).toMatch(/rm -rf \${env\.REPOS_ROOT}/);
    expect(jenkinsfileContent).toMatch(/rm -rf \${env\.CODEX_HOME}/);
    expect(jenkinsfileContent).toContain('cleanWs()');
  });

  it('IT-017: 共通ライブラリの関数を全ステージで再利用している', () => {
    expect(jenkinsfileContent).toContain("common = load 'jenkins/shared/common.groovy'");
    expect(jenkinsfileContent).toContain('common.prepareCodexAuthFile()');
    expect(jenkinsfileContent).toContain('common.prepareAgentCredentials()');
    expect(jenkinsfileContent).toContain('common.setupEnvironment()');
    expect(jenkinsfileContent).toContain('common.setupNodeEnvironment()');
  });

  it('IT-005/IT-008補足: DRY RUNラベルがビルドディスクリプションに付与される', () => {
    expect(jenkinsfileContent).toMatch(/\[DRY RUN\]/);
    expect(jenkinsfileContent).toMatch(
      /currentBuild\.description\s*=\s*"Auto Close Issue \|\s*\$\{params\.AUTO_CLOSE_CATEGORY.*\[DRY RUN\]/
    );
  });
});
