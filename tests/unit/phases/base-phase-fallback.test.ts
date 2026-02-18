/**
 * Unit tests for BasePhase fallback mechanism (Issue #113)
 *
 * Tests cover:
 * - extractContentFromLog(): Log extraction with pattern matching
 * - isValidOutputContent(): Content validation logic
 * - handleMissingOutputFile(): Fallback processing orchestration
 * - executePhaseTemplate(): Integration with enableFallback option
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'node:path';
import { BasePhase } from '../../../src/phases/base-phase.js';
import { MetadataManager } from '../../../src/core/metadata-manager.js';
import { GitHubClient } from '../../../src/core/github-client.js';
import { PhaseExecutionResult, PhaseName } from '../../../src/types.js';
import { logger } from '../../../src/utils/logger.js';

// Concrete implementation of BasePhase for testing
class TestPhase extends BasePhase {
  constructor(params: any) {
    super({ ...params, phaseName: 'planning' as PhaseName });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true, output: 'test-output.md' };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true, output: null };
  }

  public async testRevise(feedback: string): Promise<PhaseExecutionResult> {
    return { success: true, output: 'planning.md' };
  }

  // Expose protected methods for testing
  public exposeExtractContentFromLog(agentLog: string, phaseName: PhaseName): string | null {
    return this.extractContentFromLog(agentLog, phaseName);
  }

  public exposeIsValidOutputContent(content: string, phaseName: PhaseName): boolean {
    return this.isValidOutputContent(content, phaseName);
  }

  public exposeHandleMissingOutputFile(
    phaseOutputFile: string,
    logDir: string
  ): Promise<PhaseExecutionResult> {
    return this.handleMissingOutputFile(phaseOutputFile, logDir);
  }

  public exposeExecutePhaseTemplate<T extends Record<string, string>>(
    phaseOutputFile: string,
    templateVariables: T,
    options?: { maxTurns?: number; verbose?: boolean; logDir?: string; enableFallback?: boolean }
  ): Promise<PhaseExecutionResult> {
    return this.executePhaseTemplate(phaseOutputFile, templateVariables, options);
  }
}

class FlexiblePhase extends BasePhase {
  constructor(params: any, phaseName: PhaseName) {
    super({ ...params, phaseName });
  }

  protected async execute(): Promise<PhaseExecutionResult> {
    return { success: true, output: 'test-output.md' };
  }

  protected async review(): Promise<PhaseExecutionResult> {
    return { success: true, output: null };
  }

  public async revise(_: string): Promise<PhaseExecutionResult> {
    return { success: true, output: 'dummy.md' };
  }
}

function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Setup file system mock with limited scope.
 *
 * This mock intentionally does NOT mock prompt file reads to prevent
 * "EACCES: permission denied" errors in executePhaseTemplate tests.
 *
 * Reason: fs.readFileSync mock was affecting loadPrompt() method, causing
 * errors in executePhaseTemplate tests.
 *
 * Reference: Issue #113 Evaluation Report lines 145-160
 */
function setupFileSystemMock(): void {
  // Note: This function is intentionally empty as we don't want to mock
  // fs.readFileSync for these tests. The original issue was that mocking
  // fs.readFileSync was preventing loadPrompt() from working correctly.
  // By not mocking it at all, we allow the tests to work properly.
}

