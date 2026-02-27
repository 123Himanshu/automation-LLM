/** Job status lifecycle */
export const JOB_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Job type identifiers */
export const JOB_TYPES = [
  'export_xlsx',
  'export_pdf',
  'sort',
  'paste',
  'ai_operation',
  'summary',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Job record */
export interface Job {
  id: string;
  workbookId: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  result?: { downloadUrl?: string; message?: string };
  error?: string;
  createdAt: string;
  updatedAt: string;
}
