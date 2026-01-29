/**
 * Jenkins All Phases ジョブに追加された SKIP_PHASES 連携の存在と後方互換性を
 * 静的に検証するユニットテスト。Groovy を直接実行せず、ファイル内容を
 * テキストとして確認することで、誤削除や意図しない変更を早期検知する。
 */

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();
const dslPath = path.resolve(
  repoRoot,
  'jenkins/jobs/dsl/ai-workflow/ai_workflow_all_phases_job.groovy',
);
const jenkinsfilePath = path.resolve(
  repoRoot,
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
);

describe('Jenkins Job DSL: SKIP_PHASES パラメータ', () => {
  test('stringParam が DRY_RUN の直後かつ SKIP_REVIEW より前に定義されている', () => {
    // Jenkins パラメータの並び順が崩れると UI の分かりやすさが損なわれるため順序を固定で確認
    const content = fs.readFileSync(dslPath, 'utf8');

    const dryRunIndex = content.indexOf("booleanParam('DRY_RUN'");
    const skipPhasesIndex = content.indexOf("stringParam('SKIP_PHASES'");
    const skipReviewIndex = content.indexOf("booleanParam('SKIP_REVIEW'");

    expect(dryRunIndex).toBeGreaterThan(-1);
    expect(skipPhasesIndex).toBeGreaterThan(-1);
    expect(skipReviewIndex).toBeGreaterThan(-1);
    expect(dryRunIndex).toBeLessThan(skipPhasesIndex);
    expect(skipPhasesIndex).toBeLessThan(skipReviewIndex);
  });

  test('ヘルプテキストに全フェーズ名が列挙され trim() で整形されている', () => {
    // 有効フェーズの一覧が消えると利用者が入力値を判断できないため内容を検証
    const content = fs.readFileSync(dslPath, 'utf8');

    expect(content).toMatch(/stringParam\('SKIP_PHASES',\s*''/);
    expect(content).toContain(".stripIndent().trim()");

    const expectedPhases = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    expectedPhases.forEach((phase) => {
      expect(content).toContain(phase);
    });
  });
});

describe('Jenkinsfile (all-phases): skipPhasesOption の組み込み', () => {
  test('Validate Parameters ステージで SKIP_PHASES がログ出力される', () => {
    // パラメータが UI で何が渡ったかを把握するためのログが残っていることを確認
    const content = fs.readFileSync(jenkinsfilePath, 'utf8');

    expect(content).toContain("echo \"Skip Phases: ${params.SKIP_PHASES ?: '(none)'}\"");
  });

  test('skipPhasesOption が trim() と三項演算子で安全に生成される', () => {
    // 空白のみの入力で --skip-phases が渡らないことを保証するため、生成式を固定文字列で検証
    const content = fs.readFileSync(jenkinsfilePath, 'utf8');

    expect(content).toContain(
      "def skipPhasesOption = params.SKIP_PHASES?.trim() ? \"--skip-phases ${params.SKIP_PHASES.trim()}\" : ''",
    );
  });

  test('Execute All Phases ステージの sh コマンドに skipPhasesOption が渡される', () => {
    // Jenkinsfile で変数を定義してもコマンドに渡していなければ無効なので、埋め込みを確認
    const content = fs.readFileSync(jenkinsfilePath, 'utf8');

    expect(content).toMatch(/node dist\/index\.js execute[\s\S]*\n\s+\$\{skipPhasesOption}/);
  });
});