describe('BasePhase Fallback Mechanism (Issue #113)', () => {
  let testPhase: TestPhase;
  let mockMetadata: jest.Mocked<MetadataManager>;
  let mockGitHub: jest.Mocked<GitHubClient>;
  let testWorkingDir: string;

  beforeEach(() => {
    // Setup test working directory
    testWorkingDir = path.join(process.cwd(), '.test-tmp', 'base-phase-fallback');
    ensureDirectory(testWorkingDir);

    // Mock MetadataManager
    mockMetadata = {
      workflowDir: path.join(testWorkingDir, '.ai-workflow', 'issue-113'),
      data: {
        issue_number: '113',
        target_repository: {
          path: testWorkingDir,
          repo: path.basename(testWorkingDir),
        },
      },
      updatePhaseStatus: jest.fn(),
      getRollbackContext: jest.fn(),
      getLanguage: jest.fn().mockReturnValue('ja'),
    } as any;

    // Mock GitHubClient
    mockGitHub = {
      getIssueInfo: jest.fn(),
      postComment: jest.fn(),
    } as any;

    // Create TestPhase instance
    testPhase = new TestPhase({
      workingDir: testWorkingDir,
      metadataManager: mockMetadata,
      githubClient: mockGitHub,
    });
  });

  afterEach(() => {
    // Restore all mocks to prevent test interference
    jest.restoreAllMocks();
    jest.clearAllMocks();

    // Cleanup test directory
    if (fs.existsSync(testWorkingDir)) {
      fs.removeSync(testWorkingDir);
    }
  });

  describe('extractContentFromLog()', () => {
    describe('Planning Phase - Header pattern matching', () => {
      it('should extract content from log with Japanese header pattern', () => {
        // Given: Agent log contains valid planning document with Japanese header
        const agentLog = `
Some agent output...

# プロジェクト計画書 - Issue #113

## 1. Issue分析
複雑度: 中程度

## 2. 実装戦略判断
実装戦略: EXTEND
`;

        // When: Extracting content for planning phase
        const result = testPhase.exposeExtractContentFromLog(agentLog, 'planning');

        // Then: Content is successfully extracted
        expect(result).not.toBeNull();
        expect(result).toContain('プロジェクト計画書');
        expect(result).toContain('## 1. Issue分析');
        expect(result).toContain('## 2. 実装戦略判断');
      });

      it('should extract content from log with English header pattern', () => {
        // Given: Agent log contains valid planning document with English header
        const agentLog = `
Agent log here...

# Project Planning - Issue #113

## 1. Issue Analysis
Complexity: Medium

## 2. Implementation Strategy
Strategy: EXTEND
`;

        // When: Extracting content for planning phase
        const result = testPhase.exposeExtractContentFromLog(agentLog, 'planning');

        // Then: Content is successfully extracted
        expect(result).not.toBeNull();
        expect(result).toContain('Project Planning');
        expect(result).toContain('## 1. Issue Analysis');
      });
    });

    describe('Requirements Phase - Header pattern matching', () => {
      it('should extract content from log with Japanese header pattern', () => {
        // Given: Agent log contains valid requirements document
        const agentLog = `
Agent started...

# 要件定義書 - Issue #113

## 1. 概要
本要件定義書では...

## 2. 機能要件
FR-1: BasePhaseへの汎用フォールバック機構の実装
`;

        // When: Extracting content for requirements phase
        const result = testPhase.exposeExtractContentFromLog(agentLog, 'requirements');

        // Then: Content is successfully extracted
        expect(result).not.toBeNull();
        expect(result).toContain('要件定義書');
        expect(result).toContain('## 1. 概要');
        expect(result).toContain('## 2. 機能要件');
      });
    });

    describe('No header found - Fallback to markdown sections', () => {
      it('should extract content when header is not found but multiple markdown sections exist', () => {
        // Given: Agent log without header but with multiple markdown sections
        const agentLog = `
Agent started...

## Section 1
Content here...

## Section 2
More content...

## Section 3
Final content...
`;

        // When: Extracting content for planning phase
        const result = testPhase.exposeExtractContentFromLog(agentLog, 'planning');

        // Then: Content is extracted using fallback pattern
        expect(result).not.toBeNull();
        expect(result).toContain('## Section 1');
        expect(result).toContain('## Section 2');
        expect(result).toContain('## Section 3');
      });
    });

    describe('Pattern matching failure', () => {
      it('should return null when no valid pattern matches', () => {
        // Given: Agent log with no valid content
        const agentLog = `
Agent execution started.
No valid content generated.
Agent finished.
`;

        // When: Extracting content for planning phase
        const result = testPhase.exposeExtractContentFromLog(agentLog, 'planning');

        // Then: Returns null
        expect(result).toBeNull();
      });

      it('should return null when only single section exists', () => {
        // Given: Agent log with only one markdown section
        const agentLog = `
Agent output...

## Single Section
This is the only section.
`;

        // When: Extracting content for planning phase
        const result = testPhase.exposeExtractContentFromLog(agentLog, 'planning');

        // Then: Returns null (requires at least 2 sections)
        expect(result).toBeNull();
      });
    });

    describe('All phases header pattern validation', () => {
      const phaseHeaderTests: Array<{
        phase: PhaseName;
        header: string;
      }> = [
        { phase: 'planning', header: '# プロジェクト計画書' },
        { phase: 'requirements', header: '# 要件定義書' },
        { phase: 'design', header: '# 詳細設計書' },
        { phase: 'test_scenario', header: '# テストシナリオ' },
        { phase: 'implementation', header: '# 実装ログ' },
        { phase: 'report', header: '# プロジェクトレポート' },
      ];

      phaseHeaderTests.forEach(({ phase, header }) => {
        it(`should extract content for ${phase} phase with Japanese header`, () => {
          // Given: Agent log with phase-specific header
          const agentLog = `
Agent output...

${header} - Issue #113

## Section 1
Content here...

## Section 2
More content...
`;

          // When: Extracting content for the specific phase
          const result = testPhase.exposeExtractContentFromLog(agentLog, phase);

          // Then: Content is extracted
          expect(result).not.toBeNull();
          expect(result).toContain(header);
          expect(result).toContain('## Section 1');
        });
      });
    });
  });

  describe('isValidOutputContent()', () => {
    describe('Valid content cases', () => {
      it('should validate content with sufficient length and sections', () => {
        // Given: Content with >100 chars, multiple sections, and Planning phase keywords
        // Note: Planning phase requires at least one of the following keywords:
        //   - 実装戦略, テスト戦略, タスク分割 (Japanese)
        //   - Implementation Strategy, Test Strategy, Task Breakdown (English)
        // Reference: Issue #113 Evaluation Report lines 130-143
        const content = `
# Planning Document

## Section 1: Implementation Strategy
This is a comprehensive analysis with detailed explanations that provide sufficient content length.
実装戦略: EXTEND strategy will be used for this implementation.

## Section 2: Test Strategy
More detailed content with implementation strategy information.
テスト戦略: UNIT_INTEGRATION testing approach will be applied.

## Section 3: Task Breakdown
Additional sections with test strategy details.
タスク分割: Tasks are divided into multiple phases for efficient execution.
`;

        // When: Validating content for planning phase
        const result = testPhase.exposeIsValidOutputContent(content, 'planning');

        // Then: Content is valid
        expect(result).toBe(true);
      });

      it('should validate content with required keywords for planning phase', () => {
        // Given: Content with planning-specific keywords
        const content = `
# Planning Document

## 1. Implementation Strategy
実装戦略: EXTEND strategy will be used for this implementation.

## 2. Test Strategy
テスト戦略: UNIT_INTEGRATION testing approach.

## 3. Task Breakdown
タスク分割: Tasks are divided into 8 phases.
`.repeat(2); // Ensure >100 chars

        // When: Validating content for planning phase
        const result = testPhase.exposeIsValidOutputContent(content, 'planning');

        // Then: Content is valid (contains keywords)
        expect(result).toBe(true);
      });
    });

    describe('Invalid content cases - Length boundary', () => {
      it('should reject content shorter than 100 characters', () => {
        // Given: Content < 100 chars
        const content = `
# Planning
Short content.
`;

        // When: Validating content for planning phase
        const result = testPhase.exposeIsValidOutputContent(content, 'planning');

        // Then: Content is invalid
        expect(result).toBe(false);
      });
    });

    describe('Invalid content cases - Section count boundary', () => {
      it('should reject content with less than 2 section headers', () => {
        // Given: Content with only 1 section header but >100 chars
        const content = `
# Planning Document
This is a single paragraph with no sections but with sufficient length to meet the 100 character requirement for validation purposes in this test case.
`;

        // When: Validating content for planning phase
        const result = testPhase.exposeIsValidOutputContent(content, 'planning');

        // Then: Content is invalid (only 0 ## sections)
        expect(result).toBe(false);
      });
    });

    describe('Invalid content cases - Keyword validation', () => {
      it('should reject planning content missing all required keywords', () => {
        // Given: Content >100 chars, 2+ sections, but missing all planning keywords
        const content = `
# Some Document

## Section 1
This is some content that does not contain any of the required keywords for planning phase validation.

## Section 2
More generic content without the specific keywords needed such as implementation strategy or test strategy details.
`;

        // When: Validating content for planning phase
        const result = testPhase.exposeIsValidOutputContent(content, 'planning');

        // Then: Content is invalid (missing all keywords)
        expect(result).toBe(false);
      });

      it('should accept content with at least one required keyword', () => {
        // Given: Content with at least one planning keyword
        const content = `
# Planning Document

## Section 1
This document contains information about the implementation.
実装戦略について説明します。

## Section 2
Additional details and explanations to ensure sufficient content length.
`;

        // When: Validating content for planning phase
        const result = testPhase.exposeIsValidOutputContent(content, 'planning');

        // Then: Content is valid (has at least one keyword)
        expect(result).toBe(true);
      });
    });

    describe('Phase-specific keyword validation', () => {
      const keywordTests: Array<{
        phase: PhaseName;
        keyword: string;
      }> = [
        { phase: 'planning', keyword: '実装戦略' },
        { phase: 'requirements', keyword: '機能要件' },
        { phase: 'design', keyword: 'アーキテクチャ' },
        { phase: 'test_scenario', keyword: 'テストケース' },
        { phase: 'implementation', keyword: '実装' },
        { phase: 'report', keyword: 'プロジェクトレポート' },
      ];

      keywordTests.forEach(({ phase, keyword }) => {
        it(`should validate ${phase} content with phase-specific keyword`, () => {
          // Given: Content with phase-specific keyword
          const content = `
# Document

## Section 1
This section contains the keyword: ${keyword}

## Section 2
Additional content to meet validation requirements.
`;

          // When: Validating content for the specific phase
          const result = testPhase.exposeIsValidOutputContent(content, phase);

          // Then: Content is valid
          expect(result).toBe(true);
        });
      });
    });
  });

  describe('handleMissingOutputFile()', () => {
    describe('Log extraction success flow', () => {
      it('should extract content from log and save to file', async () => {
        // Given: Agent log exists with valid content
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const validLog = `
# プロジェクト計画書 - Issue #113

## 1. Issue分析
複雑度: 中程度
見積もり工数: 12~16時間

## 2. 実装戦略判断
実装戦略: EXTEND
テスト戦略: UNIT_INTEGRATION

## 3. 影響範囲分析
変更が必要なファイル: src/phases/base-phase.ts
`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validLog, 'utf-8');

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: File is created successfully
        expect(result.success).toBe(true);
        expect(result.output).toContain('planning.md');

        const savedContent = fs.readFileSync(path.join(outputDir, 'planning.md'), 'utf-8');
        expect(savedContent).toContain('プロジェクト計画書');
        expect(savedContent).toContain('## 1. Issue分析');
        expect(savedContent).not.toContain('スケルトンファイルです');
      });
    });

    describe('Agent log not found', () => {
      it('should return error when agent log does not exist', async () => {
        // Given: Agent log does not exist
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        ensureDirectory(executeDir);
        // Note: agent_log.md is NOT created

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: Error is returned
        expect(result.success).toBe(false);
        expect(result.error).toContain('planning.md が見つかりません');
        expect(result.error).toContain('エージェントログも見つかりません');
        expect(result.error).toContain('エージェントが正常に実行されなかった可能性があります');
      });
    });

    describe('Log extraction failure - revise called', () => {
      it('should call revise() when log extraction fails', async () => {
        // Given: Agent log exists but contains invalid content
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const invalidLog = `
Agent execution started.
No valid content generated.
Agent finished.
`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), invalidLog, 'utf-8');

        // Mock revise method
        const reviseSpy = jest.spyOn(testPhase as any, 'getReviseFunction')
          .mockReturnValue(async (feedback: string) => {
            expect(feedback).toContain('planning.md が見つかりません');
            return { success: true, output: 'planning.md' };
          });

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: revise() was called
        expect(reviseSpy).toHaveBeenCalled();
        expect(result.success).toBe(true);
        const savedContent = fs.readFileSync(path.join(outputDir, 'planning.md'), 'utf-8');
        expect(savedContent).toContain('# プロジェクト計画書');
        expect(savedContent).toContain('スケルトンファイルです');
      });

      it('should return error when revise() method is not implemented', async () => {
        // Given: Agent log with invalid content and no revise() method
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        ensureDirectory(executeDir);

        const invalidLog = `Agent output without valid content`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), invalidLog, 'utf-8');

        // Mock getReviseFunction to return null
        jest.spyOn(testPhase as any, 'getReviseFunction').mockReturnValue(null);

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: Error is returned
        expect(result.success).toBe(false);
        expect(result.error).toContain('revise() メソッドが実装されていません');
      });
    });

    describe('Skeleton generation for revise fallback', () => {
      it('should generate skeleton file before revise when output file is missing', async () => {
        // Given: Agent log exists but contains invalid content
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const invalidLog = `Agent execution started.\nNo valid content generated.\nAgent finished.`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), invalidLog, 'utf-8');

        // Mock revise method to keep skeleton content
        jest.spyOn(testPhase as any, 'getReviseFunction').mockReturnValue(async () => ({
          success: true,
          output: 'planning.md',
        }));

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: Skeleton file is created before revise
        expect(result.success).toBe(true);
        const savedContent = fs.readFileSync(path.join(outputDir, 'planning.md'), 'utf-8');
        expect(savedContent).toContain('# プロジェクト計画書');
        expect(savedContent).toContain('フォールバックにより自動生成されたスケルトンファイルです');
      });

      it('should not overwrite existing output file with skeleton', async () => {
        // Given: Output file already exists
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const existingContent = '# 既存の計画書\n## 既存セクション\n既存の内容';
        fs.writeFileSync(path.join(outputDir, 'planning.md'), existingContent, 'utf-8');

        const invalidLog = `Agent execution started.\nNo valid content generated.\nAgent finished.`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), invalidLog, 'utf-8');

        // Mock revise method
        jest.spyOn(testPhase as any, 'getReviseFunction').mockReturnValue(async () => ({
          success: true,
          output: 'planning.md',
        }));

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: Existing content remains
        expect(result.success).toBe(true);
        const savedContent = fs.readFileSync(path.join(outputDir, 'planning.md'), 'utf-8');
        expect(savedContent).toBe(existingContent);
      });

      it('should generate skeleton header based on phase name', () => {
        // Given: Multiple phases
        const phaseTitles: Array<[PhaseName, string]> = [
          ['planning', 'プロジェクト計画書'],
          ['requirements', '要件定義書'],
          ['design', '詳細設計書'],
          ['test_scenario', 'テストシナリオ'],
          ['implementation', '実装ログ'],
          ['test_implementation', 'テスト実装ログ'],
          ['testing', 'テスト実行結果'],
          ['documentation', 'ドキュメント更新ログ'],
          ['report', 'プロジェクトレポート'],
          ['evaluation', '評価レポート'],
        ];

        for (const [phaseName, title] of phaseTitles) {
          const phase = new FlexiblePhase({
            workingDir: testWorkingDir,
            metadataManager: mockMetadata,
            githubClient: mockGitHub,
          }, phaseName);

          // When: Generating skeleton content
          const skeleton = (phase as any).generateSkeletonContent(`${phaseName}.md`);

          // Then: Header matches phase title
          expect(skeleton).toContain(`# ${title}`);
        }
      });

      it('should call revise after skeleton generation', async () => {
        // Given: Invalid log and missing output file
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const invalidLog = `Agent execution started.\nNo valid content generated.\nAgent finished.`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), invalidLog, 'utf-8');

        const reviseSpy = jest.fn(async (feedback: string) => {
          expect(feedback).toContain('planning.md が見つかりません');
          expect(feedback).toContain('エージェントが Write ツールを呼び出していない可能性があります');
          return { success: true, output: 'planning.md' };
        });

        jest.spyOn(testPhase as any, 'getReviseFunction').mockReturnValue(reviseSpy);

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: revise is called and skeleton exists
        expect(result.success).toBe(true);
        expect(reviseSpy).toHaveBeenCalled();
        const savedContent = fs.readFileSync(path.join(outputDir, 'planning.md'), 'utf-8');
        expect(savedContent).toContain('スケルトンファイルです');
      });

      it('should log skeleton generation', async () => {
        // Given: Invalid log and missing output file
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const invalidLog = `Agent execution started.\nNo valid content generated.\nAgent finished.`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), invalidLog, 'utf-8');

        jest.spyOn(testPhase as any, 'getReviseFunction').mockReturnValue(async () => ({
          success: true,
          output: 'planning.md',
        }));

        const infoSpy = jest.spyOn(logger, 'info');

        // When: Handling missing output file
        const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

        // Then: Skeleton log is emitted
        expect(result.success).toBe(true);
        expect(infoSpy).toHaveBeenCalledWith(
          expect.stringContaining('Generated skeleton file for revise fallback')
        );
      });
    });

    describe('Exception handling during log read', () => {
      it('should handle file read exceptions gracefully', async () => {
        // Given: Agent log path exists but reading throws error
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        ensureDirectory(executeDir);
        const agentLogPath = path.join(executeDir, 'agent_log.md');
        fs.writeFileSync(agentLogPath, 'content', 'utf-8');

        // Mock fs.readFileSync to throw an error (cross-platform compatible)
        const normalizedAgentLogPath = path.normalize(agentLogPath);
        const readFileSyncSpy = jest
          .spyOn(fs, 'readFileSync')
          .mockImplementation((filePath: any, ...args: any[]) => {
            const normalizedFilePath = path.normalize(String(filePath));
            if (normalizedFilePath === normalizedAgentLogPath) {
              const error: NodeJS.ErrnoException = new Error('EACCES: permission denied');
              error.code = 'EACCES';
              throw error;
            }
            // Call original implementation for other files
            return jest.requireActual('fs-extra').readFileSync(filePath, ...args);
          });

        try {
          // When: Handling missing output file
          const result = await testPhase.exposeHandleMissingOutputFile('planning.md', executeDir);

          // Then: Error is handled gracefully
          // Note: readFileSync fails → log extraction fails → revise() is attempted → revise() not implemented error
          expect(result.success).toBe(false);
          expect(result.error).toContain('revise() メソッドが実装されていません');
        } finally {
          readFileSyncSpy.mockRestore();
        }
      });
    });
  });

  describe('executePhaseTemplate() - Fallback integration', () => {
    describe('File exists - Normal flow', () => {
      it('should return success when output file exists', async () => {
        // Given: Output file exists
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(outputDir);
        fs.writeFileSync(path.join(outputDir, 'planning.md'), 'content', 'utf-8');

        // Mock executeWithAgent
        jest.spyOn(testPhase as any, 'executeWithAgent').mockResolvedValue([]);

        // ✅ Setup file system mock to prevent prompt file access issues
        setupFileSystemMock();

        // When: Executing phase template with enableFallback
        const result = await testPhase.exposeExecutePhaseTemplate(
          'planning.md',
          { issue_info: 'test' },
          { enableFallback: true }
        );

        // Then: Success is returned without fallback
        expect(result.success).toBe(true);
        expect(result.output).toContain('planning.md');
      });
    });

    describe('File missing & enableFallback=true - Fallback triggered', () => {
      it('should trigger fallback when file is missing and enableFallback is true', async () => {
        // Given: Output file does not exist, agent log has valid content
        const executeDir = path.join(mockMetadata.workflowDir, '00_planning', 'execute');
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(executeDir);
        ensureDirectory(outputDir);

        const validLog = `
# プロジェクト計画書 - Issue #113

## 1. Issue分析
複雑度: 中程度
見積もり工数: 12~16時間

## 2. 実装戦略判断
実装戦略: EXTEND
テスト戦略: UNIT_INTEGRATION

## 3. 影響範囲分析
変更が必要なファイル: src/phases/base-phase.ts
`;
        fs.writeFileSync(path.join(executeDir, 'agent_log.md'), validLog, 'utf-8');

        // Mock executeWithAgent
        jest.spyOn(testPhase as any, 'executeWithAgent').mockResolvedValue([]);

        // ✅ Setup file system mock to prevent prompt file access issues
        setupFileSystemMock();

        // When: Executing phase template with enableFallback
        const result = await testPhase.exposeExecutePhaseTemplate(
          'planning.md',
          { issue_info: 'test' },
          { enableFallback: true, logDir: executeDir }
        );

        // Then: Fallback succeeds and file is created
        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'planning.md'))).toBe(true);
      });
    });

    describe('File missing & enableFallback=false - Error returned', () => {
      it('should return error when file is missing and enableFallback is false', async () => {
        // Given: Output file does not exist, enableFallback is false
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(outputDir);

        // Mock executeWithAgent
        jest.spyOn(testPhase as any, 'executeWithAgent').mockResolvedValue([]);

        // ✅ Setup file system mock to prevent prompt file access issues
        setupFileSystemMock();

        // When: Executing phase template without enableFallback
        const result = await testPhase.exposeExecutePhaseTemplate(
          'planning.md',
          { issue_info: 'test' },
          { enableFallback: false }
        );

        // Then: Error is returned
        expect(result.success).toBe(false);
        expect(result.error).toContain('planning.md が見つかりません');
      });
    });

    describe('File missing & enableFallback not specified - Error returned (default behavior)', () => {
      it('should return error when enableFallback is not specified (default: false)', async () => {
        // Given: Output file does not exist, enableFallback not specified
        const outputDir = path.join(mockMetadata.workflowDir, '00_planning', 'output');
        ensureDirectory(outputDir);

        // Mock executeWithAgent
        jest.spyOn(testPhase as any, 'executeWithAgent').mockResolvedValue([]);

        // ✅ Setup file system mock to prevent prompt file access issues
        setupFileSystemMock();

        // When: Executing phase template without enableFallback option
        const result = await testPhase.exposeExecutePhaseTemplate(
          'planning.md',
          { issue_info: 'test' },
          {}
        );

        // Then: Error is returned (maintains backward compatibility)
        expect(result.success).toBe(false);
        expect(result.error).toContain('planning.md が見つかりません');
      });
    });
  });
});
