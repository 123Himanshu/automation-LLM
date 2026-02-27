import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { S3Service } from '../../common/services/s3.service';
import { FILE_LIMITS } from '@excelflow/shared';

@Injectable()
export class CleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CleanupService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /** How often to run cleanup (every 30 minutes) */
  private static readonly CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

  constructor(private readonly s3: S3Service) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      this.runCleanup().catch((err: unknown) => {
        this.logger.error(`Cleanup failed: ${err}`);
      });
    }, CleanupService.CLEANUP_INTERVAL_MS);

    this.logger.log('S3 cleanup scheduler started (every 30 minutes)');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Run cleanup for orphaned S3 objects.
   * Deletes export objects older than EXPORT_CLEANUP_AGE_HOURS.
   *
   * Note: For production, prefer S3 Lifecycle Rules to auto-expire objects
   * under the `exports/` prefix. This method serves as a fallback for
   * S3-compatible stores that don't support lifecycle policies (MinIO, LocalStack).
   */
  async runCleanup(): Promise<{ exports: number }> {
    const exportKeys = await this.s3.listByPrefix('exports/');
    if (exportKeys.length === 0) {
      return { exports: 0 };
    }

    const maxAgeMs = FILE_LIMITS.EXPORT_CLEANUP_AGE_HOURS * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - maxAgeMs);
    let deleted = 0;

    // Filter by age: only delete objects older than the cutoff.
    // S3 listByPrefix returns keys — we check LastModified via headObject.
    // For efficiency, batch-delete keys that are clearly old.
    // If the S3Service doesn't expose metadata, fall back to deleting
    // everything when count exceeds threshold (original behavior).
    try {
      deleted = await this.s3.deleteByAge('exports/', cutoff);
      if (deleted > 0) {
        this.logger.log(`Cleanup: removed ${deleted} expired export objects from S3`);
      }
    } catch {
      // Fallback: deleteByAge not available — use count-based cleanup
      if (exportKeys.length > 100) {
        deleted = await this.s3.deleteByPrefix('exports/');
        this.logger.log(`Cleanup (fallback): removed ${deleted} export objects from S3`);
      }
    }

    return { exports: deleted };
  }
}
