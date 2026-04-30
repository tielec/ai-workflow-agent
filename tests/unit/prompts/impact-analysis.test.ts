/**
 * ユニットテスト: impact-analysis プロンプト
 *
 * テスト対象: src/prompts/impact-analysis/{ja,en}/investigator.txt
 * テストシナリオ: TC-PROMPT-JA01, TC-PROMPT-EN01, TC-PROMPT-SYNC01
 */

import fs from 'node:fs';
import path from 'node:path';

describe('impact-analysis prompts', () => {
  const jaPromptPath = path.resolve(process.cwd(), 'src/prompts/impact-analysis/ja/investigator.txt');
  const enPromptPath = path.resolve(process.cwd(), 'src/prompts/impact-analysis/en/investigator.txt');
  const jaScoperPromptPath = path.resolve(process.cwd(), 'src/prompts/impact-analysis/ja/scoper.txt');
  const enScoperPromptPath = path.resolve(process.cwd(), 'src/prompts/impact-analysis/en/scoper.txt');

  it('TC-PROMPT-JA01: 日本語プロンプトにマルウェア確認不要と調査専念の指示が含まれる', () => {
    const prompt = fs.readFileSync(jaPromptPath, 'utf-8');

    // Given: 日本語 Investigator プロンプト
    // When: 追加された注意事項を確認する
    // Then: 信頼済み OSS とマルウェア確認不要、調査専念の指示が含まれる
    expect(prompt).toContain('信頼済みのオープンソースリポジトリ');
    expect(prompt).toContain('マルウェア確認は不要');
    expect(prompt).toContain('コード挙動分析のみに集中');
  });

  it('TC-PROMPT-EN01: 英語プロンプトに対応する注意事項が含まれる', () => {
    const prompt = fs.readFileSync(enPromptPath, 'utf-8');

    // Given: 英語 Investigator プロンプト
    // When: 追加された注意事項を確認する
    // Then: trusted repository と malware verification 不要、分析への集中が含まれる
    expect(prompt).toContain('trusted open-source repository');
    expect(prompt).toContain('Malware verification is not required');
    expect(prompt).toContain('Focus solely on analyzing the code behavior of the target');
  });

  it('TC-PROMPT-SYNC01: 日本語版と英語版の注意事項セクションが同期している', () => {
    const jaPrompt = fs.readFileSync(jaPromptPath, 'utf-8');
    const enPrompt = fs.readFileSync(enPromptPath, 'utf-8');

    // Given: 日本語版と英語版の両 Investigator プロンプト
    // When: 追加箇所のセクション見出しを確認する
    // Then: 両方とも注意事項セクション配下に追加されている
    expect(jaPrompt).toContain('## 注意事項');
    expect(enPrompt).toContain('## Notes');
  });

  it('TC-PROMPT-SCOPER-JA01: 日本語 Scoper プロンプトに探索禁止と Write 優先が含まれる', () => {
    const prompt = fs.readFileSync(jaScoperPromptPath, 'utf-8');

    // Given: 日本語 Scoper プロンプト
    // When: 制約事項セクションを確認する
    // Then: コードベース探索禁止、Write 優先、Investigator との責務分離が含まれる
    expect(prompt).toContain('## 制約事項');
    expect(prompt).toContain('Grep / Read / Bash / Task などのツールでコードベースを探索してはいけません');
    expect(prompt).toContain('最初のアクションとして必ず Write ツール');
    expect(prompt).toContain('プレイブック内の「調査手順」は Investigator ステージ');
  });

  it('TC-PROMPT-SCOPER-EN01: 英語 Scoper プロンプトに対応する制約が含まれる', () => {
    const prompt = fs.readFileSync(enScoperPromptPath, 'utf-8');

    // Given: 英語 Scoper プロンプト
    // When: Constraints セクションを確認する
    // Then: 探索禁止、Write 優先、Investigator への責務分離が含まれる
    expect(prompt).toContain('## Constraints');
    expect(prompt).toContain('Do not explore the codebase with tools such as Grep, Read, Bash, or Task');
    expect(prompt).toContain('your first action must be to use the Write tool');
    expect(prompt).toContain('The playbook\'s "investigation steps" are for the downstream Investigator stage');
  });
});
