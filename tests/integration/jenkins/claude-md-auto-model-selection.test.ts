/**
 * Integration Tests for Issue #379: AUTO_MODEL_SELECTION documentation in CLAUDE.md
 *
 * These tests verify that CLAUDE.md is correctly updated with AUTO_MODEL_SELECTION
 * parameter documentation.
 *
 * Test Strategy: INTEGRATION_ONLY (static validation of documentation)
 *
 * Corresponding Test Scenario:
 * - IT-010: CLAUDE.md contains AUTO_MODEL_SELECTION parameter description
 */

import { describe, expect, it, beforeAll } from '@jest/globals';
import * as fs from 'node:fs';
import path from 'path';

describe('Integration: CLAUDE.md AUTO_MODEL_SELECTION documentation (Issue #379)', () => {
  let claudeMdContent: string;

  beforeAll(async () => {
    // Load CLAUDE.md content
    const projectRoot = path.resolve(import.meta.dirname, '../../..');
    const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
    claudeMdContent = await fs.readFile(claudeMdPath, 'utf-8');
  });

  describe('IT-010: AUTO_MODEL_SELECTION parameter documentation', () => {
    it('should mention AUTO_MODEL_SELECTION parameter in CLAUDE.md', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Search for AUTO_MODEL_SELECTION
      // Then: The parameter should be mentioned
      expect(claudeMdContent).toMatch(/AUTO_MODEL_SELECTION/);
    });

    it('should document the parameter as part of Jenkins integration', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Search for Jenkins context around AUTO_MODEL_SELECTION
      // Then: Should be documented in Jenkins-related section
      // Check that AUTO_MODEL_SELECTION appears near execution settings or Jenkins content
      expect(claudeMdContent).toMatch(/自動モデル選択.*AUTO_MODEL_SELECTION/s);
    });

    it('should document the default value as true', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Search for default value documentation
      // Then: Should indicate default is true
      expect(claudeMdContent).toMatch(
        /AUTO_MODEL_SELECTION.*デフォルト.*true|AUTO_MODEL_SELECTION.*default.*true/i
      );
    });

    it('should document the true setting behavior', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Search for true setting documentation
      // Then: Should explain what happens when set to true
      expect(claudeMdContent).toMatch(
        /true.*難易度分析|難易度分析.*true/s
      );
    });

    it('should document the false setting behavior', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Search for false setting documentation
      // Then: Should explain what happens when set to false
      expect(claudeMdContent).toMatch(/false.*AGENT_MODE|AGENT_MODE.*false/s);
    });

    it('should reference Issue #379', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Search for Issue #379 reference
      // Then: Should mention the issue number
      expect(claudeMdContent).toMatch(/Issue\s*#?379|#379/);
    });
  });

  describe('Documentation completeness', () => {
    it('should have clear parameter description format', () => {
      // Given: CLAUDE.md content is loaded
      expect(claudeMdContent).toBeDefined();

      // When: Look for parameter documentation structure
      // Then: Should have structured documentation
      // Check for common documentation patterns
      const hasParameterName = claudeMdContent.includes('AUTO_MODEL_SELECTION');
      const hasDescription =
        claudeMdContent.includes('自動モデル選択') ||
        claudeMdContent.includes('automatic model selection');

      expect(hasParameterName).toBe(true);
      expect(hasDescription).toBe(true);
    });
  });
});
