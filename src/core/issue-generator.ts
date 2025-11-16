import { GitHubClient } from './github-client.js';
import { config } from './config.js';
import { logger } from '../utils/logger.js';
import { getErrorMessage } from '../utils/error-utils.js';
import { SecretMasker } from './secret-masker.js';
import type { IssueCandidateResult } from '../types.js';
import OpenAI from 'openai';

/**
 * Issue生成エンジン
 */
export class IssueGenerator {
  private githubClient: GitHubClient;
  private openaiClient: OpenAI | null;
  private secretMasker: SecretMasker;

  constructor() {
    const githubToken = config.getGitHubToken();
    const repository = config.getGitHubRepository();

    if (!repository) {
      throw new Error('GITHUB_REPOSITORY environment variable is not set');
    }

    this.githubClient = new GitHubClient(githubToken, repository);

    const openaiApiKey = config.getOpenAiApiKey();
    this.openaiClient = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;

    this.secretMasker = new SecretMasker();
  }

  /**
   * Issue一括生成
   * @param candidates - Issue候補の配列
   */
  public async generateIssues(candidates: IssueCandidateResult[]): Promise<void> {
    logger.info(`Generating ${candidates.length} issues...`);

    for (const candidate of candidates) {
      try {
        await this.createIssue(candidate);
        logger.info(`Issue created: ${candidate.title}`);
      } catch (error) {
        logger.error(`Failed to create issue: ${candidate.title}. ${getErrorMessage(error)}`);
      }
    }
  }

  /**
   * Issue作成
   */
  private async createIssue(candidate: IssueCandidateResult): Promise<void> {
    // 1. LLMでIssue本文を生成
    const issueBody = await this.generateIssueContent(candidate);

    // 2. シークレットマスキング
    const maskedBody = this.maskSecrets(issueBody);

    // 3. GitHub API経由でIssue作成
    const labels = this.getLabels(candidate);
    const result = await this.githubClient.createIssue(candidate.title, maskedBody, labels);

    logger.debug(`Issue created: #${result.number} - ${result.url}`);
  }

  /**
   * LLMでIssue本文を生成
   */
  private async generateIssueContent(candidate: IssueCandidateResult): Promise<string> {
    if (!this.openaiClient) {
      logger.warn('OpenAI API key not configured. Using template-based Issue body.');
      return this.generateTemplateBody(candidate);
    }

    try {
      const prompt = `
以下の情報を基に、GitHubのIssue本文を生成してください。

カテゴリ: ${candidate.category}
タイトル: ${candidate.title}
説明: ${candidate.description}
該当箇所: ${candidate.file}:${candidate.lineNumber}
コードスニペット:
\`\`\`typescript
${candidate.codeSnippet}
\`\`\`
提案される解決策: ${candidate.suggestedFixes.join(', ')}
期待される効果: ${candidate.expectedBenefits.join(', ')}
優先度: ${candidate.priority}

出力形式:
Markdown形式で、以下のセクションを含めてください:
- ## 概要
- ## 詳細
- ## 該当箇所
- ## 提案される解決策
- ## 期待される効果
- ## 優先度
- ## カテゴリ
`;

      const response = await this.openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const content = response.choices[0]?.message?.content?.trim() ?? '';
      return content + '\n\n---\n\n🤖 この Issue は AI Workflow Agent により自動生成されました。';
    } catch (error) {
      logger.error(`LLM Issue generation failed: ${getErrorMessage(error)}`);
      return this.generateTemplateBody(candidate);
    }
  }

  /**
   * テンプレートベースのIssue本文生成（フォールバック）
   */
  private generateTemplateBody(candidate: IssueCandidateResult): string {
    return `
## 概要
${candidate.description}

## 詳細
${candidate.description}

## 該当箇所
- ファイル: ${candidate.file}:${candidate.lineNumber}
- 関連コード:
\`\`\`typescript
${candidate.codeSnippet}
\`\`\`

## 提案される解決策
${candidate.suggestedFixes.map((fix, i) => `${i + 1}. ${fix}`).join('\n')}

## 期待される効果
${candidate.expectedBenefits.map((benefit, i) => `${i + 1}. ${benefit}`).join('\n')}

## 優先度
${candidate.priority}

## カテゴリ
${candidate.category}

---

🤖 この Issue は AI Workflow Agent により自動生成されました。
`;
  }

  /**
   * ラベル生成
   */
  private getLabels(candidate: IssueCandidateResult): string[] {
    const labels: string[] = [];
    labels.push(`auto-issue:${candidate.category}`);
    labels.push(`priority:${candidate.priority.toLowerCase()}`);
    return labels;
  }

  /**
   * シークレットマスキング（簡易実装）
   */
  private maskSecrets(text: string): string {
    // SecretMaskerのmaskObject()を文字列に適用
    const masked = this.secretMasker.maskObject({ text }).text;
    return masked;
  }
}
