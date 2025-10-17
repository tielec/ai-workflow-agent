import fs from 'fs-extra';
import path from 'node:path';
import { MetadataManager } from '../core/metadata-manager.js';
import { PhaseName } from '../types.js';

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

  private getPhasesByStatus(status: 'completed' | 'failed' | 'in_progress' | 'pending'): PhaseName[] {
    const phasesData = this.metadata.data.phases;
    return this.phases.filter((phase) => phasesData[phase].status === status);
  }
}
