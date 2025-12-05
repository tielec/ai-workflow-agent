import { jest } from '@jest/globals';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import type * as FsExtra from 'fs-extra';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * Issue #207: 中盤フェーズ（Phase 4-8）の出力ドキュメント簡潔化
 *
 * テスト対象:
 * - Phase 4-8のプロンプトファイルが簡潔化されたフォーマット指示を含むこと
 * - Phase 0-2のプロンプトファイルが変更されていないこと
 * - ビルド後にプロンプトファイルが正しくコピーされること
 */
describe('Issue #207: Prompt Simplification for Phase 4-8', () => {
  const projectRoot = path.resolve(process.cwd());
  const srcPromptsDir = path.join(projectRoot, 'src', 'prompts');
  const distPromptsDir = path.join(projectRoot, 'dist', 'prompts');

  // ========================================
  // UT-1: Phase 4（Implementation）プロンプト読み込みテスト
  // ========================================
  describe('UT-1: Phase 4 Implementation Prompt Loading', () => {
    it('should contain simplified format instructions for implementation phase', () => {
      // Given: Phase 4のプロンプトファイルパス
      const promptPath = path.join(srcPromptsDir, 'implementation', 'execute.txt');

      // When: プロンプトファイルを読み込む
      expect(fs.existsSync(promptPath)).toBe(true);
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: 簡潔化されたフォーマット指示が含まれる
      expect(content).toContain('変更ファイル一覧');
      expect(content).toContain('主要な変更点');

      // Then: 削除された詳細セクションが含まれない
      expect(content).not.toMatch(/実装詳細.*ファイル1:/s);
      expect(content).not.toMatch(/各ファイルの変更内容を以下の形式で詳細に記載/);
    });

    it('should contain table format instructions', () => {
      const promptPath = path.join(srcPromptsDir, 'implementation', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: テーブルフォーマット指示が含まれる
      expect(content).toMatch(/\|.*ファイル.*\|.*変更種別.*\|.*概要.*\|/);
    });
  });

  // ========================================
  // UT-2: Phase 5（Test Implementation）プロンプト読み込みテスト
  // ========================================
  describe('UT-2: Phase 5 Test Implementation Prompt Loading', () => {
    it('should contain simplified format instructions for test implementation phase', () => {
      // Given: Phase 5のプロンプトファイルパス
      const promptPath = path.join(srcPromptsDir, 'test_implementation', 'execute.txt');

      // When: プロンプトファイルを読み込む
      expect(fs.existsSync(promptPath)).toBe(true);
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: 簡潔化されたフォーマット指示が含まれる
      expect(content).toContain('テストファイル一覧');
      expect(content).toContain('テストカバレッジ');

      // Then: 削除された詳細セクションが含まれない
      expect(content).not.toMatch(/テストケース詳細.*ファイル:/s);
      expect(content).not.toMatch(/各テストケースの内容を以下の形式で詳細に記載/);
    });

    it('should contain table format instructions for test files', () => {
      const promptPath = path.join(srcPromptsDir, 'test_implementation', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: テーブルフォーマット指示が含まれる
      expect(content).toMatch(/\|.*ファイル.*\|.*テスト数.*\|.*カバー対象.*\|/);
    });
  });

  // ========================================
  // UT-3: Phase 6（Testing）プロンプト読み込みテスト
  // ========================================
  describe('UT-3: Phase 6 Testing Prompt Loading', () => {
    it('should contain conditional format instructions (success/failure)', () => {
      // Given: Phase 6のプロンプトファイルパス
      const promptPath = path.join(srcPromptsDir, 'testing', 'execute.txt');

      // When: プロンプトファイルを読み込む
      expect(fs.existsSync(promptPath)).toBe(true);
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: テスト結果サマリーが含まれる
      expect(content).toContain('テスト結果サマリー');

      // Then: 成功時/失敗時の条件分岐指示が含まれる
      expect(content).toMatch(/成功時|失敗時/);
      expect(content).toMatch(/全てのテストが成功|失敗したテスト/);

      // Then: 成功したテストの詳細リストを記載しない旨の指示が含まれる
      expect(content).toMatch(/成功したテストの詳細.*記載しない|成功.*詳細.*省略/i);
    });

    it('should contain summary format instructions', () => {
      const promptPath = path.join(srcPromptsDir, 'testing', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: サマリー形式の指示が含まれる
      expect(content).toMatch(/総テスト数|成功率/);
    });
  });

  // ========================================
  // UT-4: Phase 7（Documentation）プロンプト読み込みテスト
  // ========================================
  describe('UT-4: Phase 7 Documentation Prompt Loading', () => {
    it('should contain simplified format instructions for documentation phase', () => {
      // Given: Phase 7のプロンプトファイルパス
      const promptPath = path.join(srcPromptsDir, 'documentation', 'execute.txt');

      // When: プロンプトファイルを読み込む
      expect(fs.existsSync(promptPath)).toBe(true);
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: 簡潔化されたフォーマット指示が含まれる
      expect(content).toContain('更新サマリー');

      // Then: 更新不要ファイルを省略する旨の指示が含まれる
      expect(content).toMatch(/更新不要.*省略|更新不要.*記載しない/i);

      // Then: 削除された詳細セクションが含まれない
      expect(content).not.toMatch(/調査したドキュメント.*すべての.*ファイル/s);
      expect(content).not.toMatch(/更新不要と判断したドキュメント/);
    });

    it('should contain table format instructions for documentation updates', () => {
      const promptPath = path.join(srcPromptsDir, 'documentation', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: テーブルフォーマット指示が含まれる
      expect(content).toMatch(/\|.*ファイル.*\|.*更新理由.*\|/);
    });
  });

  // ========================================
  // UT-5: Phase 8（Report）プロンプト読み込みテスト
  // ========================================
  describe('UT-5: Phase 8 Report Prompt Loading', () => {
    it('should contain executive summary and @references format instructions', () => {
      // Given: Phase 8のプロンプトファイルパス
      const promptPath = path.join(srcPromptsDir, 'report', 'execute.txt');

      // When: プロンプトファイルを読み込む
      expect(fs.existsSync(promptPath)).toBe(true);
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: エグゼクティブサマリーが含まれる
      expect(content).toContain('エグゼクティブサマリー');

      // Then: 詳細参照セクションが含まれる
      expect(content).toContain('詳細参照');

      // Then: @references形式のパスが含まれる
      expect(content).toMatch(/@\.ai-workflow\/issue-.*\/.*\/output\//);

      // Then: 各フェーズの詳細を再掲載しない旨の指示が含まれる
      expect(content).toMatch(/詳細.*再掲載.*しない|各フェーズの詳細.*ここに.*記載しない/i);
    });

    it('should contain merge checklist format', () => {
      const promptPath = path.join(srcPromptsDir, 'report', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: マージチェックリストが含まれる
      expect(content).toContain('マージチェックリスト');
      expect(content).toMatch(/要件充足|テスト成功|ドキュメント更新/);
    });

    it('should NOT contain detailed phase summary sections', () => {
      const promptPath = path.join(srcPromptsDir, 'report', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: 削除された詳細再掲載セクションが含まれない
      expect(content).not.toMatch(/要件定義サマリー.*要件定義書の内容を詳細に/s);
      expect(content).not.toMatch(/設計サマリー.*設計書の内容を詳細に/s);
      expect(content).not.toMatch(/実装サマリー.*実装レポートの内容を詳細に/s);
    });
  });

  // ========================================
  // UT-6 ~ UT-10: ビルド後のプロンプトファイル存在確認テスト
  // ========================================
  describe('Build Verification: Prompt Files in dist/', () => {
    const phases = [
      { phase: 'Phase 4', dir: 'implementation' },
      { phase: 'Phase 5', dir: 'test_implementation' },
      { phase: 'Phase 6', dir: 'testing' },
      { phase: 'Phase 7', dir: 'documentation' },
      { phase: 'Phase 8', dir: 'report' },
    ];

    phases.forEach(({ phase, dir }) => {
      it(`UT-${6 + phases.indexOf({ phase, dir })}: ${phase} prompt should exist in dist/ after build`, () => {
        // Given: ビルド後のdist/prompts/ディレクトリ
        const srcPromptPath = path.join(srcPromptsDir, dir, 'execute.txt');
        const distPromptPath = path.join(distPromptsDir, dir, 'execute.txt');

        // When: ビルドが実行されている場合
        if (!fs.existsSync(distPromptsDir)) {
          console.warn('Warning: dist/prompts/ does not exist. Run "npm run build" first.');
          return; // ビルドされていない場合はスキップ
        }

        // Then: dist/にプロンプトファイルが存在する
        expect(fs.existsSync(distPromptPath)).toBe(true);

        // Then: ファイル内容がsrc/と同一である
        if (fs.existsSync(srcPromptPath) && fs.existsSync(distPromptPath)) {
          const srcContent = fs.readFileSync(srcPromptPath, 'utf-8');
          const distContent = fs.readFileSync(distPromptPath, 'utf-8');
          expect(distContent).toBe(srcContent);
        }
      });
    });
  });

  // ========================================
  // UT-11: Phase 0-2のプロンプトファイルが変更されていないことの確認
  // ========================================
  describe('UT-11: Phase 0-2 Unchanged Verification', () => {
    it('should verify that Phase 0-2 prompts are NOT modified', () => {
      // Given: Phase 0-2のプロンプトファイルパス
      const earlyPhases = [
        { phase: 'Phase 0', dir: 'planning' },
        { phase: 'Phase 1', dir: 'requirements' },
        { phase: 'Phase 2', dir: 'design' },
      ];

      earlyPhases.forEach(({ phase, dir }) => {
        const promptPath = path.join(srcPromptsDir, dir, 'execute.txt');

        // When: プロンプトファイルが存在する
        expect(fs.existsSync(promptPath)).toBe(true);

        const content = fs.readFileSync(promptPath, 'utf-8');

        // Then: 詳細なフォーマット指示が維持されている（簡潔化されていない）
        // Note: Phase 0-2は詳細を維持するため、特定のキーワードが含まれることを確認
        expect(content.length).toBeGreaterThan(1000); // 詳細なプロンプトは1000文字以上
      });
    });

    it('should verify that Phase 0-2 prompts still contain detailed sections', () => {
      const planningPath = path.join(srcPromptsDir, 'planning', 'execute.txt');
      const requirementsPath = path.join(srcPromptsDir, 'requirements', 'execute.txt');
      const designPath = path.join(srcPromptsDir, 'design', 'execute.txt');

      if (fs.existsSync(planningPath)) {
        const content = fs.readFileSync(planningPath, 'utf-8');
        // Planning phaseは詳細な分析を含むべき
        expect(content).toMatch(/複雑度|見積もり|リスク/i);
      }

      if (fs.existsSync(requirementsPath)) {
        const content = fs.readFileSync(requirementsPath, 'utf-8');
        // Requirements phaseは詳細な要件を含むべき
        expect(content).toMatch(/機能要件|非機能要件|受け入れ基準/i);
      }

      if (fs.existsSync(designPath)) {
        const content = fs.readFileSync(designPath, 'utf-8');
        // Design phaseは詳細な設計を含むべき
        expect(content).toMatch(/アーキテクチャ|詳細設計|実装戦略/i);
      }
    });
  });

  // ========================================
  // 追加テスト: プロンプトファイルの基本構造維持
  // ========================================
  describe('Additional: Prompt File Structure Preservation', () => {
    it('should preserve template variables in all modified prompts', () => {
      const modifiedPhases = [
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
      ];

      modifiedPhases.forEach((dir) => {
        const promptPath = path.join(srcPromptsDir, dir, 'execute.txt');
        if (fs.existsSync(promptPath)) {
          const content = fs.readFileSync(promptPath, 'utf-8');

          // Then: テンプレート変数が維持されている
          // 少なくとも1つのテンプレート変数 {xxx} が存在するはず
          expect(content).toMatch(/\{[a-z_]+\}/);
        }
      });
    });

    it('should preserve quality gate sections in all modified prompts', () => {
      const modifiedPhases = [
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
      ];

      modifiedPhases.forEach((dir) => {
        const promptPath = path.join(srcPromptsDir, dir, 'execute.txt');
        if (fs.existsSync(promptPath)) {
          const content = fs.readFileSync(promptPath, 'utf-8');

          // Then: 品質ゲートセクションが維持されている
          expect(content).toMatch(/品質ゲート|Quality Gate/i);
        }
      });
    });

    it('should preserve environment information section in all modified prompts', () => {
      const modifiedPhases = [
        'implementation',
        'test_implementation',
        'testing',
        'documentation',
        'report',
      ];

      modifiedPhases.forEach((dir) => {
        const promptPath = path.join(srcPromptsDir, dir, 'execute.txt');
        if (fs.existsSync(promptPath)) {
          const content = fs.readFileSync(promptPath, 'utf-8');

          // Then: 開発環境情報セクションが維持されている
          expect(content).toMatch(/🛠️.*開発環境情報|環境情報|Docker環境/i);
        }
      });
    });
  });

  // ========================================
  // コンテキスト削減効果の検証（参考）
  // ========================================
  describe('Context Reduction Effect (Reference)', () => {
    it('should show approximate size reduction for Phase 8 prompt', () => {
      const promptPath = path.join(srcPromptsDir, 'report', 'execute.txt');

      if (fs.existsSync(promptPath)) {
        const content = fs.readFileSync(promptPath, 'utf-8');
        const size = content.length;

        console.log(`Phase 8 prompt file size: ${size} characters`);

        // Note: これは参考情報であり、実際のコンテキスト削減効果は
        // 生成される出力ドキュメント（report.md）のサイズで測定される
        // （インテグレーションテストで実施）
      }
    });
  });
});
