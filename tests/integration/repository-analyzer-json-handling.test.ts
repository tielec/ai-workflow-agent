/**
 * Integration tests for Issue #589: RepositoryAnalyzer + output-parser Japanese JSON handling
 *
 * Covers IT-001〜IT-004 from .ai-workflow/issue-589/03_test_scenario/output/test-scenario.md
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { RepositoryAnalyzer } from '../../src/core/repository-analyzer.js';
import { PromptLoader } from '../../src/core/prompt-loader.js';
import { logger } from '../../src/utils/logger';
import type { CodexAgentClient } from '../../src/core/codex-agent-client.js';
import type { ClaudeAgentClient } from '../../src/core/claude-agent-client.js';
import type {
  BugCandidate,
  EnhancementProposal,
  RefactorCandidate,
} from '../../src/core/analyzer/types.js';

type OutputPrefix = 'bugs' | 'refactor' | 'enhancements';

describe('Integration: RepositoryAnalyzer + output-parser JSON handling (Issue #589)', () => {
  let codexClient: jest.Mocked<CodexAgentClient>;
  let claudeClient: jest.Mocked<ClaudeAgentClient>;
  let analyzer: RepositoryAnalyzer;
  let tempDir: string;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  const outputPaths: Partial<Record<OutputPrefix, string>> = {};
  const stubPrompt = [
    '# Detect',
    'Output: {output_file_path}',
    '{custom_instruction}',
    '{repository_path}',
  ].join('\n');

  const setOutputPath = (prefix: OutputPrefix): string => {
    const generated = path.join(tempDir, `${prefix}-output.json`);
    outputPaths[prefix] = generated;
    return generated;
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-analyzer-json-'));
    codexClient = { executeTask: jest.fn() } as unknown as jest.Mocked<CodexAgentClient>;
    claudeClient = { executeTask: jest.fn() } as unknown as jest.Mocked<ClaudeAgentClient>;
    jest.spyOn(PromptLoader, 'loadPrompt').mockReturnValue(stubPrompt);
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    jest.spyOn(logger, 'debug').mockImplementation(() => {});

    analyzer = new RepositoryAnalyzer(codexClient, claudeClient, {
      outputFileFactory: (prefix: OutputPrefix) => setOutputPath(prefix),
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.remove(tempDir);
    (['bugs', 'refactor', 'enhancements'] as OutputPrefix[]).forEach((key) => {
      delete outputPaths[key];
    });
  });

  it('日本語custom-instructionを含むリファクタリング解析が正常に完了する (IT-001)', async () => {
    // IT-001: 日本語custom-instruction付きのリファクタリング正常系をエンドツーエンドで検証
    const customInstruction = '日本語のハードコードを別ファイルに切り出したい';
    const refactorCandidate: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/core/repository-analyzer.ts',
      description: 'このファイルは1000行を超えており、複数の責務が混在しています。',
      suggestion: 'I/O処理と検証処理を別モジュールに抽出してください。',
      priority: 'high',
      lineRange: { start: 1, end: 1200 },
    };

    codexClient.executeTask.mockImplementation(async () => {
      const refactorPath = outputPaths.refactor as string;
      await fs.outputFile(refactorPath, JSON.stringify([refactorCandidate], null, 2), 'utf-8');
      return [];
    });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'codex', {
      customInstruction,
    });

    const promptArg = codexClient.executeTask.mock.calls[0]?.[0]?.prompt ?? '';
    const refactorPath = outputPaths.refactor as string;
    expect(result).toEqual([refactorCandidate]);
    expect(promptArg).toContain('## 最優先: ユーザーからの特別指示');
    expect(promptArg).toContain(customInstruction);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(fs.existsSync(refactorPath)).toBe(false);
  });

  it('日本語JSONパース失敗時にバックアップが生成され内容が保持される (IT-002)', async () => {
    // IT-002: 無効な日本語JSONのパース失敗からバックアップ保存までのフォールバックを検証
    const invalidContent = `[
{"description": "大きなファイルです。
リファクタリングが必要です。"}
]`;

    codexClient.executeTask.mockImplementation(async () => {
      const refactorPath = outputPaths.refactor as string;
      await fs.outputFile(refactorPath, invalidContent, 'utf-8');
      return [];
    });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'codex');

    const refactorPath = outputPaths.refactor as string;
    const backupPath = refactorPath.replace(/\.json$/, '.invalid.json');
    expect(result).toEqual([]);
    expect(fs.existsSync(refactorPath)).toBe(false);
    expect(fs.existsSync(backupPath)).toBe(true);
    expect(await fs.readFile(backupPath, 'utf-8')).toContain('リファクタリングが必要です');
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('File content for debugging'),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(backupPath));
  });

  it('bug/refactor/enhancement全カテゴリで日本語出力が正常パースされる (IT-003)', async () => {
    // IT-003: 全カテゴリで日本語出力をパースしバックアップ未生成であることを検証
    const bugCandidate: BugCandidate = {
      title: '未処理の例外が発生するバグ',
      file: 'src/services/api-service.ts',
      line: 42,
      severity: 'high',
      description:
        'fetchDataメソッドがPromise拒否を正しく処理しておらず、ネットワーク障害時に例外が未処理のまま伝播してアプリがクラッシュするリスクがあります。',
      suggestedFix:
        'try-catchでラップし、構造化エラーを返すとともにUIへリトライ手順を提示する処理を追加してください。',
      category: 'bug',
    };
    const refactorCandidate: RefactorCandidate = {
      type: 'high-complexity',
      filePath: 'src/utils/helper.ts',
      description:
        'サイクロマティック複雑度が高すぎてテストが困難になっており、条件分岐が絡み合ってメンテナンス性が低下しています。',
      suggestion:
        'ヘルパーを複数関数に分割し、条件判定を小さい純粋関数に切り出すことで責務を分離してください。',
      priority: 'medium',
    };
    const enhancement: EnhancementProposal = {
      type: 'improvement',
      title: 'ログ出力の国際化とエンコーディング統一',
      description:
        '日本語を含むメッセージをUTF-8で統一し、エスケープの揺れをなくすことでCodexとClaude双方で同一の結果を得られるようにします。ローテーション時の文字化けも併せて検証します。さらに、クラウド上のログ集約基盤（CloudWatch/Stackdriver）での可視化を確認し、Unicode正規化の有無による差分も評価します。',
      rationale:
        '多言語リポジトリで文字化けを防ぐため。現状は一部ログがSJIS互換で記録されており、再解析時にエージェントが誤解釈する問題が発生しています。エージェントの学習用データにも影響するため、国際化対応は高優先度です。',
      implementation_hints: ['loggerのエンコーディング設定をUTF-8で固定', 'ローテーション後のファイルをUnicodeとして読み返す回帰テストを追加'],
      expected_impact: 'medium',
      effort_estimate: 'small',
      related_files: ['src/core/utils/logger.ts'],
    };

    codexClient.executeTask
      .mockImplementationOnce(async () => {
        const bugPath = outputPaths.bugs as string;
        await fs.outputFile(bugPath, JSON.stringify({ bugs: [bugCandidate] }, null, 2), 'utf-8');
        return [];
      })
      .mockImplementationOnce(async () => {
        const refactorPath = outputPaths.refactor as string;
        await fs.outputFile(refactorPath, JSON.stringify([refactorCandidate], null, 2), 'utf-8');
        return [];
      });
    claudeClient.executeTask.mockImplementationOnce(async () => {
      const enhancementPath = outputPaths.enhancements as string;
      await fs.outputFile(enhancementPath, JSON.stringify([enhancement], null, 2), 'utf-8');
      return [];
    });

    const bugResults = await analyzer.analyze('/repo/path', 'codex');
    const refactorResults = await analyzer.analyzeForRefactoring('/repo/path', 'codex');
    const enhancementResults = await analyzer.analyzeForEnhancements('/repo/path', 'claude');

    expect(bugResults[0].title).toContain('未処理の例外');
    expect(refactorResults[0].description).toContain('サイクロマティック');
    expect(enhancementResults[0].title).toContain('国際化');

    const backupPaths = (['bugs', 'refactor', 'enhancements'] as OutputPrefix[]).map(
      (key) => `${outputPaths[key]}`.replace(/\.json$/, '.invalid.json'),
    );
    backupPaths.forEach((backup) => {
      expect(fs.existsSync(backup)).toBe(false);
    });
  });

  it('codex失敗時にclaudeフォールバックで日本語結果を返す (IT-004)', async () => {
    // IT-004: codex -> claude フォールバックで日本語結果が返ることを検証
    const refactorCandidate: RefactorCandidate = {
      type: 'large-file',
      filePath: 'src/core/repository-analyzer.ts',
      description:
        '大きなファイルを分割しないと依存関係の把握が困難になり、分析と出力処理の変更が相互に影響します。',
      suggestion: '解析ロジックと出力処理を別モジュールに分割してください。',
      priority: 'high',
    };

    codexClient.executeTask.mockRejectedValueOnce(new Error('Codex unavailable'));
    claudeClient.executeTask.mockImplementationOnce(async () => {
      const refactorPath = outputPaths.refactor as string;
      await fs.outputFile(refactorPath, JSON.stringify([refactorCandidate], null, 2), 'utf-8');
      return [];
    });

    const result = await analyzer.analyzeForRefactoring('/repo/path', 'auto');

    expect(result).toEqual([refactorCandidate]);
    expect(codexClient.executeTask).toHaveBeenCalledTimes(1);
    expect(claudeClient.executeTask).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Codex failed'),
    );
  });
});
