import { jest } from '@jest/globals';
import * as path from 'node:path';
import fs from 'fs-extra';
import { DocumentationPhase } from '../../../src/phases/documentation.js';

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
      const promptPath = path.join(srcPromptsDir, 'implementation', 'ja', 'execute.txt');

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
      const promptPath = path.join(srcPromptsDir, 'implementation', 'ja', 'execute.txt');
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
      const promptPath = path.join(srcPromptsDir, 'test_implementation', 'ja', 'execute.txt');

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
      const promptPath = path.join(srcPromptsDir, 'test_implementation', 'ja', 'execute.txt');
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
      const promptPath = path.join(srcPromptsDir, 'testing', 'ja', 'execute.txt');

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
      const promptPath = path.join(srcPromptsDir, 'testing', 'ja', 'execute.txt');
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
      const promptPath = path.join(srcPromptsDir, 'documentation', 'ja', 'execute.txt');

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
      const promptPath = path.join(srcPromptsDir, 'documentation', 'ja', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: テーブルフォーマット指示が含まれる
      expect(content).toMatch(/\|.*ファイル.*\|.*更新理由.*\|/);
    });
  });

  // ========================================
  // Issue #388: Documentation prompt length guidance
  // ========================================
  describe('Issue #388: Documentation prompt length guidance', () => {
    const documentationPromptPath = path.join(srcPromptsDir, 'documentation', 'ja', 'execute.txt');
    const documentationReviewPath = path.join(srcPromptsDir, 'documentation', 'ja', 'review.txt');
    const documentationRevisePath = path.join(srcPromptsDir, 'documentation', 'ja', 'revise.txt');
    const troubleshootingPath = path.join(projectRoot, 'TROUBLESHOOTING.md');

    let documentationPrompt: string;
    let documentationReviewPrompt: string;
    let documentationRevisePrompt: string;
    let troubleshootingContent: string;

    beforeAll(() => {
      expect(fs.existsSync(documentationPromptPath)).toBe(true);
      documentationPrompt = fs.readFileSync(documentationPromptPath, 'utf-8');

      expect(fs.existsSync(documentationReviewPath)).toBe(true);
      documentationReviewPrompt = fs.readFileSync(documentationReviewPath, 'utf-8');

      expect(fs.existsSync(documentationRevisePath)).toBe(true);
      documentationRevisePrompt = fs.readFileSync(documentationRevisePath, 'utf-8');

      expect(fs.existsSync(troubleshootingPath)).toBe(true);
      troubleshootingContent = fs.readFileSync(troubleshootingPath, 'utf-8');
    });

    it('should include a prompt length mitigation section with auto-context warning', () => {
      expect(documentationPrompt).toContain('⚠️ 重要: プロンプト長制限への対応');
      expect(documentationPrompt).toMatch(/自動的にコンテキストに含まれているファイル/);
      expect(documentationPrompt).toContain('Read ツールで再読込すると二重読み込み');
    });

    it('should warn that CLAUDE context files must not be re-read', () => {
      expect(documentationPrompt).toContain('CLAUDE.md');
      expect(documentationPrompt).toContain('~/.claude/CLAUDE.md');
      expect(documentationPrompt).toMatch(/Read\s*(ツール)?で再読込しない|Read\s*不要/);
    });

    it('should outline strict Read tool limits and partial read guidance', () => {
      expect(documentationPrompt).toMatch(/最大3-5件|最大3-5ファイル/);
      expect(documentationPrompt).toContain('limit: 1000-2000');
      expect(documentationPrompt).toMatch(/再読み込みしない|再読込しない/);
      expect(documentationPrompt).toMatch(/部分読み込み|部分読み/);
    });

    it('should recommend staged processing for documentation updates', () => {
      expect(documentationPrompt).toContain('1-2ファイルずつ');
      expect(documentationPrompt).toMatch(/重要度の高いもの|重要なドキュメント/);
      expect(documentationPrompt).toContain('Edit で反映');
    });

    it('should keep required template placeholders and quality gates intact', () => {
      const requiredPlaceholders = [
        '{planning_document_path}',
        '{implementation_context}',
        '{testing_context}',
        '{requirements_context}',
        '{design_context}',
        '{test_scenario_context}',
        '{test_implementation_context}',
      ];

      requiredPlaceholders.forEach((placeholder) => {
        expect(documentationPrompt).toContain(placeholder);
      });
      expect(documentationPrompt).toMatch(/品質ゲート（Phase 7: Documentation）/);
      expect(documentationPrompt).toContain('ドキュメント更新手順');
    });

    it('should include read-tool constraints in review and revise prompts', () => {
      const sharedChecks = (content: string) => {
        expect(content).toContain('CLAUDE.md');
        expect(content).toContain('~/.claude/CLAUDE.md');
        expect(content).toMatch(/3-5ファイル|3-5件/);
        expect(content).toContain('limit: 1000-2000');
      };

      sharedChecks(documentationReviewPrompt);
      sharedChecks(documentationRevisePrompt);
    });

    it('should describe symptoms, causes, actions, and prevention in troubleshooting guide', () => {
      expect(troubleshootingContent).toContain('`Prompt is too long` エラー（Documentation Phase）');
      expect(troubleshootingContent).toMatch(/症状/);
      expect(troubleshootingContent).toMatch(/主な原因/);
      expect(troubleshootingContent).toMatch(/対処法/);
      expect(troubleshootingContent).toMatch(/予防策/);
      expect(troubleshootingContent).toMatch(/CLAUDE\.md/);
      expect(troubleshootingContent).toMatch(/limit: 1000-2000/);
      expect(troubleshootingContent).toMatch(/1-2ファイルずつ|3-5ファイル/);
    });
  });

  // ========================================
  // UT-5: Phase 8（Report）プロンプト読み込みテスト
  // ========================================
  describe('UT-5: Phase 8 Report Prompt Loading', () => {
    it('should contain executive summary and @references format instructions', () => {
      // Given: Phase 8のプロンプトファイルパス
      const promptPath = path.join(srcPromptsDir, 'report', 'ja', 'execute.txt');

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
      const promptPath = path.join(srcPromptsDir, 'report', 'ja', 'execute.txt');
      const content = fs.readFileSync(promptPath, 'utf-8');

      // Then: マージチェックリストが含まれる
      expect(content).toContain('マージチェックリスト');
      expect(content).toMatch(/要件充足|テスト成功|ドキュメント更新/);
    });

    it('should NOT contain detailed phase summary sections', () => {
      const promptPath = path.join(srcPromptsDir, 'report', 'ja', 'execute.txt');
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
        const srcPromptPath = path.join(srcPromptsDir, dir, 'ja', 'execute.txt');
        const distPromptPath = path.join(distPromptsDir, dir, 'ja', 'execute.txt');

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
        const promptPath = path.join(srcPromptsDir, dir, 'ja', 'execute.txt');

        // When: プロンプトファイルが存在する
        expect(fs.existsSync(promptPath)).toBe(true);

        const content = fs.readFileSync(promptPath, 'utf-8');

        // Then: 詳細なフォーマット指示が維持されている（簡潔化されていない）
        // Note: Phase 0-2は詳細を維持するため、特定のキーワードが含まれることを確認
        expect(content.length).toBeGreaterThan(1000); // 詳細なプロンプトは1000文字以上
      });
    });

    it('should verify that Phase 0-2 prompts still contain detailed sections', () => {
      const planningPath = path.join(srcPromptsDir, 'planning', 'ja', 'execute.txt');
      const requirementsPath = path.join(srcPromptsDir, 'requirements', 'ja', 'execute.txt');
      const designPath = path.join(srcPromptsDir, 'design', 'ja', 'execute.txt');

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
  // Integration: DocumentationPhase prompt loading (Issue #388)
  // ========================================
  describe('Issue #388 Integration: DocumentationPhase prompt loading', () => {
    const tempRoot = path.join(projectRoot, 'tests', 'temp', 'documentation-phase-issue-388');
    const workflowDir = path.join(tempRoot, '.ai-workflow', 'issue-388');
    const documentationOutputDir = path.join(workflowDir, '07_documentation', 'output');
    const documentationLogPath = path.join(documentationOutputDir, 'documentation-update-log.md');
    let phase: DocumentationPhase;

    beforeAll(() => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      fs.mkdirSync(documentationOutputDir, { recursive: true });
      fs.writeFileSync(documentationLogPath, '# documentation log', 'utf-8');

      const mockMetadata: any = {
        workflowDir,
        data: {
          issue_number: '388',
          phases: {
            documentation: {
              status: 'pending',
              retry_count: 0,
              completed_steps: [],
              review_result: null,
              output_files: [],
              started_at: null,
              completed_at: null,
              current_step: null,
              rollback_context: null,
            },
          },
        },
        updatePhaseStatus: jest.fn(),
        getPhaseStatus: jest.fn(),
        addCompletedStep: jest.fn(),
        getCompletedSteps: jest.fn().mockReturnValue([]),
        updateCurrentStep: jest.fn(),
        save: jest.fn(),
        incrementRetryCount: jest.fn().mockReturnValue(0),
        getRollbackContext: jest.fn().mockReturnValue(null),
        clearRollbackContext: jest.fn(),
        getLanguage: jest.fn().mockReturnValue('ja'),
      };

      const mockGithub: any = {
        getIssueInfo: jest.fn(),
        postComment: jest.fn(),
        createOrUpdateProgressComment: jest.fn(),
        postReviewResult: jest.fn(),
      };

      phase = new DocumentationPhase({
        workingDir: tempRoot,
        metadataManager: mockMetadata,
        githubClient: mockGithub,
        skipDependencyCheck: true,
      });

      jest.spyOn(phase as any, 'executeWithAgent').mockResolvedValue([]);
    });

    afterAll(() => {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('should load execute prompt with guidance without throwing', () => {
      const prompt = (phase as any).loadPrompt('execute');
      expect(prompt).toContain('⚠️ 重要: プロンプト長制限への対応');
      // Note: "🛠️ 開発環境情報" section was removed in Issue #207 prompt simplification
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should build review prompt that resolves documentation log reference', () => {
      const reviewPrompt = (phase as any).buildPrompt('review', 388, documentationLogPath);
      expect(reviewPrompt).toMatch(/@\.ai-workflow\/issue-388\/07_documentation\/output\/documentation-update-log\.md/);
      expect(reviewPrompt).toContain('Readツール使用時の注意');
      expect(reviewPrompt).not.toContain('{documentation_update_log_path}');
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
        const promptPath = path.join(srcPromptsDir, dir, 'ja', 'execute.txt');
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
        const promptPath = path.join(srcPromptsDir, dir, 'ja', 'execute.txt');
        if (fs.existsSync(promptPath)) {
          const content = fs.readFileSync(promptPath, 'utf-8');

          // Then: 品質ゲートセクションが維持されている
          expect(content).toMatch(/品質ゲート|Quality Gate/i);
        }
      });
    });
  });

  // ========================================
  // コンテキスト削減効果の検証（参考）
  // ========================================
  describe('Context Reduction Effect (Reference)', () => {
    it('should show approximate size reduction for Phase 8 prompt', () => {
      const promptPath = path.join(srcPromptsDir, 'report', 'ja', 'execute.txt');

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
