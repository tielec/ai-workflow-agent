/**
 * Integration Tests for Issue #828: Jenkinsfile agent block consistency
 *
 * テスト戦略: INTEGRATION_ONLY（Jenkinsfile の静的検証）
 * 対応テストシナリオ: IT-S-01〜IT-S-07
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

const TARGET_JENKINSFILES = [
  'jenkins/jobs/pipeline/ai-workflow/auto-close-issue/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/create-sub-issue/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-execute/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/pr-comment-finalize/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/resolve-conflict/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/rewrite-issue/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/split-issue/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/validate-credentials/Jenkinsfile',
] as const;

const OUT_OF_SCOPE_JENKINSFILES = [
  'jenkins/jobs/pipeline/ai-workflow/ecr-build/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/ecr-verify/Jenkinsfile',
] as const;

const EXPECTED_ECR_IMAGE =
  "image '621593801728.dkr.ecr.ap-northeast-1.amazonaws.com/ai-workflow-agent:latest'";
const EXPECTED_LABEL = "label 'ec2-fleet-micro'";
const EXPECTED_ARG_SUBSTRINGS = [
  '-e CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=1',
] as const;

const FORBIDDEN_PATTERNS = ['dockerfile {', "filename 'Dockerfile'"] as const;

const DOCKERFILE_BLOCK_PATTERN = /agent\s*\{[\s\S]*?dockerfile\s*\{/;

const extractAgentBlock = (content: string): string => {
  const agentMatch = content.match(/agent\s*\{/);
  if (!agentMatch || agentMatch.index === undefined) {
    return '';
  }

  const startIndex = agentMatch.index;
  const braceStart = content.indexOf('{', startIndex);
  if (braceStart === -1) {
    return '';
  }

  // 簡易の波括弧カウントで agent { ... } の範囲を抽出
  let depth = 0;
  for (let i = braceStart; i < content.length; i += 1) {
    const char = content[i];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(startIndex, i + 1);
      }
    }
  }

  return '';
};

const loadFile = (relativePath: string) =>
  fs.readFile(path.join(PROJECT_ROOT, relativePath), 'utf8');

const targetContents = new Map<string, string>();
const outOfScopeContents = new Map<string, string>();

beforeAll(async () => {
  const targetResults = await Promise.all(
    TARGET_JENKINSFILES.map(async (relativePath) => [relativePath, await loadFile(relativePath)])
  );
  targetResults.forEach(([relativePath, content]) => {
    targetContents.set(relativePath, content);
  });

  const outOfScopeResults = await Promise.all(
    OUT_OF_SCOPE_JENKINSFILES.map(async (relativePath) => [
      relativePath,
      await loadFile(relativePath),
    ])
  );
  outOfScopeResults.forEach(([relativePath, content]) => {
    outOfScopeContents.set(relativePath, content);
  });
});

describe('Issue #828: Jenkinsfile agent consistency', () => {
  it.each(TARGET_JENKINSFILES)(
    '%s: agent ブロックが空ではない（IT-S-01）',
    (relativePath) => {
      // Given: 対象 Jenkinsfile の内容を読み込む
      const content = targetContents.get(relativePath) ?? '';
      // When: agent { ... } ブロックを抽出する
      const agentBlock = extractAgentBlock(content);

      // Then: agent ブロックが空でないことを確認する
      expect(agentBlock).not.toEqual('');
    }
  );

  it.each(TARGET_JENKINSFILES)(
    '%s: ECR image が指定されている（IT-S-02）',
    (relativePath) => {
      // Given: 対象 Jenkinsfile の内容を読み込む
      const content = targetContents.get(relativePath) ?? '';
      // When: agent { ... } ブロックを抽出する
      const agentBlock = extractAgentBlock(content);

      // Then: ECR image 指定が含まれていることを確認する
      expect(agentBlock).toContain(EXPECTED_ECR_IMAGE);
    }
  );

  it.each(TARGET_JENKINSFILES)(
    '%s: ec2-fleet-micro ラベルを維持している（IT-S-03）',
    (relativePath) => {
      // Given: 対象 Jenkinsfile の内容を読み込む
      const content = targetContents.get(relativePath) ?? '';
      // When: agent { ... } ブロックを抽出する
      const agentBlock = extractAgentBlock(content);

      // Then: ラベル指定が期待値であることを確認する
      expect(agentBlock).toContain(EXPECTED_LABEL);
    }
  );

  it.each(TARGET_JENKINSFILES.flatMap((relativePath) =>
    EXPECTED_ARG_SUBSTRINGS.map((arg) => [relativePath, arg] as const)
  ))('%s: args に必須フラグ %s が含まれる（IT-S-04）', (relativePath, arg) => {
    // Given: 対象 Jenkinsfile の内容を読み込む
    const content = targetContents.get(relativePath) ?? '';
    // When: agent { ... } ブロックを抽出する
    const agentBlock = extractAgentBlock(content);

    // Then: 必須フラグが含まれていることを確認する
    expect(agentBlock).toContain(arg);
  });

  it.each(TARGET_JENKINSFILES.flatMap((relativePath) =>
    FORBIDDEN_PATTERNS.map((pattern) => [relativePath, pattern] as const)
  ))('%s: 禁止パターン %s が含まれない（IT-S-05）', (relativePath, pattern) => {
    // Given: 対象 Jenkinsfile の内容を読み込む
    const content = targetContents.get(relativePath) ?? '';
    // When: agent { ... } ブロックを抽出する
    const agentBlock = extractAgentBlock(content);

    // Then: 旧 dockerfile 方式の断片が残っていないことを確認する
    expect(agentBlock).not.toContain(pattern);
  });

  it('Global: 13ファイル全てが同一の ECR image を参照する（IT-S-06 A）', () => {
    // Given: 対象 13 ファイルの内容が読み込まれている
    const missing = TARGET_JENKINSFILES.filter((relativePath) => {
      // When: ファイル全体から ECR image 指定を検索する
      const content = targetContents.get(relativePath) ?? '';
      return !content.includes(EXPECTED_ECR_IMAGE);
    });

    // Then: ECR image が欠落したファイルが存在しないことを確認する
    expect(missing).toEqual([]);
  });

  it('Global: dockerfile { ... } ブロックが残存していない（IT-S-06 B）', () => {
    // Given: 対象 13 ファイルの内容が読み込まれている
    const offenders = TARGET_JENKINSFILES.filter((relativePath) => {
      // When: dockerfile ブロックの残存を正規表現で検出する
      const content = targetContents.get(relativePath) ?? '';
      return DOCKERFILE_BLOCK_PATTERN.test(content);
    });

    // Then: 旧 dockerfile ブロックが存在しないことを確認する
    expect(offenders).toEqual([]);
  });

  it.each(OUT_OF_SCOPE_JENKINSFILES)(
    '%s: スコープ外ファイルに ECR image が含まれない（IT-S-07）',
    (relativePath) => {
      // Given: スコープ外 Jenkinsfile の内容を読み込む
      const content = outOfScopeContents.get(relativePath) ?? '';
      // When: agent { ... } ブロックを抽出する
      const agentBlock = extractAgentBlock(content);

      // Then: ECR image 指定が含まれていないことを確認する
      expect(agentBlock).not.toContain(EXPECTED_ECR_IMAGE);
    }
  );
});
