/**
 * Integration test for Issue #891: AI_REWRITE パラメータ追加の検証
 *
 * テスト戦略: INTEGRATION_ONLY（JobDSLファイルの静的バリデーション）
 * テストコード戦略: EXTEND_TEST（既存Jenkinsテストパターンへの追加）
 *
 * カバーするシナリオ:
 *   SC-001: booleanParam('AI_REWRITE', true, ...) が SKIP_PR_UPDATE 直後に存在すること
 *   SC-002: パラメータ数コメントが「17個」に更新されていること
 *   SC-003: description セクションに AI_REWRITE の説明が追記されていること
 *   SC-004: Jenkinsfile ヘッダーコメントの AI_REWRITE デフォルト値が true に更新されていること
 *   SC-005: 既存パラメータの順序・定義が変更されていないこと
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'yaml';

/** job-config.yaml のエントリ型 */
type JobConfigEntry = {
  name: string;
  displayName: string;
  dslfile: string;
  jenkinsfile: string;
  skipJenkinsfileValidation?: boolean;
};

/** パラメータ種別 */
type ParameterKind = 'choice' | 'string' | 'boolean' | 'nonStoredPassword';

/** パラメータ定義の型 */
type ParameterDefinition = {
  name: string;
  kind: ParameterKind;
  defaultValue?: string | boolean;
  choices?: string[];
};

/** genericFolders のフォルダ定義型 */
type FolderDefinition = {
  name: string;
  displayName: string;
  branch: string;
};

