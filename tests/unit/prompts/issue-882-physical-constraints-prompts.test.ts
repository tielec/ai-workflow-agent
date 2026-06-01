import { beforeAll, describe, expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const SRC_PROMPTS_DIR = path.join(process.cwd(), 'src', 'prompts');
const DIST_PROMPTS_DIR = path.join(process.cwd(), 'dist', 'prompts');

function readPrompt(relativePath: string, fromDist = false): string {
  const baseDir = fromDist ? DIST_PROMPTS_DIR : SRC_PROMPTS_DIR;
  const promptPath = path.join(baseDir, relativePath);

  expect(fs.existsSync(promptPath)).toBe(true);
  return fs.readFileSync(promptPath, 'utf-8');
}

function expectAll(content: string, snippets: string[]): void {
  for (const snippet of snippets) {
    expect(content).toContain(snippet);
  }
}

describe('Issue #882 prompt updates', () => {
  const testingJaExecutePath = path.join('testing', 'ja', 'execute.txt');
  const testingJaReviewPath = path.join('testing', 'ja', 'review.txt');
  const testingJaRevisePath = path.join('testing', 'ja', 'revise.txt');
  const testingEnExecutePath = path.join('testing', 'en', 'execute.txt');
  const testingEnReviewPath = path.join('testing', 'en', 'review.txt');
  const testingEnRevisePath = path.join('testing', 'en', 'revise.txt');
  const reportJaExecutePath = path.join('report', 'ja', 'execute.txt');
  const reportEnExecutePath = path.join('report', 'en', 'execute.txt');

  let testingJaExecute: string;
  let testingJaReview: string;
  let testingJaRevise: string;
  let testingEnExecute: string;
  let testingEnReview: string;
  let testingEnRevise: string;
  let reportJaExecute: string;
  let reportEnExecute: string;

  beforeAll(() => {
    testingJaExecute = readPrompt(testingJaExecutePath);
    testingJaReview = readPrompt(testingJaReviewPath);
    testingJaRevise = readPrompt(testingJaRevisePath);
    testingEnExecute = readPrompt(testingEnExecutePath);
    testingEnReview = readPrompt(testingEnReviewPath);
    testingEnRevise = readPrompt(testingEnRevisePath);
    reportJaExecute = readPrompt(reportJaExecutePath);
    reportEnExecute = readPrompt(reportEnExecutePath);
  });

  test('testing/ja execute defines the untestable-item template and physical-constraint examples', () => {
    // Given: TC-882-012 requires the new section template to be fully present
    expectAll(testingJaExecute, [
      '## 検証不能項目（物理制約）',
      '検証不能の理由',
      '必要な環境',
      '代替検証手段',
      '代替検証の実施結果',
      '本番検証の推奨タイミング',
      '実機ハードウェア依存',
      'SaaS本番環境依存',
      '特定OS依存',
      'ライセンス制約のあるツール依存',
      'ネットワーク制約',
      '「環境がない」「動かない」だけの曖昧な理由',
    ]);
  });

  test('testing/ja execute keeps skip handling separate from untestable items', () => {
    // Then: TC-882-013 requires non-conflict with the existing skip decision flow
    expectAll(testingJaExecute, [
      '## ⚠️ このフェーズが不要と判断した場合の対応（Issue #411）',
      '## スキップ判定',
      '### スキップ判定との違い',
      '- **スキップ判定**: テスト自体が不要なケース',
      '- **検証不能項目**: テストは必要だが、実機・本番SaaS・特定OSなどの物理制約で一部だけ実行できないケース',
    ]);
  });

  test('testing/ja review defines the quality-gate extension and backward-compatible decision rules', () => {
    // When: TC-882-014 expects explicit PASS/FAIL rules and TC-882-015 expects compatibility
    expectAll(testingJaReview, [
      '### 検証不能項目（物理制約）の特別ルール',
      '検証可能だった範囲の主要テストケースが成功している',
      '必須3要素が欠ける、理由が曖昧、代替検証がない、または検証可能な範囲で主要テストが失敗している場合: `FAIL`',
      '検証不能項目が受け入れ基準の大半を占めていない（目安: 50%超ならFAIL寄り）',
      '品質ゲート（3項目）は必須要件です。1つでも満たされていない場合、判定は自動的にFAILになります。',
      'テストが実行されている',
      '主要なテストケースが成功している',
      '失敗したテストは分析されている',
      '80点で十分',
      'PASS / PASS_WITH_SUGGESTIONS / FAIL',
      '品質ゲートは絶対条件',
    ]);
  });

  test('testing/ja review expands PASS_WITH_SUGGESTIONS guidance for production follow-up', () => {
    // Then: TC-882-016 requires explicit guidance for production acceptance planning
    expectAll(testingJaReview, [
      '品質ゲートを満たし、未検証項目の本番確認が必要な場合: `PASS_WITH_SUGGESTIONS`',
      '未検証項目に対する本番受け入れ計画の明確化',
      '本番受け入れ計画または追加検証タイミング',
    ]);
  });

  test('testing/ja revise adds option 3 with explicit applicability and recording steps', () => {
    // Given: TC-882-017 requires the new choice and its procedure
    expectAll(testingJaRevise, [
      '#### 選択肢3: 物理制約による検証不能項目として記録',
      '実装修正では解決しない',
      '環境修正や依存追加でも解決しない',
      '実機、本番SaaS、特定OS、ライセンス制約などの物理的制約が原因である',
      '1. 検証可能な範囲のテストは必ず最後まで実行する',
      '2. `test-result.md` に `## 検証不能項目（物理制約）` セクションを追加する',
      '3. 各項目に以下の必須3要素を記録する',
      '5. 物理制約を理由に安易に Phase 4 へ戻さない',
    ]);
  });

  test('testing/ja revise preserves the existing choices and revise workflow guardrails', () => {
    // Then: TC-882-018 and TC-882-019 require backward compatibility for existing revise instructions
    expectAll(testingJaRevise, [
      '#### 選択肢1: Phase 4に戻って実装を修正',
      '#### 選択肢2: テスト環境を修正してテストを再実行',
      '## 修正手順（チェックリスト）',
      '- [ ] 3.5 物理制約で解決不能な場合は、検証不能項目として記録するか判断する',
      '## 修正後の確認事項',
      'Write ツールで `.ai-workflow/issue-{issue_number}/06_testing/output/test-result.md` を上書き保存',
      '絶対にKillShellを使用しないでください',
    ]);
  });

  test('testing/en execute mirrors the untestable-item template, examples, and skip distinction', () => {
    // Given: TC-882-020 requires the same structure in English
    expectAll(testingEnExecute, [
      '## ⚠️ Important: Handling untestable items caused by physical constraints',
      '## Untestable Items (Physical Constraints)',
      'Reason for Being Untestable',
      'Required Environment',
      'Alternative Verification Method',
      'Alternative Verification Results',
      'Recommended Production Verification Timing',
      'Real hardware dependency',
      'Production SaaS dependency',
      'Specific OS dependency',
      'Licensed tool dependency',
      'Network restriction',
      'Vague reasons such as "environment is missing" or "it does not work"',
      '- **Skip judgment**: testing itself is unnecessary',
      '- **Untestable items**: testing is necessary, but part of it cannot be executed because of physical constraints such as real hardware, production SaaS, or a specific OS',
    ]);
  });

  test('testing/en review mirrors the quality-gate extension and improvement guidance', () => {
    // When: TC-882-021 requires the English review prompt to preserve the same decision logic
    expectAll(testingEnReview, [
      '### Special rule for untestable items (physical constraints)',
      'The key test cases that were actually testable have passed',
      'more than 50% should lean to FAIL',
      'PASS_WITH_SUGGESTIONS',
      'production-side verification is still required',
      'All three quality gates are met',
      'Tests are being executed',
      'Key test cases are passing',
      'Failing tests are being analyzed',
    ]);
  });

  test('testing/en revise mirrors option 3 while preserving options 1 and 2', () => {
    // Then: TC-882-022 requires the English revise prompt to keep the original choices intact
    expectAll(testingEnRevise, [
      '#### Choice 1: Go back to Phase 4 and fix your implementation',
      '#### Choice 2: Modify the test environment and rerun the test',
      '#### Choice 3: Record as untestable due to physical constraints',
      'The issue cannot be solved by implementation changes',
      'The issue cannot be solved by environment fixes or dependency installation',
      'The cause is a physical constraint such as real hardware, production SaaS, a specific OS, or licensing restrictions',
      '2. Add a `## Untestable Items (Physical Constraints)` section to `test-result.md`',
      '## Correct steps (checklist)',
    ]);
  });

  test('report prompts aggregate untestable items only when test results include them', () => {
    // Given: report prompts must stay conditional so they do not emit empty sections
    expectAll(reportJaExecute, [
      '## 未検証項目（物理制約）',
      '`test-result.md` に `## 検証不能項目（物理制約）` セクションがある場合のみ、このセクションを出力してください。',
      '`test-result.md` に当該セクションがない場合は、この見出し自体を出力しないでください。',
      '代替検証の要約',
      '本番検証の推奨事項または推奨タイミング',
    ]);

    expectAll(reportEnExecute, [
      '## Untested Items (Physical Constraints)',
      'Output this section only when `test-result.md` contains a `## Untestable Items (Physical Constraints)` section.',
      'If `test-result.md` does not contain that section, do not output this heading.',
      'summary of alternative verification',
      'Recommended production verification actions or timing',
    ]);
  });

  test('template variables required by issue-882 prompts are preserved', () => {
    // Then: template placeholders must survive the prompt edits unchanged
    const templateExpectations: Array<[string, string[], string]> = [
      [
        testingJaExecutePath,
        ['{planning_document_path}', '{test_implementation_context}', '{implementation_context}', '{test_scenario_context}', '{issue_number}'],
        testingJaExecute,
      ],
      [
        testingJaReviewPath,
        ['{test_result_document_path}', '{implementation_document_path}', '{test_scenario_document_path}', '{planning_document_path}'],
        testingJaReview,
      ],
      [
        testingJaRevisePath,
        ['{review_feedback}', '{test_result_document_path}', '{implementation_document_path}', '{test_scenario_document_path}', '{issue_number}'],
        testingJaRevise,
      ],
      [
        testingEnExecutePath,
        ['{planning_document_path}', '{test_implementation_context}', '{implementation_context}', '{test_scenario_context}', '{issue_number}'],
        testingEnExecute,
      ],
      [
        testingEnReviewPath,
        ['{test_result_document_path}', '{implementation_document_path}', '{test_scenario_document_path}', '{planning_document_path}'],
        testingEnReview,
      ],
      [
        testingEnRevisePath,
        ['{review_feedback}', '{test_result_document_path}', '{implementation_document_path}', '{test_scenario_document_path}', '{issue_number}'],
        testingEnRevise,
      ],
      [
        reportJaExecutePath,
        ['{planning_document_path}', '{requirements_context}', '{design_context}', '{implementation_context}', '{testing_context}', '{documentation_context}', '{test_scenario_context}', '{test_implementation_context}', '{issue_number}', '{issue_title}'],
        reportJaExecute,
      ],
      [
        reportEnExecutePath,
        ['{planning_document_path}', '{requirements_context}', '{design_context}', '{implementation_context}', '{testing_context}', '{documentation_context}', '{test_scenario_context}', '{test_implementation_context}', '{issue_number}', '{issue_title}'],
        reportEnExecute,
      ],
    ];

    for (const [relativePath, variables, promptContent] of templateExpectations) {
      expect(promptContent.length).toBeGreaterThan(0);
      for (const variable of variables) {
        expect(promptContent).toContain(variable);
      }
      expect(relativePath).not.toHaveLength(0);
    }
  });

  test('dist prompts stay aligned with src prompts for issue-882 files', () => {
    // When: build artifacts are present, the copied prompt files must match source exactly
    const promptPairs = [
      testingJaExecutePath,
      testingJaReviewPath,
      testingJaRevisePath,
      testingEnExecutePath,
      testingEnReviewPath,
      testingEnRevisePath,
      reportJaExecutePath,
      reportEnExecutePath,
    ];

    for (const relativePath of promptPairs) {
      expect(readPrompt(relativePath, true)).toBe(readPrompt(relativePath, false));
    }
  });
});
