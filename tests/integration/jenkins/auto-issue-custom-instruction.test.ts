/**
 * Integration tests for Issue #435: auto-issue Jenkins custom instruction handling
 *
 * Strategy: INTEGRATION_ONLY (static validation of Jenkinsfile contents)
 * Scenarios: INT001-INT006, BDD001-BDD006 focus on CUSTOM_INSTRUCTION parameter propagation.
 */

import { beforeAll, describe, expect, it } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import { InstructionValidator } from '../../../src/core/safety/instruction-validator.js';

const projectRoot = path.resolve(import.meta.dirname, '../../..');
const autoIssueJenkinsfilePath = path.join(
  projectRoot,
  'jenkins/jobs/pipeline/ai-workflow/auto-issue/Jenkinsfile'
);

describe('Integration: auto-issue Jenkins Custom Instruction support (Issue #435)', () => {
  let jenkinsfileContent: string;

  beforeAll(async () => {
    jenkinsfileContent = await fs.readFile(autoIssueJenkinsfilePath, 'utf-8');
  });

  it('documents the CUSTOM_INSTRUCTION parameter in the header comments', () => {
    expect(jenkinsfileContent).toMatch(/CUSTOM_INSTRUCTION:\s*カスタム指示/);
  });

  it('logs the custom instruction value during parameter validation', () => {
    const validateStagePattern = /stage\('Validate Parameters'\)[\s\S]*?echo "Custom Instruction: \${params\.CUSTOM_INSTRUCTION \?: '\(none\)'}"/;
    expect(jenkinsfileContent).toMatch(validateStagePattern);
  });

  it('logs the custom instruction again during execution for visibility', () => {
    const executeLogPattern = /stage\('Execute Auto Issue'\)[\s\S]*?echo "Custom Instruction: \${params\.CUSTOM_INSTRUCTION \?: '\(none\)'}"/;
    expect(jenkinsfileContent).toMatch(executeLogPattern);
  });

  it('builds a customInstructionFlag and passes it to the auto-issue command', () => {
    const definitionPattern = /def\s+customInstructionFlag\s*=\s*params\.CUSTOM_INSTRUCTION\s*\?\s*"--custom-instruction/;
    expect(jenkinsfileContent).toMatch(definitionPattern);

    const executeCommandPattern = /stage\('Execute Auto Issue'\)[\s\S]*?sh """[\s\S]*\$\{customInstructionFlag\}/;
    expect(jenkinsfileContent).toMatch(executeCommandPattern);
  });

  describe('INT004-INT006 / BDD001-BDD006 coverage', () => {
    it('quotes the custom instruction flag to minimize shell injection risk', () => {
      const definitionMatch = jenkinsfileContent.match(
        /def\s+customInstructionFlag\s*=\s*params\.CUSTOM_INSTRUCTION\s*\?[^\n]+:\s*''/,
      );
      expect(definitionMatch).not.toBeNull();

      const definitionLine = definitionMatch?.[0] ?? '';
      expect(definitionLine).toContain('--custom-instruction \\"${params.CUSTOM_INSTRUCTION}\\"');
      expect(definitionLine).toContain(': \'\'');
    });

    it('applies every required CLI option line when executing auto-issue (category/limit/similarity/agent/output/dry-run)', () => {
      const commandBodyMatch = jenkinsfileContent.match(/sh """([\s\S]*?)"""/);
      expect(commandBodyMatch).not.toBeNull();

      const commandBody = commandBodyMatch?.[1] ?? '';

      ['--category ${category}', '--limit ${limit}', '--similarity-threshold ${similarityThreshold}']
        .forEach((fragment) => expect(commandBody).toContain(fragment));

      expect(commandBody).toContain('--agent ${params.AGENT_MODE ?: \'auto\'}');
      expect(commandBody).toContain('--output-file ${outputFile}');
      expect(commandBody).toContain('${customInstructionFlag}');
      expect(commandBody).toContain('${dryRunFlag}');
      expect(commandBody).toMatch(/\$\{customInstructionFlag\}[\s\\]+\$\{dryRunFlag\}/);
    });

    it('documents the 500文字 limit for CUSTOM_INSTRUCTION so users understand the boundary', () => {
      expect(jenkinsfileContent).toMatch(/CUSTOM_INSTRUCTION:.*最大500文字/);
    });

    it('relies on InstructionValidator to reject instructions longer than 500 characters', () => {
      const result = InstructionValidator.validate('a'.repeat(501));
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('500 characters');
    });
  });
});
