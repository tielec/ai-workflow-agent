/**
 * ユニットテスト: RepositoryAnalyzer - 除外パターンとヘルパー関数
 *
 * テスト対象: src/core/repository-analyzer.ts
 * テストシナリオ: test-scenario.md のセクション 2.2, 2.3, 2.4, 2.5
 *
 * Issue #144: 言語サポートの汎用化 - 除外パターンテスト
 */

import { RepositoryAnalyzer } from '../../../src/core/repository-analyzer.js';
import type { BugCandidate } from '../../../src/types/auto-issue.js';
import { jest } from '@jest/globals';

// モック設定
jest.mock('../../../src/utils/logger.js');

describe('RepositoryAnalyzer - Exclusion Patterns (Issue #144)', () => {
  let analyzer: RepositoryAnalyzer;

  beforeEach(() => {
    // RepositoryAnalyzerのインスタンス作成（エージェントはnullでOK - validateBugCandidateのみテスト）
    analyzer = new RepositoryAnalyzer(null, null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TC-EXCL-002: node_modules/内のファイルが除外される（正常系）
   *
   * 目的: node_modules/ ディレクトリ内のファイルが除外されることを検証
   */
  describe('TC-EXCL-002: node_modules/ exclusion', () => {
    it('should exclude files in node_modules/ directory', () => {
      // Given: node_modules/内のファイル
      const candidate: BugCandidate = {
        title: 'Type error in lodash library module',
        file: 'node_modules/lodash/index.js',
        line: 42,
        severity: 'high',
        description: 'lodashライブラリで型エラーが発生する可能性があります。これは重要な問題です。',
        suggestedFix: '型定義を修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore - privateメソッドへのアクセス（テスト目的）
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });

    it('should exclude files in nested node_modules/ directory', () => {
      // Given: ネストされたnode_modules/内のファイル
      const candidate: BugCandidate = {
        title: 'Error in nested dependency module',
        file: 'project/packages/foo/node_modules/bar/index.js',
        line: 10,
        severity: 'medium',
        description: 'ネストされた依存関係でエラーが発生しています。これは中程度の問題です。',
        suggestedFix: '依存関係を更新してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-003: dist/内のファイルが除外される（正常系）
   *
   * 目的: dist/ ディレクトリ内のファイルが除外されることを検証
   */
  describe('TC-EXCL-003: dist/ exclusion', () => {
    it('should exclude files in dist/ directory', () => {
      // Given: dist/内のファイル
      const candidate: BugCandidate = {
        title: 'Minified code issue in bundle file',
        file: 'dist/bundle.min.js',
        line: 1,
        severity: 'medium',
        description: 'minifiedコードでエラーが発生しています。これは中程度の問題です。',
        suggestedFix: 'ソースコードを修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-004: .git/内のファイルが除外される（正常系）
   *
   * 目的: .git/ ディレクトリ内のファイルが除外されることを検証
   */
  describe('TC-EXCL-004: .git/ exclusion', () => {
    it('should exclude files in .git/ directory', () => {
      // Given: .git/内のファイル
      const candidate: BugCandidate = {
        title: 'Git object corruption detected',
        file: '.git/objects/ab/cdef1234567890',
        line: 1,
        severity: 'low',
        description: 'Gitオブジェクトが破損しています。これは軽微な問題です。',
        suggestedFix: 'Gitリポジトリを修復してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-005: vendor/内のファイルが除外される（正常系）
   *
   * 目的: vendor/ ディレクトリ内のファイルが除外されることを検証
   */
  describe('TC-EXCL-005: vendor/ exclusion', () => {
    it('should exclude files in vendor/ directory', () => {
      // Given: vendor/内のファイル
      const candidate: BugCandidate = {
        title: 'Dependency bug in vendor library',
        file: 'vendor/github.com/example/lib/main.go',
        line: 25,
        severity: 'high',
        description: 'vendorライブラリでバグが検出されました。これは重要な問題です。',
        suggestedFix: 'ライブラリをアップデートしてください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-006: __pycache__/内のファイルが除外される（正常系）
   *
   * 目的: __pycache__/ ディレクトリ内のファイルが除外されることを検証
   */
  describe('TC-EXCL-006: __pycache__/ exclusion', () => {
    it('should exclude files in __pycache__/ directory', () => {
      // Given: __pycache__/内のファイル
      const candidate: BugCandidate = {
        title: 'Bytecode issue in Python cache',
        file: 'src/__pycache__/module.cpython-39.pyc',
        line: 1,
        severity: 'low',
        description: 'バイトコードファイルで問題が検出されました。これは軽微な問題です。',
        suggestedFix: 'ソースコードを修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-007: *.min.jsファイルが除外される（正常系）
   *
   * 目的: minifiedファイル（*.min.js）が除外されることを検証
   */
  describe('TC-EXCL-007: *.min.js file exclusion', () => {
    it('should exclude minified JavaScript files', () => {
      // Given: minifiedファイル
      const candidate: BugCandidate = {
        title: 'Error in minified JavaScript code',
        file: 'src/assets/jquery.min.js',
        line: 1,
        severity: 'low',
        description: 'minifiedコードでエラーが検出されました。これは軽微な問題です。',
        suggestedFix: 'ソースコードを修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-008: *.generated.*ファイルが除外される（正常系）
   *
   * 目的: 生成ファイル（*.generated.*）が除外されることを検証
   */
  describe('TC-EXCL-008: *.generated.* file exclusion', () => {
    it('should exclude generated files', () => {
      // Given: 生成ファイル
      const candidate: BugCandidate = {
        title: 'Error in generated API code',
        file: 'src/types/api.generated.ts',
        line: 50,
        severity: 'medium',
        description: '生成されたコードでエラーが検出されました。これは中程度の問題です。',
        suggestedFix: 'ジェネレーターを修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-009: *.pb.go（Protocol Buffer生成ファイル）が除外される（正常系）
   *
   * 目的: Protocol Buffer生成ファイル（*.pb.go）が除外されることを検証
   */
  describe('TC-EXCL-009: *.pb.go file exclusion', () => {
    it('should exclude Protocol Buffer generated files', () => {
      // Given: Protocol Buffer生成ファイル
      const candidate: BugCandidate = {
        title: 'Error in protobuf generated code',
        file: 'pkg/api/user.pb.go',
        line: 123,
        severity: 'low',
        description: 'Protocol Buffer生成コードでエラーが検出されました。これは軽微な問題です。',
        suggestedFix: '.protoファイルを修正して再生成してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-010: package-lock.json（ロックファイル）が除外される（正常系）
   *
   * 目的: ロックファイル（package-lock.json）が除外されることを検証
   */
  describe('TC-EXCL-010: package-lock.json exclusion', () => {
    it('should exclude package-lock.json file', () => {
      // Given: ロックファイル
      const candidate: BugCandidate = {
        title: 'Dependency version conflict detected',
        file: 'package-lock.json',
        line: 456,
        severity: 'medium',
        description: '依存関係のバージョン競合が検出されました。これは中程度の問題です。',
        suggestedFix: 'package.jsonを修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-011: go.sum（ロックファイル）が除外される（正常系）
   *
   * 目的: Goロックファイル（go.sum）が除外されることを検証
   */
  describe('TC-EXCL-011: go.sum exclusion', () => {
    it('should exclude go.sum file', () => {
      // Given: Goロックファイル
      const candidate: BugCandidate = {
        title: 'Checksum mismatch in dependencies',
        file: 'go.sum',
        line: 89,
        severity: 'low',
        description: 'チェックサム不一致が検出されました。これは軽微な問題です。',
        suggestedFix: 'go mod tidyを実行してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-012: .pngファイル（バイナリ）が除外される（正常系）
   *
   * 目的: バイナリファイル（.png）が除外されることを検証
   */
  describe('TC-EXCL-012: Binary file (.png) exclusion', () => {
    it('should exclude PNG image files', () => {
      // Given: PNGファイル
      const candidate: BugCandidate = {
        title: 'Image corruption detected in logo',
        file: 'assets/logo.png',
        line: 1,
        severity: 'low',
        description: '画像ファイルが破損しています。これは軽微な問題です。',
        suggestedFix: '画像を再生成してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-EXCL-013: .exeファイル（バイナリ）が除外される（正常系）
   *
   * 目的: 実行ファイル（.exe）が除外されることを検証
   */
  describe('TC-EXCL-013: Binary file (.exe) exclusion', () => {
    it('should exclude executable files', () => {
      // Given: 実行ファイル
      const candidate: BugCandidate = {
        title: 'Malware detected in executable',
        file: 'bin/application.exe',
        line: 1,
        severity: 'high',
        description: '実行ファイルでマルウェアが検出されました。これは重要な問題です。',
        suggestedFix: 'ソースコードをレビューしてください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-VALID-001: 通常のソースファイルは除外されない（正常系）
   *
   * 目的: 除外パターンに該当しない通常のソースファイルが除外されないことを検証
   */
  describe('TC-VALID-001: Normal source files are not excluded', () => {
    it('should accept normal TypeScript source files', () => {
      // Given: 通常のTypeScriptファイル
      const candidate: BugCandidate = {
        title: 'Unhandled promise rejection in function',
        file: 'src/services/user-service.ts',
        line: 42,
        severity: 'high',
        description:
          'user-service.tsでPromiseの拒否が適切にハンドリングされていません。これは重要な問題です。',
        suggestedFix: 'try-catchブロックを追加してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 検証を通過
      expect(result).toBe(true);
    });

    it('should accept normal Go source files', () => {
      // Given: 通常のGoファイル
      const candidate: BugCandidate = {
        title: 'Nil pointer dereference in GetUser',
        file: 'pkg/service/user.go',
        line: 25,
        severity: 'high',
        description:
          'user.goでnilポインタデリファレンスが発生する可能性があります。これは重要な問題です。追加のチェックが必要です。',
        suggestedFix: 'nilチェックを追加してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 検証を通過
      expect(result).toBe(true);
    });

    it('should accept normal Python source files', () => {
      // Given: 通常のPythonファイル
      const candidate: BugCandidate = {
        title: 'File handle not closed in function',
        file: 'src/utils/config_loader.py',
        line: 19,
        severity: 'medium',
        description:
          'config_loader.pyでファイルハンドルがクローズされていません。これは中程度の問題です。',
        suggestedFix: 'with文を使用してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 検証を通過
      expect(result).toBe(true);
    });
  });

  /**
   * TC-SEC-001: パストラバーサル攻撃が防止される（セキュリティテスト）
   *
   * 目的: ../ を含む相対パスが除外されることを検証（セキュリティ対策）
   */
  describe('TC-SEC-001: Path traversal attack prevention', () => {
    it('should exclude paths with ../ (path traversal attack)', () => {
      // Given: パストラバーサルを含むパス
      const candidate: BugCandidate = {
        title: 'Type error in lodash library',
        file: '../../node_modules/lodash/index.js',
        line: 42,
        severity: 'high',
        description: 'lodashライブラリで型エラーが発生する可能性があります。これは重要な問題です。',
        suggestedFix: '型定義を修正してください。これは適切な修正方法です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 除外される（セキュリティ対策）
      expect(result).toBe(false);
    });
  });

  /**
   * TC-REGRESSION-001: 既存バリデーションロジックの回帰テスト
   *
   * 目的: 既存のタイトル長バリデーションが機能していることを確認
   */
  describe('TC-REGRESSION-001: Title length validation (regression test)', () => {
    it('should reject candidates with title less than 10 characters', () => {
      // Given: タイトルが10文字未満
      const candidate: BugCandidate = {
        title: 'Short',
        file: 'src/test.ts',
        line: 10,
        severity: 'high',
        description:
          'これは50文字以上の説明文です。これは50文字以上の説明文です。これは50文字以上の説明文です。',
        suggestedFix: 'これは20文字以上の修正案です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 拒否される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-REGRESSION-002: 深刻度バリデーションの回帰テスト
   *
   * 目的: 既存の深刻度バリデーションが機能していることを確認
   */
  describe('TC-REGRESSION-002: Severity validation (regression test)', () => {
    it('should reject candidates with invalid severity', () => {
      // Given: 不正な深刻度
      const candidate: BugCandidate = {
        title: 'Valid title here for testing purposes',
        file: 'src/test.ts',
        line: 10,
        severity: 'critical' as any,
        description:
          'これは50文字以上の説明文です。これは50文字以上の説明文です。これは50文字以上の説明文です。',
        suggestedFix: 'これは20文字以上の修正案です。',
        category: 'bug',
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 拒否される
      expect(result).toBe(false);
    });
  });

  /**
   * TC-REGRESSION-003: カテゴリバリデーションの回帰テスト
   *
   * 目的: 既存のカテゴリバリデーションが機能していることを確認（Phase 1では'bug'のみ）
   */
  describe('TC-REGRESSION-003: Category validation (regression test)', () => {
    it("should reject candidates with category other than 'bug'", () => {
      // Given: 'bug'以外のカテゴリ
      const candidate: BugCandidate = {
        title: 'Valid title here for testing purposes',
        file: 'src/test.ts',
        line: 10,
        severity: 'high',
        description:
          'これは50文字以上の説明文です。これは50文字以上の説明文です。これは50文字以上の説明文です。',
        suggestedFix: 'これは20文字以上の修正案です。',
        category: 'refactor' as any,
      };

      // When: validateBugCandidateを直接呼び出し
      // @ts-ignore
      const result = analyzer.validateBugCandidate(candidate);

      // Then: 拒否される
      expect(result).toBe(false);
    });
  });
});
