import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { JobRepository } from './job.repository';
import type { JobType } from '@excelflow/shared';

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(private readonly repo: JobRepository) {}

  /**
   * Create a job and run the task in background.
   * Returns jobId immediately.
   */
  async createAndRun(
    workbookId: string,
    type: JobType,
    task: (jobId: string, updateProgress: (p: number) => Promise<void>) => Promise<unknown>,
  ): Promise<string> {
    const job = await this.repo.create(workbookId, type);
    this.logger.log(`Job ${job.id} created: ${type} for workbook ${workbookId}`);

    // Run in background (no await)
    this.executeJob(job.id, task).catch((err) => {
      this.logger.error(`Job ${job.id} unhandled error: ${err}`);
    });

    return job.id;
  }

  async getStatus(jobId: string) {
    const job = await this.repo.findById(jobId);
    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      result: job.result,
      error: job.error,
    };
  }

  async cancel(jobId: string): Promise<void> {
    // For prototype: just mark as failed
    await this.repo.fail(jobId, 'Cancelled by user');
  }

  private async executeJob(
    jobId: string,
    task: (jobId: string, updateProgress: (p: number) => Promise<void>) => Promise<unknown>,
  ): Promise<void> {
    await this.repo.updateStatus(jobId, 'running', 0);

    const updateProgress = async (progress: number): Promise<void> => {
      await this.repo.updateStatus(jobId, 'running', Math.min(progress, 99));
    };

    try {
      const result = await task(jobId, updateProgress);
      await this.repo.complete(jobId, result);
      this.logger.log(`Job ${jobId} completed`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await this.repo.fail(jobId, message);
      this.logger.error(`Job ${jobId} failed: ${message}`);
    }
  }
}
