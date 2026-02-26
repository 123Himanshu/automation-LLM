import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { api } from '@/lib/api-client';
import { PERFORMANCE } from '@excelflow/shared';

interface TrackedJob {
  id: string;
  status: string;
  progress: number;
  result?: unknown;
  error?: string;
}

interface JobState {
  jobs: Record<string, TrackedJob>;
  trackJob: (jobId: string) => void;
  clearJob: (jobId: string) => void;
}

export const useJobStore = create<JobState>()(
  immer((set, get) => ({
    jobs: {},

    trackJob: (jobId: string): void => {
      set((s) => {
        s.jobs[jobId] = { id: jobId, status: 'pending', progress: 0 };
      });

      const startTime = Date.now();

      const poll = async (): Promise<void> => {
        try {
          const res = await api.getJobStatus(jobId);
          const job = res.data;
          set((s) => {
            s.jobs[jobId] = {
              id: job.id,
              status: job.status,
              progress: job.progress,
              result: job.result,
              error: job.error,
            };
          });

          if (job.status === 'completed' || job.status === 'failed') return;

          const elapsed = Date.now() - startTime;
          let delay: number = PERFORMANCE.JOB_POLL_FAST_MS;
          if (elapsed > PERFORMANCE.JOB_POLL_MEDIUM_DURATION_MS) {
            delay = PERFORMANCE.JOB_POLL_SLOW_MS;
          } else if (elapsed > PERFORMANCE.JOB_POLL_FAST_DURATION_MS) {
            delay = PERFORMANCE.JOB_POLL_MEDIUM_MS;
          }

          setTimeout(poll, delay);
        } catch {
          set((s) => {
            if (s.jobs[jobId]) {
              s.jobs[jobId].status = 'failed';
              s.jobs[jobId].error = 'Polling failed';
            }
          });
        }
      };

      poll();
    },

    clearJob: (jobId: string): void => {
      set((s) => { delete s.jobs[jobId]; });
    },
  })),
);
