/** Workbook classification thresholds */
export const CLASSIFICATION_THRESHOLDS = {
  LARGE_CELL_COUNT: 500_000,
  HEAVY_CELL_COUNT: 2_000_000,
  LARGE_FORMULA_COUNT: 100_000,
  HEAVY_FORMULA_COUNT: 200_000,
  LARGE_COLUMN_COUNT: 200,
  LARGE_VOLATILE_COUNT: 50,
  HEAVY_VOLATILE_COUNT: 500,
  HEAVY_CROSS_SHEET_DEPS: 1_000,
  MAX_CELL_COUNT: 10_000_000,
} as const;

/** Upload and file limits */
export const FILE_LIMITS = {
  MAX_UPLOAD_SIZE_BYTES: 50 * 1024 * 1024, // 50MB
  ALLOWED_EXTENSIONS: ['.xlsx', '.csv'] as const,
  ALLOWED_MIME_TYPES: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/csv',
  ] as const,
  FILE_CLEANUP_AGE_HOURS: 24,
  EXPORT_CLEANUP_AGE_HOURS: 1,
} as const;

/** Action engine limits */
export const ACTION_LIMITS = {
  MAX_BATCH_SIZE: 5_000,
  ASYNC_PASTE_THRESHOLD: 50_000,
  HEAVY_PASTE_THRESHOLD: 10_000,
  AI_CONFIRM_THRESHOLD: 1_000,
  AI_ASYNC_THRESHOLD: 10_000,
  REVISION_SNAPSHOT_INTERVAL: 50,
} as const;

/** Sheet dimension limits (Excel-compatible) */
export const SHEET_LIMITS = {
  MAX_ROWS: 1_048_576,
  MAX_COLS: 16_384,
} as const;

/** Performance tuning */
export const PERFORMANCE = {
  CELL_EDIT_DEBOUNCE_MS: 300,
  JOB_POLL_FAST_MS: 1_000,
  JOB_POLL_MEDIUM_MS: 3_000,
  JOB_POLL_SLOW_MS: 5_000,
  JOB_POLL_FAST_DURATION_MS: 10_000,
  JOB_POLL_MEDIUM_DURATION_MS: 30_000,
  CHUNK_SIZE_ROWS: 500,
  AI_SAMPLE_ROWS: 50,
  /** Max total cells (rows × cols) to send full data to AI. 50k cells ≈ 50k tokens — safe for GPT-4o 128k context */
  AI_MAX_CELL_BUDGET: 50_000,
  /** Absolute row cap even if cell budget allows more (prevents absurdly long prompts) */
  AI_MAX_ROW_CAP: 5_000,
} as const;
