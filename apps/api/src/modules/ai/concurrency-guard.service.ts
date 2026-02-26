import { Injectable, Logger } from '@nestjs/common';

/** Default lock timeout: 2 minutes. Prevents permanent deadlock if an AI op hangs. */
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Per-workbook mutex for AI operations.
 * Prevents concurrent AI requests from conflicting on the same workbook.
 * Includes a timeout to prevent permanent lock if an operation hangs.
 */
@Injectable()
export class ConcurrencyGuardService {
  private readonly logger = new Logger(ConcurrencyGuardService.name);
  private readonly locks = new Map<string, { promise: Promise<void>; timer: ReturnType<typeof setTimeout> }>();

  /**
   * Acquire a lock for a workbook. Returns a release function.
   * If another AI operation is in progress, waits for it to finish.
   * Lock auto-expires after LOCK_TIMEOUT_MS to prevent deadlocks.
   */
  async acquire(workbookId: string): Promise<() => void> {
    // Wait for any existing lock to release
    while (this.locks.has(workbookId)) {
      this.logger.debug(`Waiting for AI lock on workbook ${workbookId}`);
      await this.locks.get(workbookId)?.promise;
    }

    let releaseFn: () => void;
    const promise = new Promise<void>((resolve) => {
      releaseFn = resolve;
      // Store resolver so forceRelease can unblock waiters on timeout
      this.resolvers.set(workbookId, resolve);
    });

    // Auto-release after timeout to prevent permanent deadlock
    const timer = setTimeout(() => {
      if (this.locks.has(workbookId)) {
        this.logger.warn(
          `AI lock for workbook ${workbookId} timed out after ${LOCK_TIMEOUT_MS / 1000}s — force-releasing`,
        );
        this.forceRelease(workbookId);
      }
    }, LOCK_TIMEOUT_MS);

    this.locks.set(workbookId, { promise, timer });
    this.logger.debug(`AI lock acquired for workbook ${workbookId}`);

    let released = false;
    return () => {
      if (released) return; // Idempotent release
      released = true;
      const entry = this.locks.get(workbookId);
      if (entry) {
        clearTimeout(entry.timer);
        this.locks.delete(workbookId);
      }
      this.resolvers.delete(workbookId);
      releaseFn!();
      this.logger.debug(`AI lock released for workbook ${workbookId}`);
    };
  }

  /** Force-release a lock (used by timeout). Stores resolvers to properly unblock waiters. */
  private readonly resolvers = new Map<string, () => void>();

  private forceRelease(workbookId: string): void {
    const entry = this.locks.get(workbookId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.locks.delete(workbookId);
    // Resolve the promise so any waiters proceed
    const resolver = this.resolvers.get(workbookId);
    if (resolver) {
      resolver();
      this.resolvers.delete(workbookId);
    }
  }

  /** Check if a workbook currently has an AI operation in progress */
  isLocked(workbookId: string): boolean {
    return this.locks.has(workbookId);
  }
}
