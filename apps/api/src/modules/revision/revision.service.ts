import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { RevisionRepository } from './revision.repository';
import type { ActionBatch } from '@excelflow/shared';
import type { Prisma } from '@prisma/client';
import { ACTION_LIMITS } from '@excelflow/shared';

@Injectable()
export class RevisionService {
  private readonly logger = new Logger(RevisionService.name);

  constructor(private readonly repo: RevisionRepository) {}

  async createRevision(
    batch: ActionBatch,
    snapshot?: unknown,
  ): Promise<{ id: string; version: number }> {
    const version = await this.repo.getNextVersion(batch.workbookId);

    // Snapshot every N revisions for fast restore
    const shouldSnapshot = version % ACTION_LIMITS.REVISION_SNAPSHOT_INTERVAL === 0;

    const revision = await this.repo.create({
      workbookId: batch.workbookId,
      version,
      actions: batch.actions as unknown as Prisma.InputJsonValue,
      snapshot: shouldSnapshot ? (snapshot as Prisma.InputJsonValue) : undefined,
      source: batch.source,
      description: batch.metadata?.['description'] as string | undefined,
    });

    this.logger.log(`Created revision v${version} for workbook ${batch.workbookId}`);
    return { id: revision.id, version };
  }

  async getLatest(workbookId: string) {
    const rev = await this.repo.findLatest(workbookId);
    if (!rev) throw new NotFoundException(`No revisions for workbook ${workbookId}`);
    return rev;
  }

  async listRevisions(workbookId: string) {
    return this.repo.findAll(workbookId);
  }

  async getByVersion(workbookId: string, version: number) {
    const rev = await this.repo.findByVersion(workbookId, version);
    if (!rev) throw new NotFoundException(`Revision v${version} not found`);
    return rev;
  }

  async revertToRevision(workbookId: string, revisionId: string) {
    const targetRev = await this.repo.findById(revisionId);
    if (!targetRev || targetRev.workbookId !== workbookId) {
      throw new NotFoundException(`Revision ${revisionId} not found for workbook ${workbookId}`);
    }

    // Create a new revert revision (never delete history)
    const version = await this.repo.getNextVersion(workbookId);
    const revertRevision = await this.repo.create({
      workbookId,
      version,
      actions: targetRev.actions as Prisma.InputJsonValue,
      snapshot: targetRev.snapshot as Prisma.InputJsonValue | undefined,
      source: 'system',
      description: `Reverted to revision v${targetRev.version}`,
    });

    this.logger.log(`Reverted workbook ${workbookId} to v${targetRev.version} as new v${version}`);
    return { id: revertRevision.id, version, revertedTo: targetRev.version };
  }
}
