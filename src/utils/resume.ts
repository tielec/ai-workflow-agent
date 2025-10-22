import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../core/metadata-manager.js';
import { PhaseName, StepName } from '../types.js';

export class ResumeManager {
  private readonly metadata: MetadataManager;
  private readonly phases: PhaseName[] = [
    'planning',
    'requirements',
    'design',
    'test_scenario',
    'implementation',
    'test_implementation',
    'testing',
    'documentation',
    'report',
    'evaluation',
  ];

  constructor(metadataManager: MetadataManager) {
    this.metadata = metadataManager;
  }

  public canResume(): boolean {
    if (!fs.existsSync(this.metadata.metadataPath)) {
      return false;
    }

    if (this.isCompleted()) {
      return false;
    }

    const phasesData = this.metadata.data.phases;
    return this.phases.some((phase) => {
      const status = phasesData[phase].status;
      return status === 'completed' || status === 'failed' || status === 'in_progress';
    });
  }

  public isCompleted(): boolean {
    const phasesData = this.metadata.data.phases;
    return this.phases.every((phase) => phasesData[phase].status === 'completed');
  }

  public getResumePhase(): PhaseName | null {
    if (this.isCompleted()) {
      return null;
    }

    const phasesData = this.metadata.data.phases;

    for (const phase of this.phases) {
      if (phasesData[phase].status === 'failed') {
        return phase;
      }
    }

    for (const phase of this.phases) {
      if (phasesData[phase].status === 'in_progress') {
        return phase;
      }
    }

    for (const phase of this.phases) {
      if (phasesData[phase].status === 'pending') {
        return phase;
      }
    }

    return null;
  }

  public getStatusSummary(): Record<string, PhaseName[]> {
    return {
      completed: this.getPhasesByStatus('completed'),
      failed: this.getPhasesByStatus('failed'),
      in_progress: this.getPhasesByStatus('in_progress'),
      pending: this.getPhasesByStatus('pending'),
    };
  }

  public reset(): void {
    this.metadata.clear();
  }

  /**
   * Issue #10: ステップ単位でのレジューム判定
   */
  public getResumeStep(phaseName: PhaseName): {
    shouldResume: boolean;
    resumeStep: StepName | null;
    completedSteps: StepName[];
  } {
    const phaseMetadata = this.metadata.data.phases[phaseName];

    if (!phaseMetadata || phaseMetadata.status === 'pending') {
      return { shouldResume: false, resumeStep: null, completedSteps: [] };
    }

    if (phaseMetadata.status === 'completed') {
      return {
        shouldResume: false,
        resumeStep: null,
        completedSteps: phaseMetadata.completed_steps ?? [],
      };
    }

    // in_progress または failed
    const completedSteps = phaseMetadata.completed_steps ?? [];
    const currentStep = phaseMetadata.current_step ?? null;

    // current_stepが設定されている場合はそこから再開
    if (currentStep) {
      return {
        shouldResume: true,
        resumeStep: currentStep,
        completedSteps,
      };
    }

    // current_stepがnullの場合、次のステップを判定
    const nextStep = this.getNextStep(completedSteps);
    return {
      shouldResume: true,
      resumeStep: nextStep,
      completedSteps,
    };
  }

  /**
   * Issue #10: 次に実行すべきステップを判定
   */
  private getNextStep(completedSteps: StepName[]): StepName {
    if (!completedSteps.includes('execute')) {
      return 'execute';
    }
    if (!completedSteps.includes('review')) {
      return 'review';
    }
    if (!completedSteps.includes('revise')) {
      return 'revise';
    }
    // すべて完了している場合のフォールバック
    return 'execute';
  }

  private getPhasesByStatus(status: 'completed' | 'failed' | 'in_progress' | 'pending'): PhaseName[] {
    const phasesData = this.metadata.data.phases;
    return this.phases.filter((phase) => phasesData[phase].status === status);
  }
}
