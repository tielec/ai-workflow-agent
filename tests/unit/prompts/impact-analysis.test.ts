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
});
