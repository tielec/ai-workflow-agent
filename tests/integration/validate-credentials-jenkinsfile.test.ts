/**
 * 統合テスト: validate-credentials Jenkinsfile のステージ構成とアーティファクト設定
 *
 * Jenkins 環境での挙動を模した静的検証により、不要ステージの削除と成果物設定が維持されていることを確認する。
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const jenkinsfilePath = resolve(
  'jenkins/jobs/pipeline/ai-workflow/validate-credentials/Jenkinsfile',
);

const loadJenkinsfile = (): string => readFileSync(jenkinsfilePath, 'utf8');

const extractStageNames = (content: string): string[] =>
  Array.from(content.matchAll(/stage\('([^']+)'\)/g), (match) => match[1]);

describe('validate-credentials Jenkinsfile (統合)', () => {
  it('ステージ構成が想定どおりで Setup Environment が含まれないこと (IT-001/IT-002)', () => {
    // Given: Jenkinsfile の内容を読み込む
    const content = loadJenkinsfile();

    // When: stage 名を抽出する
    const stages = extractStageNames(content);

    // Then: 期待するステージのみが並び、削除対象ステージが存在しない
    expect(stages).toEqual([
      'Load Common Library',
      'Prepare Codex auth.json',
      'Validate Parameters',
      'Setup Node.js Environment',
      'Validate Credentials',
      'Archive Results',
    ]);
    expect(stages).not.toContain('Setup Environment');
  });

  it('成果物の生成とアーカイブ設定が保持されていること (IT-003)', () => {
    // Given
    const content = loadJenkinsfile();

    // Then: JSON/TXT 出力とアーカイブ指定が残っている
    expect(content).toContain('credentials-validation-result.json');
    expect(content).toContain('credentials-validation-result.txt');
    expect(content).toContain("archiveArtifacts artifacts: 'credentials-validation-result.*'");
  });

  it('exit-on-error の制御ロジックが定義されていること (IT-004/IT-005)', () => {
    // Given
    const content = loadJenkinsfile();

    // Then: EXIT_ON_ERROR の条件分岐とエラー出力が保持されている
    expect(content).toContain('params.EXIT_ON_ERROR');
    expect(content).toContain('statuses.any');
    expect(content).toContain('validate-credentials command failed (exit-on-error enabled)');
  });
});