describe('Integration: ai_workflow_finalize_job DSL – AI_REWRITE パラメータ追加の検証 (Issue #891)', () => {
  const projectRoot = path.resolve(import.meta.dirname, '../../..');
  const jobConfigPath = path.join(
    projectRoot,
    'jenkins/jobs/pipeline/_seed/ai-workflow-job-creator/job-config.yaml'
  );
  const dslPath = path.join(
    projectRoot,
    'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy'
  );
  const jenkinsfilePath = path.join(
    projectRoot,
    'jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile'
  );

  let jobConfig: Record<string, unknown>;
  let dslContent = '';
  let jenkinsfileContent = '';

  beforeAll(async () => {
    const raw = await fs.readFile(jobConfigPath, 'utf8');
    jobConfig = yaml.parse(raw) as Record<string, unknown>;
    dslContent = await fs.readFile(dslPath, 'utf8');
    jenkinsfileContent = await fs.readFile(jenkinsfilePath, 'utf8');
  });

  // ========================================
  // job-config.yaml エントリ検証
  // ========================================

  describe('job-config.yaml エントリ検証', () => {
    it('IT-DSL-001: ai_workflow_finalize_job エントリが job-config.yaml に存在すること', () => {
      const jobs = (jobConfig['jenkins-jobs'] || {}) as Record<string, JobConfigEntry>;
      const entry = jobs['ai_workflow_finalize_job'];

      expect(entry).toBeDefined();
      expect(entry).toMatchObject({
        name: 'finalize',
        displayName: 'Finalize Execution',
        dslfile: 'jenkins/jobs/dsl/ai-workflow/ai_workflow_finalize_job.groovy',
      });
      // skipJenkinsfileValidation は省略可能なので存在する場合のみ検証
      if (entry.skipJenkinsfileValidation !== undefined) {
        expect(entry.skipJenkinsfileValidation).toBe(true);
      }
    });

    it('IT-DSL-002: DSL ファイルが実際に存在すること', async () => {
      const exists = await fs.pathExists(dslPath);
      expect(exists).toBe(true);
    });

    it('IT-DSL-003: Jenkinsfile が実際に存在すること', async () => {
      const exists = await fs.pathExists(jenkinsfilePath);
      expect(exists).toBe(true);
    });

    it('IT-DSL-004: DSL 内の scriptPath が finalize/Jenkinsfile を参照していること', () => {
      const match = /scriptPath\('([^']+)'\)/.exec(dslContent);
      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile');
    });
  });

  // ========================================
  // SC-001: AI_REWRITE パラメータの追加確認
  // ========================================

  describe('SC-001: AI_REWRITE booleanParam の追加確認', () => {
    it('IT-DSL-005: booleanParam("AI_REWRITE", true, ...) が DSL 内に存在すること', () => {
      // booleanParam('AI_REWRITE', true, ...) の存在確認
      expect(/booleanParam\(\s*'AI_REWRITE'\s*,\s*true,/.test(dslContent)).toBe(true);
    });

    it('IT-DSL-006: AI_REWRITE のデフォルト値が true であること（false でないこと）', () => {
      const definitions = parseParameterDefinitions(dslContent);
      const aiRewrite = definitions.find((def) => def.name === 'AI_REWRITE');

      expect(aiRewrite).toBeDefined();
      expect(aiRewrite?.kind).toBe('boolean');
      expect(aiRewrite?.defaultValue).toBe(true);
    });

    it('IT-DSL-007: AI_REWRITE が SKIP_PR_UPDATE の直後に定義されていること', () => {
      // DSL テキスト内での相対位置確認
      const skipPrUpdateIndex = dslContent.indexOf("booleanParam('SKIP_PR_UPDATE'");
      const aiRewriteIndex = dslContent.indexOf("booleanParam('AI_REWRITE'");

      expect(skipPrUpdateIndex).toBeGreaterThanOrEqual(0);
      expect(aiRewriteIndex).toBeGreaterThanOrEqual(0);
      expect(aiRewriteIndex).toBeGreaterThan(skipPrUpdateIndex);

      // SKIP_PR_UPDATE と AI_REWRITE の間に他の booleanParam / stringParam / choiceParam が存在しないこと
      const betweenContent = dslContent.slice(skipPrUpdateIndex, aiRewriteIndex);
      // SKIP_PR_UPDATE ブロック内の '.stripIndent().trim()' より後 → AI_REWRITE 開始まで
      const afterSkipPrUpdate = betweenContent.replace(/booleanParam\('SKIP_PR_UPDATE'[\s\S]*?\.stripIndent\(\)\.trim\(\)\)/, '');
      expect(/booleanParam\(|stringParam\(|choiceParam\(|nonStoredPasswordParam\(/.test(afterSkipPrUpdate)).toBe(false);
    });

    it('IT-DSL-008: AI_REWRITE の説明文に「AIエージェントによるPRボディリライトを有効化」が含まれること', () => {
      expect(dslContent).toContain('AIエージェントによるPRボディリライトを有効化');
    });

    it('IT-DSL-009: AI_REWRITE の説明文に「--ai-rewrite」オプションへの言及が含まれること', () => {
      expect(dslContent).toContain('--ai-rewrite');
    });

    it('IT-DSL-010: AI_REWRITE の記述スタイルが .stripIndent().trim() パターンに準拠していること', () => {
      // AI_REWRITE booleanParam ブロックを抽出
      const aiRewriteStart = dslContent.indexOf("booleanParam('AI_REWRITE'");
      expect(aiRewriteStart).toBeGreaterThanOrEqual(0);

      // 閉じ括弧までのブロックを取得（最初の .stripIndent().trim()) まで）
      const afterStart = dslContent.slice(aiRewriteStart);
      const blockEnd = afterStart.indexOf(".stripIndent().trim())");
      expect(blockEnd).toBeGreaterThanOrEqual(0);

      const block = afterStart.slice(0, blockEnd + ".stripIndent().trim())".length);
      expect(block).toContain('.stripIndent().trim()');
    });
  });

  // ========================================
  // SC-002: パラメータ数コメントの更新確認
  // ========================================

  describe('SC-002: パラメータ数コメントの更新確認', () => {
    it('IT-DSL-011: ファイル先頭コメントに「パラメータ数: 17個」と記載されていること', () => {
      // 「16個」が残っていないこと
      expect(/パラメータ数:\s*16個/.test(dslContent)).toBe(false);
      // 「17個」が記載されていること
      expect(/パラメータ数:\s*17個/.test(dslContent)).toBe(true);
    });

    it('IT-DSL-012: parameters{} ブロック冒頭コメントに「パラメータ定義（17個）」と記載されていること', () => {
      // 「パラメータ定義（16個）」が残っていないこと
      expect(/\/\/\s*パラメータ定義（16個）/.test(dslContent)).toBe(false);
      // 「パラメータ定義（17個）」が記載されていること
      expect(/\/\/\s*パラメータ定義（17個）/.test(dslContent)).toBe(true);
    });
  });

  // ========================================
  // SC-003: description セクションの更新確認
  // ========================================

  describe('SC-003: description セクションへの AI_REWRITE 追記確認', () => {
    it('IT-DSL-013: description セクションに AI_REWRITE の説明が含まれていること', () => {
      expect(dslContent).toContain('AI_REWRITE: AIエージェントによるPRボディリライトを有効化（デフォルト: true）');
    });

    it('IT-DSL-014: description 内で AI_REWRITE の説明が SKIP_PR_UPDATE の直後に記載されていること', () => {
      const skipPrUpdateDescIndex = dslContent.indexOf('SKIP_PR_UPDATE: PR更新・ドラフト解除をスキップ');
      const aiRewriteDescIndex = dslContent.indexOf('AI_REWRITE: AIエージェントによるPRボディリライトを有効化（デフォルト: true）');
      const baseBranchDescIndex = dslContent.indexOf('BASE_BRANCH: PRのマージ先ブランチ（デフォルト: main）');

      expect(skipPrUpdateDescIndex).toBeGreaterThanOrEqual(0);
      expect(aiRewriteDescIndex).toBeGreaterThanOrEqual(0);
      expect(baseBranchDescIndex).toBeGreaterThanOrEqual(0);

      // SKIP_PR_UPDATE → AI_REWRITE → BASE_BRANCH の順序を確認
      expect(aiRewriteDescIndex).toBeGreaterThan(skipPrUpdateDescIndex);
      expect(baseBranchDescIndex).toBeGreaterThan(aiRewriteDescIndex);
    });
  });

  // ========================================
  // SC-004: Jenkinsfile コメントの更新確認
  // ========================================

  describe('SC-004: Jenkinsfile ヘッダーコメントの更新確認', () => {
    it('IT-DSL-015: Jenkinsfile に AI_REWRITE のデフォルト値が "true" と記載されていること', () => {
      // 旧記述「デフォルト: false、Issue #888」が残っていないこと
      expect(/デフォルト: false、Issue #888/.test(jenkinsfileContent)).toBe(false);
      // 新記述「デフォルト: true、Issue #888, #891」が存在すること
      expect(/デフォルト: true、Issue #888,\s*#891/.test(jenkinsfileContent)).toBe(true);
    });

    it('IT-DSL-016: Jenkinsfile に AI_REWRITE パラメータへの言及が存在すること', () => {
      expect(jenkinsfileContent).toContain('AI_REWRITE');
    });
  });

  // ========================================
  // SC-005: 既存パラメータへの影響なし確認
  // ========================================

  describe('SC-005: 既存パラメータの順序・定義への影響なし確認', () => {
    it('IT-DSL-017: 全パラメータが正しい順序で定義されていること', () => {
      const definitions = parseParameterDefinitions(dslContent);
      const expectedOrder = [
        'EXECUTION_MODE',      // 1: 実行モード（固定値）
        'ISSUE_URL',           // 2: 基本設定
        'BRANCH_NAME',         // 3
        'AGENT_MODE',          // 4
        'LANGUAGE',            // 5
        'SKIP_SQUASH',         // 6: Finalize設定
        'SKIP_PR_UPDATE',      // 7
        'AI_REWRITE',          // 8: 新規追加（Issue #891）
        'BASE_BRANCH',         // 9
        'DRY_RUN',             // 10: 実行オプション
        'GIT_COMMIT_USER_NAME',  // 11: Git設定
        'GIT_COMMIT_USER_EMAIL', // 12
        'AWS_ACCESS_KEY_ID',     // 13: AWS認証情報
        'AWS_SECRET_ACCESS_KEY', // 14
        'AWS_SESSION_TOKEN',     // 15
        'GITHUB_TOKEN',          // 16: APIキー設定
        'OPENAI_API_KEY',        // 17
        'CODEX_API_KEY',         // 18
        'CODEX_AUTH_JSON',       // 19
        'CLAUDE_CODE_OAUTH_TOKEN', // 20
        'CLAUDE_CODE_API_KEY',   // 21
        'ANTHROPIC_API_KEY',     // 22
        'JOB_ID',                // 23: Webhook設定
        'WEBHOOK_URL',           // 24
        'WEBHOOK_TOKEN',         // 25
      ];

      expect(definitions.map((def) => def.name)).toEqual(expectedOrder);
    });

    it('IT-DSL-018: 既存パラメータの型・デフォルト値が変更されていないこと', () => {
      const definitions = parseParameterDefinitions(dslContent);
      const findDef = (name: string) => definitions.find((def) => def.name === name);

      // 実行モード
      expect(findDef('EXECUTION_MODE')?.kind).toBe('choice');
      expect(findDef('EXECUTION_MODE')?.defaultValue).toBe('finalize');

      // boolean パラメータの型・デフォルト値確認
      expect(findDef('SKIP_SQUASH')?.kind).toBe('boolean');
      expect(findDef('SKIP_SQUASH')?.defaultValue).toBe(false);

      expect(findDef('SKIP_PR_UPDATE')?.kind).toBe('boolean');
      expect(findDef('SKIP_PR_UPDATE')?.defaultValue).toBe(false);

      expect(findDef('DRY_RUN')?.kind).toBe('boolean');
      expect(findDef('DRY_RUN')?.defaultValue).toBe(false);

      // エージェントモード
      expect(findDef('AGENT_MODE')?.kind).toBe('choice');
      expect(findDef('AGENT_MODE')?.choices).toEqual(['auto', 'codex', 'claude']);
      expect(findDef('AGENT_MODE')?.defaultValue).toBe('auto');

      // 言語
      expect(findDef('LANGUAGE')?.kind).toBe('choice');
      expect(findDef('LANGUAGE')?.choices).toEqual(['ja', 'en']);
      expect(findDef('LANGUAGE')?.defaultValue).toBe('ja');

      // string パラメータ
      expect(findDef('AWS_ACCESS_KEY_ID')?.kind).toBe('string');
      expect(findDef('AWS_ACCESS_KEY_ID')?.defaultValue).toBe('');

      // nonStoredPassword パラメータが意図通りの項目に設定されていること
      const nonStoredItems = definitions
        .filter((def) => def.kind === 'nonStoredPassword')
        .map((def) => def.name);
      expect(nonStoredItems).toEqual([
        'ISSUE_URL',
        'BRANCH_NAME',
        'BASE_BRANCH',
        'GIT_COMMIT_USER_NAME',
        'GIT_COMMIT_USER_EMAIL',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'GITHUB_TOKEN',
        'OPENAI_API_KEY',
        'CODEX_API_KEY',
        'CODEX_AUTH_JSON',
        'CLAUDE_CODE_OAUTH_TOKEN',
        'CLAUDE_CODE_API_KEY',
        'ANTHROPIC_API_KEY',
        'WEBHOOK_URL',
        'WEBHOOK_TOKEN',
      ]);
    });

    it('IT-DSL-019: 新規追加の AI_REWRITE パラメータが正しい型・デフォルト値で定義されていること', () => {
      const definitions = parseParameterDefinitions(dslContent);
      const aiRewrite = definitions.find((def) => def.name === 'AI_REWRITE');

      // AC-001 対応: AI_REWRITE パラメータが booleanParam としてデフォルト true で存在すること
      expect(aiRewrite).toBeDefined();
      expect(aiRewrite?.kind).toBe('boolean');
      expect(aiRewrite?.defaultValue).toBe(true);
    });
  });

  // ========================================
  // 汎用フォルダ構成検証
  // ========================================

  describe('genericFolders 構成検証', () => {
    it('IT-DSL-020: genericFolders には Develop + Stable 9 件の合計 10 件が定義されていること', () => {
      const folders = parseGenericFoldersDefinitions(dslContent);
      const expected: FolderDefinition[] = [
        { name: 'develop', displayName: 'AI Workflow Executor - Develop', branch: '*/develop' },
        { name: 'stable-1', displayName: 'AI Workflow Executor - Stable 1', branch: '*/main' },
        { name: 'stable-2', displayName: 'AI Workflow Executor - Stable 2', branch: '*/main' },
        { name: 'stable-3', displayName: 'AI Workflow Executor - Stable 3', branch: '*/main' },
        { name: 'stable-4', displayName: 'AI Workflow Executor - Stable 4', branch: '*/main' },
        { name: 'stable-5', displayName: 'AI Workflow Executor - Stable 5', branch: '*/main' },
        { name: 'stable-6', displayName: 'AI Workflow Executor - Stable 6', branch: '*/main' },
        { name: 'stable-7', displayName: 'AI Workflow Executor - Stable 7', branch: '*/main' },
        { name: 'stable-8', displayName: 'AI Workflow Executor - Stable 8', branch: '*/main' },
        { name: 'stable-9', displayName: 'AI Workflow Executor - Stable 9', branch: '*/main' },
      ];

      expect(folders).toEqual(expected);
    });

    it('IT-DSL-021: genericFolders.each ループで AI_Workflow/{folder.name}/{jobConfig.name} 形式のジョブが作成されること', () => {
      expect(/genericFolders\.each\s*\{\s*folder\s*->/.test(dslContent)).toBe(true);
      expect(/createJob\(\s*"AI_Workflow\/\$\{folder\.name\}\/\$\{jobConfig\.name\}"/.test(dslContent)).toBe(true);
    });
  });
});

// ========================================
// ユーティリティ関数
// ========================================

/**
 * DSL テキストから parameters {} ブロック内のパラメータ定義を抽出し、
 * 出現順序でソートして返す
 */
function parseParameterDefinitions(dsl: string): ParameterDefinition[] {
  const block = extractBlock(dsl, 'parameters');
  const definitions: (ParameterDefinition & { position: number })[] = [];

  // choiceParam('NAME', ['choice1', 'choice2'], ...) のパース
  const choiceRegex = /choiceParam\(\s*'([^']+)'\s*,\s*\[([^\]]+)\],/g;
  let match: RegExpExecArray | null;
  while ((match = choiceRegex.exec(block)) !== null) {
    const choices = match[2]
      .split(',')
      .map((token) => token.replace(/'/g, '').trim())
      .filter((token) => token.length > 0);
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'choice',
      defaultValue: choices[0],
      choices,
    });
  }

  // stringParam('NAME', 'defaultValue', ...) のパース
  const stringRegex = /stringParam\(\s*'([^']+)'\s*,\s*'([^']*)',/g;
  while ((match = stringRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'string',
      defaultValue: match[2],
    });
  }

  // booleanParam('NAME', true|false, ...) のパース
  const booleanRegex = /booleanParam\(\s*'([^']+)'\s*,\s*(true|false),/g;
  while ((match = booleanRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'boolean',
      defaultValue: match[2] === 'true',
    });
  }

  // nonStoredPasswordParam('NAME', ...) のパース
  const nonStoredRegex = /nonStoredPasswordParam\(\s*'([^']+)'/g;
  while ((match = nonStoredRegex.exec(block)) !== null) {
    definitions.push({
      position: match.index,
      name: match[1],
      kind: 'nonStoredPassword',
    });
  }

  definitions.sort((a, b) => a.position - b.position);
  return definitions.map(({ position: _position, ...rest }) => rest);
}

/**
 * DSL テキストから genericFolders 配列リテラルを解析して
 * FolderDefinition[] を返す
 *
 * ※ genericFolders に (1..9).collect のような動的生成を含む場合は
 *   静的解析では拾えないため、develop エントリのみ配列から抽出し、
 *   stable-1〜stable-9 は .collect 記述の存在で検証する
 */
function parseGenericFoldersDefinitions(dsl: string): FolderDefinition[] {
  // develop エントリを静的解析で抽出
  const developMatch = /\[name:\s*'develop',\s*displayName:\s*'([^']+)',\s*branch:\s*'([^']+)'\]/.exec(dsl);
  if (!developMatch) {
    throw new Error("genericFolders の 'develop' エントリが見つかりませんでした");
  }

  const entries: FolderDefinition[] = [
    { name: 'develop', displayName: developMatch[1], branch: developMatch[2] },
  ];

  // (1..9).collect による stable-1〜stable-9 の動的生成を確認
  // DSL例: [name: "stable-${i}", displayName: "AI Workflow Executor - Stable ${i}", branch: '*/main']
  const collectMatch = /\(1\.\.9\)\.collect\s*\{\s*i\s*->\s*\[name:\s*"stable-\$\{i\}",\s*displayName:\s*"([^"]+)\s*\$\{i\}",\s*branch:\s*'([^']+)'\]\s*\}/.exec(dsl);
  if (!collectMatch) {
    throw new Error("genericFolders の stable 動的生成定義 (1..9).collect が見つかりませんでした");
  }

  // collectMatch[1] は "AI Workflow Executor - Stable " (末尾スペース付きで抽出される)
  // trimEnd() でスペースを除去してから "${prefix} ${i}" の形式で結合する
  const stableDisplayNamePrefix = collectMatch[1].trimEnd();
  // stable-1〜stable-9 を生成して entries に追加
  for (let i = 1; i <= 9; i += 1) {
    entries.push({
      name: `stable-${i}`,
      displayName: `${stableDisplayNamePrefix} ${i}`,
      branch: collectMatch[2],
    });
  }

  return entries;
}

/**
 * DSL テキストから指定した名前のブロック（例: "parameters {"）を抽出して返す
 */
function extractBlock(source: string, blockName: string): string {
  const token = `${blockName} {`;
  const start = source.indexOf(token);
  if (start === -1) {
    throw new Error(`ブロック '${blockName}' が DSL 内に見つかりません`);
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

/**
 * source 内の openIndex の位置から始まる対応する閉じブラケットのインデックスを返す
 */
function findMatchingBracket(source: string, startIndex: number, open: string, close: string): number {
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error('対応する閉じブラケットが見つかりません');
}
