import { describe, it, expect } from '@jest/globals';
import {
  PHASE_CHECKLIST_MAP,
  updatePhaseChecklistInPrBody,
  hasWorkflowChecklist,
} from '../../../src/utils/pr-body-checklist-utils.js';

const WORKFLOW_HEADER_JA = '### 🔄 ワークフロー進捗';
const WORKFLOW_HEADER_EN = '### 🔄 Workflow Progress';

// Base checklist fixture mirrors the PR body template used in workflows.
const uncheckedChecklist = [
  '- [ ] Phase 0: Planning',
  '- [ ] Phase 1: Requirements',
  '- [ ] Phase 2: Design',
  '- [ ] Phase 3: Test Scenario',
  '- [ ] Phase 4: Implementation',
  '- [ ] Phase 5: Test Implementation',
  '- [ ] Phase 6: Test Preparation',
  '- [ ] Phase 7: Testing',
  '- [ ] Phase 8: Documentation',
  '- [ ] Phase 9: Report',
  '- [ ] Phase 10: Evaluation',
].join('\n');

const basePrBody = `${WORKFLOW_HEADER_EN}\n\n${uncheckedChecklist}`;

describe('PHASE_CHECKLIST_MAP', () => {
  it('contains all PhaseName values with correct labels', () => {
    const expectedPhases = [
      'planning',
      'requirements',
      'design',
      'test_scenario',
      'implementation',
      'test_implementation',
      'test_preparation',
      'testing',
      'documentation',
      'report',
      'evaluation',
    ];

    expect(Object.keys(PHASE_CHECKLIST_MAP).sort()).toEqual(expectedPhases.sort());
    expect(Object.values(PHASE_CHECKLIST_MAP)).toContain('Phase 0: Planning');
    expect(PHASE_CHECKLIST_MAP.requirements).toBe('Phase 1: Requirements');
    expect(PHASE_CHECKLIST_MAP.report).toBe('Phase 9: Report');
  });
});

describe('updatePhaseChecklistInPrBody', () => {
  // Happy path coverage for each phase plus idempotency and formatting edge cases.
  it.each([
    ['planning', 'Phase 0: Planning'],
    ['requirements', 'Phase 1: Requirements'],
    ['design', 'Phase 2: Design'],
    ['test_scenario', 'Phase 3: Test Scenario'],
    ['implementation', 'Phase 4: Implementation'],
    ['test_implementation', 'Phase 5: Test Implementation'],
    ['test_preparation', 'Phase 6: Test Preparation'],
    ['testing', 'Phase 7: Testing'],
    ['documentation', 'Phase 8: Documentation'],
    ['report', 'Phase 9: Report'],
    ['evaluation', 'Phase 10: Evaluation'],
  ] as const)(
    'marks %s as completed when unchecked',
    (phaseName, displayName) => {
      const updated = updatePhaseChecklistInPrBody(basePrBody, phaseName);

      expect(updated).toContain(`- [x] ${displayName}`);
      expect(updated).not.toContain(`- [ ] ${displayName}`);
    },
  );

  it('does not change already checked items (idempotent)', () => {
    const checkedBody = '- [x] Phase 1: Requirements';
    const updated = updatePhaseChecklistInPrBody(checkedBody, 'requirements');

    expect(updated).toBe(checkedBody);
  });

  it('returns identical result across multiple calls (idempotent)', () => {
    const updatedOnce = updatePhaseChecklistInPrBody(basePrBody, 'requirements');
    const updatedTwice = updatePhaseChecklistInPrBody(updatedOnce, 'requirements');

    expect(updatedTwice).toBe(updatedOnce);
  });

  it('returns empty string when PR body is empty', () => {
    expect(updatePhaseChecklistInPrBody('', 'requirements')).toBe('');
  });

  it('returns original content when checklist is missing', () => {
    const content = 'Some content without checklist';
    expect(updatePhaseChecklistInPrBody(content, 'requirements')).toBe(content);
  });

  it('updates only the targeted phase and preserves others', () => {
    const updated = updatePhaseChecklistInPrBody(basePrBody, 'design');

    expect(updated).toContain('- [x] Phase 2: Design');
    expect(updated).toContain('- [ ] Phase 1: Requirements');
    expect(updated).toContain('- [ ] Phase 8: Report');
  });

  it('preserves non-checklist content in the PR body', () => {
    const prBody = `## AI Workflow PR\n\n${uncheckedChecklist}\n\n### Notes\n- keep this`;
    const updated = updatePhaseChecklistInPrBody(prBody, 'requirements');

    expect(updated).toContain('## AI Workflow PR');
    expect(updated).toContain('### Notes');
    expect(updated).toContain('- keep this');
  });

  it('retains indentation on checklist items', () => {
    const indentedBody = `  - [ ] Phase 1: Requirements\n  - [ ] Phase 2: Design`;
    const updated = updatePhaseChecklistInPrBody(indentedBody, 'requirements');

    expect(updated).toContain('  - [x] Phase 1: Requirements');
    expect(updated).toContain('  - [ ] Phase 2: Design');
  });

  it('supports Japanese PR body templates', () => {
    const japaneseBody = `${WORKFLOW_HEADER_JA}\n\n${uncheckedChecklist}`;
    const updated = updatePhaseChecklistInPrBody(japaneseBody, 'requirements');

    expect(updated).toContain('- [x] Phase 1: Requirements');
  });

  it('supports English PR body templates', () => {
    const englishBody = `${WORKFLOW_HEADER_EN}\n\n${uncheckedChecklist}`;
    const updated = updatePhaseChecklistInPrBody(englishBody, 'requirements');

    expect(updated).toContain('- [x] Phase 1: Requirements');
  });
});

describe('hasWorkflowChecklist', () => {
  // Header detection drives whether checklist updates run.
  it('detects Japanese workflow header', () => {
    expect(hasWorkflowChecklist(`${WORKFLOW_HEADER_JA}\n${uncheckedChecklist}`)).toBe(true);
  });

  it('detects English workflow header', () => {
    expect(hasWorkflowChecklist(`${WORKFLOW_HEADER_EN}\n${uncheckedChecklist}`)).toBe(true);
  });

  it('returns false when header is missing', () => {
    expect(hasWorkflowChecklist('Plain text without checklist')).toBe(false);
  });

  it('returns false for empty PR body', () => {
    expect(hasWorkflowChecklist('')).toBe(false);
  });
});
