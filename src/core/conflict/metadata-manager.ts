import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { ConflictMetadata, ConflictResolutionStatus } from '../../types/conflict.js';

export class ConflictMetadataManager {
  private readonly metadataPath: string;
  private metadata: ConflictMetadata | null = null;

  constructor(workingDir: string, prNumber: number) {
    this.metadataPath = path.join(
      workingDir,
      '.ai-workflow',
      `conflict-${prNumber}`,
      'metadata.json',
    );
  }

  public async initialize(params: {
    prNumber: number;
    owner: string;
    repo: string;
    mergeable: boolean | null;
    mergeableState?: string;
    conflictFiles: string[];
    baseBranch?: string;
    headBranch?: string;
  }): Promise<ConflictMetadata> {
    const now = new Date().toISOString();
    this.metadata = {
      version: '1.0.0',
      prNumber: params.prNumber,
      repository: { owner: params.owner, repo: params.repo },
      status: 'initialized',
      mergeable: params.mergeable,
      mergeableState: params.mergeableState,
      conflictFiles: params.conflictFiles,
      baseBranch: params.baseBranch,
      headBranch: params.headBranch,
      createdAt: now,
      updatedAt: now,
    };

    await this.save();
    return this.metadata;
  }

  public async load(): Promise<ConflictMetadata> {
    if (this.metadata) {
      return this.metadata;
    }

    const content = await fsp.readFile(this.metadataPath, 'utf-8');
    this.metadata = JSON.parse(content) as ConflictMetadata;
    return this.metadata;
  }

  public async exists(): Promise<boolean> {
    try {
      await fsp.access(this.metadataPath);
      return true;
    } catch {
      return false;
    }
  }

  public async updateStatus(status: ConflictResolutionStatus, fields?: Partial<ConflictMetadata>): Promise<void> {
    await this.ensureLoaded();
    this.metadata = {
      ...this.metadata!,
      ...fields,
      status,
      updatedAt: new Date().toISOString(),
    };
    await this.save();
  }

  public async setResolutionPlan(pathValue: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.resolutionPlanPath = pathValue;
    await this.save();
  }

  public async setResolutionResult(pathValue: string): Promise<void> {
    await this.ensureLoaded();
    this.metadata!.resolutionResultPath = pathValue;
    await this.save();
  }

  public async save(): Promise<void> {
    if (!this.metadata) {
      throw new Error('Metadata not initialized');
    }

    this.metadata.updatedAt = new Date().toISOString();
    const dir = path.dirname(this.metadataPath);
    await fsp.mkdir(dir, { recursive: true });
    await fsp.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2), 'utf-8');
  }

  public getMetadataPath(): string {
    return this.metadataPath;
  }

  public async cleanup(): Promise<void> {
    const dir = path.dirname(this.metadataPath);
    await fsp.rm(dir, { recursive: true, force: true });
  }

  public async getMetadata(): Promise<ConflictMetadata> {
    await this.ensureLoaded();
    return this.metadata!;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.metadata) {
      await this.load();
    }
  }
}
