/**
 * Integration Tests for Issue #379: AUTO_MODEL_SELECTION in Jenkinsfiles
 *
 * These tests verify that the AUTO_MODEL_SELECTION parameter, environment variable,
 * and init command modifications are correctly implemented across all 5 Jenkinsfiles.
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of Jenkinsfile contents)
 *
 * Corresponding Test Scenarios:
 * - IT-002: AUTO_MODEL_SELECTION parameter is correctly defined in all 5 Jenkinsfiles
 * - IT-003: AUTO_MODEL_SELECTION environment variable is correctly set in all 5 Jenkinsfiles
 * - IT-004: autoModelSelectionFlag is correctly generated in Initialize Workflow stage
 * - IT-011: Comment headers are updated in each Jenkinsfile
 */

import { describe, expect, it, beforeAll } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';

// Jenkinsfile paths relative to project root
const JENKINSFILE_PATHS = [
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/rollback/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/finalize/Jenkinsfile',
] as const;

// Jenkinsfiles that use init command and need autoModelSelectionFlag
const JENKINSFILES_WITH_INIT = [
  'jenkins/jobs/pipeline/ai-workflow/all-phases/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/preset/Jenkinsfile',
  'jenkins/jobs/pipeline/ai-workflow/single-phase/Jenkinsfile',
] as const;

// Expected patterns for validation
const EXPECTED_PATTERNS = {
  // IT-003: Environment variable definition pattern
  environmentVariable:
    /AUTO_MODEL_SELECTION\s*=\s*"\$\{params\.AUTO_MODEL_SELECTION\s*\?:\s*'true'\}"/,

  // IT-004: autoModelSelectionFlag generation pattern
  autoModelSelectionFlag:
    /def\s+autoModelSelectionFlag\s*=\s*env\.AUTO_MODEL_SELECTION\s*==\s*'true'\s*\?\s*'--auto-model-selection'\s*:\s*''/,

  // IT-004: init command includes autoModelSelectionFlag
  initCommandWithFlag: /node\s+dist\/index\.js\s+init[\s\S]*?\$\{autoModelSelectionFlag\}/,

  // IT-011: Comment header includes AUTO_MODEL_SELECTION
  commentHeader: /AUTO_MODEL_SELECTION.*自動モデル選択/,

  // Validate Parameters stage logs AUTO_MODEL_SELECTION
  validateParametersLog:
    /echo\s+"Auto Model Selection:\s*\$\{params\.AUTO_MODEL_SELECTION\s*\?:\s*true\}"/,
};

