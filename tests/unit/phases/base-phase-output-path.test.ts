import { describe, expect, test } from '@jest/globals';
import path from 'node:path';
import { BasePhase } from '../../../src/phases/base-phase.js';

function injectOutput(prompt: string, outputPath: string): string {
  const phase = Object.create(BasePhase.prototype);
  return (phase as any).injectOutputPathInstruction(prompt, outputPath);
}

describe('BasePhase output path injection (Issue #603)', () => {
  test('TC-U-603-020: execute prompt includes absolute output path block', () => {
    const repoPath = '/tmp/ai-workflow-repos/sd-platform-development';
    const outputPath = path.join(
      repoPath,
      '.ai-workflow',
      'issue-236',
      '01_requirements',
      'output',
      'requirements.md'
    );
    const prompt = '# Execute\nWrite the requirements.';

    const injected = injectOutput(prompt, outputPath);

    expect(injected).toContain('**IMPORTANT: Output File Path**');
    expect(injected).toContain(outputPath);
    expect(injected).toContain('Write tool');
    // Instruction is placed immediately after the first heading
    const lines = injected.split('\n');
    expect(lines[0]).toBe('# Execute');
    expect(lines[2]).toContain('Output File Path');
  });

  test('TC-U-603-021: prompt warns against relative and /workspace paths', () => {
    const injected = injectOutput('# Execute\ncontent', '/tmp/repo/.ai-workflow/issue-1/output/file.md');

    expect(injected).toContain('Do NOT use relative paths');
    expect(injected).toContain('/workspace');
  });

  test('TC-U-603-022: injection supports multiple phases and paths', () => {
    const phases = [
      {
        name: 'requirements',
        path: '/tmp/repo/.ai-workflow/issue-1/01_requirements/output/requirements.md',
      },
      {
        name: 'design',
        path: '/tmp/repo/.ai-workflow/issue-1/02_design/output/design.md',
      },
      {
        name: 'test_scenario',
        path: '/tmp/repo/.ai-workflow/issue-1/03_test_scenario/output/test-scenario.md',
      },
    ];

    phases.forEach(({ name, path: outputPath }) => {
      const prompt = `# ${name}\nDetails`;
      const injected = injectOutput(prompt, outputPath);

      expect(injected).toContain(outputPath);
      expect(injected).toContain('Output File Path');
      expect(injected.startsWith(`# ${name}`)).toBe(true);
    });
  });
});
