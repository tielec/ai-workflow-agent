import { PhaseName } from '../types.js';

/**
 * Mapping between internal phase names and PR checklist display labels.
 */
export const PHASE_CHECKLIST_MAP: Record<PhaseName, string> = {
  planning: 'Phase 0: Planning',
  requirements: 'Phase 1: Requirements',
  design: 'Phase 2: Design',
  test_scenario: 'Phase 3: Test Scenario',
  implementation: 'Phase 4: Implementation',
  test_implementation: 'Phase 5: Test Implementation',
  testing: 'Phase 6: Testing',
  documentation: 'Phase 7: Documentation',
  report: 'Phase 8: Report',
  evaluation: 'Phase 9: Evaluation',
};

/**
 * Update workflow checklist in the PR body by marking the given phase as completed.
 *
 * This function is pure: it does not mutate the input string.
 */
export function updatePhaseChecklistInPrBody(prBody: string, phaseName: PhaseName): string {
  const phaseDisplayName = PHASE_CHECKLIST_MAP[phaseName];
  if (!phaseDisplayName) {
    return prBody;
  }

  // Escape special characters to avoid regex injection and match the exact checklist line.
  const escapedPhaseDisplayName = phaseDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^(\\s*)- \\[ \\] ${escapedPhaseDisplayName}`, 'gm');
  const replacement = `$1- [x] ${phaseDisplayName}`;

  return prBody.replace(pattern, replacement);
}

/**
 * Detect whether the PR body contains the workflow checklist section.
 */
export function hasWorkflowChecklist(prBody: string): boolean {
  return prBody.includes('ワークフロー進捗') || prBody.includes('Workflow Progress');
}