describe('Integration: Jenkinsfile AUTO_MODEL_SELECTION implementation (Issue #379)', () => {
  // Store loaded Jenkinsfile contents
  const jenkinsfileContents: Map<string, string> = new Map();

  beforeAll(async () => {
    // Load all Jenkinsfiles
    const projectRoot = path.resolve(
      import.meta.dirname,
      '../../..'
    );

    for (const relativePath of JENKINSFILE_PATHS) {
      const fullPath = path.join(projectRoot, relativePath);
      const content = await fs.readFile(fullPath, 'utf-8');
      jenkinsfileContents.set(relativePath, content);
    }
  });

  describe('IT-002: AUTO_MODEL_SELECTION parameter definition', () => {
    it.each(JENKINSFILE_PATHS)(
      'should have AUTO_MODEL_SELECTION mentioned in comment header: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for AUTO_MODEL_SELECTION in comment header
        // Then: The parameter should be documented in the comment header
        expect(content).toMatch(/AUTO_MODEL_SELECTION/);
      }
    );
  });

  describe('IT-003: AUTO_MODEL_SELECTION environment variable definition', () => {
    it.each(JENKINSFILE_PATHS)(
      'should define AUTO_MODEL_SELECTION environment variable with correct default: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for environment variable definition
        // Then: AUTO_MODEL_SELECTION should be defined with default 'true'
        expect(content).toMatch(EXPECTED_PATTERNS.environmentVariable);
      }
    );

    it.each(JENKINSFILE_PATHS)(
      'should have environment section comment for auto model selection: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for comment explaining the setting
        // Then: Should have a comment about auto model selection
        expect(content).toMatch(/\/\/\s*自動モデル選択設定/);
      }
    );
  });

  describe('IT-004: autoModelSelectionFlag generation and usage', () => {
    it.each(JENKINSFILES_WITH_INIT)(
      'should define autoModelSelectionFlag variable in Initialize Workflow stage: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for autoModelSelectionFlag definition
        // Then: Variable should be defined with correct conditional logic
        expect(content).toMatch(EXPECTED_PATTERNS.autoModelSelectionFlag);
      }
    );

    it.each(JENKINSFILES_WITH_INIT)(
      'should include autoModelSelectionFlag in init command: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for init command with flag
        // Then: Init command should include ${autoModelSelectionFlag}
        expect(content).toMatch(EXPECTED_PATTERNS.initCommandWithFlag);
      }
    );
  });

  describe('IT-011: Comment header updates', () => {
    it.each(JENKINSFILE_PATHS)(
      'should have AUTO_MODEL_SELECTION documented in comment header: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for comment header documentation
        // Then: Comment should include AUTO_MODEL_SELECTION description
        expect(content).toMatch(EXPECTED_PATTERNS.commentHeader);
      }
    );
  });

  describe('Validate Parameters stage logging', () => {
    it.each(JENKINSFILE_PATHS)(
      'should log AUTO_MODEL_SELECTION value in Validate Parameters stage: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for logging in Validate Parameters stage
        // Then: Should echo the AUTO_MODEL_SELECTION value
        expect(content).toMatch(EXPECTED_PATTERNS.validateParametersLog);
      }
    );
  });

  describe('Consistency across all Jenkinsfiles', () => {
    it('should have consistent AUTO_MODEL_SELECTION implementation in all 5 files', () => {
      // Given: All Jenkinsfile contents are loaded
      expect(jenkinsfileContents.size).toBe(5);

      // When: Check all files for required patterns
      const results = JENKINSFILE_PATHS.map((filePath) => {
        const content = jenkinsfileContents.get(filePath)!;
        const hasInitCommand = JENKINSFILES_WITH_INIT.includes(filePath as any);
        return {
          file: filePath,
          hasEnvVar: EXPECTED_PATTERNS.environmentVariable.test(content),
          hasFlag: EXPECTED_PATTERNS.autoModelSelectionFlag.test(content),
          hasInitCommand: EXPECTED_PATTERNS.initCommandWithFlag.test(content),
          hasComment: EXPECTED_PATTERNS.commentHeader.test(content),
          requiresInit: hasInitCommand,
        };
      });

      // Then: All files should have env var and comment, but only init-using files need flag and init command
      for (const result of results) {
        expect(result.hasEnvVar).toBe(true);
        expect(result.hasComment).toBe(true);

        // Only check flag and init command for files that use init
        if (result.requiresInit) {
          expect(result.hasFlag).toBe(true);
          expect(result.hasInitCommand).toBe(true);
        }
      }
    });

    it('should use identical environment variable definition across all files', () => {
      // Given: All Jenkinsfile contents are loaded
      const envVarPattern =
        /AUTO_MODEL_SELECTION\s*=\s*"\$\{params\.AUTO_MODEL_SELECTION\s*\?:\s*'true'\}"/g;

      // When: Extract environment variable definitions from all files
      const definitions = JENKINSFILE_PATHS.map((filePath) => {
        const content = jenkinsfileContents.get(filePath)!;
        const match = content.match(envVarPattern);
        return { file: filePath, match: match?.[0] };
      });

      // Then: All definitions should be identical
      const uniqueDefinitions = new Set(definitions.map((d) => d.match));
      expect(uniqueDefinitions.size).toBe(1);
    });
  });

  describe('Default value correctness', () => {
    it.each(JENKINSFILE_PATHS)(
      'should default AUTO_MODEL_SELECTION to true: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for default value in environment section
        // Then: Default should be 'true'
        expect(content).toMatch(/params\.AUTO_MODEL_SELECTION\s*\?:\s*'true'/);
      }
    );

    it.each(JENKINSFILES_WITH_INIT)(
      'should generate --auto-model-selection flag only when AUTO_MODEL_SELECTION is true: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for conditional flag generation
        // Then: Flag should only be added when env.AUTO_MODEL_SELECTION == 'true'
        expect(content).toMatch(
          /env\.AUTO_MODEL_SELECTION\s*==\s*'true'\s*\?\s*'--auto-model-selection'\s*:\s*''/
        );
      }
    );
  });

  describe('Backward compatibility', () => {
    it.each(JENKINSFILE_PATHS)(
      'should not break existing pipeline structure: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for existing pipeline elements
        // Then: Core pipeline structure should be intact
        expect(content).toMatch(/pipeline\s*\{/);
        expect(content).toMatch(/stages\s*\{/);
        expect(content).toMatch(/stage\('Initialize Workflow'\)/);
        expect(content).toMatch(/environment\s*\{/);
      }
    );

    it.each(JENKINSFILE_PATHS)(
      'should preserve existing AGENT_MODE parameter references: %s',
      (jenkinsfilePath) => {
        // Given: Jenkinsfile content is loaded
        const content = jenkinsfileContents.get(jenkinsfilePath);
        expect(content).toBeDefined();

        // When: Check for AGENT_MODE parameter
        // Then: AGENT_MODE should still be referenced (not removed)
        expect(content).toMatch(/AGENT_MODE/);
      }
    );
  });
});
