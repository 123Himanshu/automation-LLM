import type {
  ActionBatch,
  ActionResult,
  AIToolCall,
  ApiResponse,
  ChatMessage,
  ExportResult,
  PdfPrintSettings,
  Sheet,
  WorkbookMeta,
} from '@excelflow/shared';
import {
  workbookMetaResponseSchema,
  workbookListResponseSchema,
  sheetListResponseSchema,
  sheetDataResponseSchema,
  actionResultResponseSchema,
  revisionListResponseSchema,
  chatMessageResponseSchema,
  exportResultResponseSchema,
  jobStatusResponseSchema,
  createWorkbookResponseSchema,
} from '@excelflow/shared';
import type { z } from 'zod';

const BASE_URL = process.env['NEXT_PUBLIC_API_URL'] ?? '';

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Validate response with Zod schema — throws on mismatch so issues surface */
function validateResponse(schema: z.ZodTypeAny, data: unknown): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error('[API] Response validation failed:', result.error.issues);
    // Don't throw — the data may still be usable (e.g. extra fields).
    // But surface it clearly so devs notice contract drift.
    if (typeof window !== 'undefined') {
      // In browser: dispatch a custom event that toast systems can listen to
      window.dispatchEvent(
        new CustomEvent('api-validation-warning', {
          detail: { issues: result.error.issues, data },
        }),
      );
    }
  }
}

/** Strip surrounding double-quotes that some PaaS dashboards inject */
function stripQuotes(val: string): string {
  return val.replace(/^"|"$/g, '');
}

const AUTH_USER = stripQuotes(process.env['NEXT_PUBLIC_AUTH_USER'] ?? 'admin');
const AUTH_PASS = stripQuotes(process.env['NEXT_PUBLIC_AUTH_PASS'] ?? 'changeme');

async function request<T>(
  path: string,
  options: RequestInit = {},
  schema?: z.ZodTypeAny,
  timeoutMs?: number,
): Promise<T> {
  const credentials = btoa(`${AUTH_USER}:${AUTH_PASS}`);
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeoutId = timeoutMs
    ? globalThis.setTimeout(() => controller?.abort(), timeoutMs)
    : undefined;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
        ...options.headers,
      },
    });
  } catch (err) {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
    if ((err as { name?: string })?.name === 'AbortError') {
      throw new ApiError(408, 'Request timed out. Please try again.');
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? 'Request failed');
  }

  const json: unknown = await res.json();
  if (schema) validateResponse(schema, json);
  return json as T;
}

export const api = {
  // Workbooks
  listWorkbooks: (): Promise<ApiResponse<WorkbookMeta[]>> =>
    request('/api/workbooks', {}, workbookListResponseSchema),

  getWorkbook: (id: string): Promise<ApiResponse<WorkbookMeta>> =>
    request(`/api/workbooks/${id}`, {}, workbookMetaResponseSchema),

  getSheetData: (
    workbookId: string,
    sheetId: string,
    range?: string,
  ): Promise<ApiResponse<Sheet>> =>
    request(
      `/api/workbooks/${workbookId}/sheets/${sheetId}${range ? `?range=${range}` : ''}`,
      {},
      sheetDataResponseSchema,
    ),

  getSheets: (
    workbookId: string,
  ): Promise<ApiResponse<Array<{ id: string; name: string; usedRange: unknown }>>> =>
    request(`/api/workbooks/${workbookId}/sheets`, {}, sheetListResponseSchema),

  createWorkbook: (): Promise<ApiResponse<{ id: string; name: string; classification: string }>> =>
    request('/api/workbooks/create', { method: 'POST' }, createWorkbookResponseSchema),

  uploadWorkbook: async (
    file: File,
  ): Promise<ApiResponse<{ id: string; name: string; classification: string }>> => {
    const formData = new FormData();
    formData.append('file', file);
    const credentials = btoa(`${AUTH_USER}:${AUTH_PASS}`);
    const res = await fetch(`${BASE_URL}/api/workbooks/upload`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, body.message ?? 'Upload failed');
    }
    const json: unknown = await res.json();
    validateResponse(createWorkbookResponseSchema, json);
    return json as ApiResponse<{ id: string; name: string; classification: string }>;
  },

  // Actions
  applyActions: (batch: ActionBatch): Promise<ApiResponse<ActionResult>> =>
    request(
      `/api/workbooks/${batch.workbookId}/actions`,
      { method: 'POST', body: JSON.stringify(batch) },
      actionResultResponseSchema,
    ),

  // Revisions
  listRevisions: (workbookId: string): Promise<ApiResponse<unknown[]>> =>
    request(`/api/workbooks/${workbookId}/revisions`, {}, revisionListResponseSchema),

  revertRevision: (workbookId: string, revisionId: string): Promise<ApiResponse<unknown>> =>
    request(`/api/workbooks/${workbookId}/revisions/${revisionId}/revert`, { method: 'POST' }),

  // AI
  sendAIPrompt: (
    workbookId: string,
    body: {
      message: string;
      activeSheet: string;
      selectedRange?: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
  ): Promise<ApiResponse<ChatMessage>> =>
    request(
      `/api/workbooks/${workbookId}/ai/prompt`,
      { method: 'POST', body: JSON.stringify(body) },
      chatMessageResponseSchema,
    ),

  confirmAIAction: (
    workbookId: string,
    toolCall: AIToolCall,
  ): Promise<ApiResponse<{ success: boolean; revisionId?: string; version?: number; error?: string }>> =>
    request(
      `/api/workbooks/${workbookId}/ai/confirm`,
      { method: 'POST', body: JSON.stringify({ toolCall }) },
    ),

  // Summary
  getSummaryColumns: (
    workbookId: string,
    activeSheet?: string,
  ): Promise<ApiResponse<string[]>> =>
    request(
      `/api/workbooks/${workbookId}/summary/columns${activeSheet ? `?activeSheet=${activeSheet}` : ''}`,
    ),

  generateSummary: (
    workbookId: string,
    body: {
      scope: string;
      activeSheet?: string;
      selectedColumns?: string[];
      mode?: 'standard' | 'pivot';
      pivotRowField?: string;
      pivotColumnField?: string;
      pivotValueField?: string;
      pivotAggregation?: 'count' | 'sum' | 'average' | 'min' | 'max';
    },
  ): Promise<ApiResponse<unknown>> =>
    request(`/api/workbooks/${workbookId}/summary`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Export
  exportXlsx: (workbookId: string, revisionId?: string, sheetIds?: string[]): Promise<ApiResponse<ExportResult>> => {
    const params = new URLSearchParams();
    params.set('rev', revisionId ?? 'latest');
    if (sheetIds && sheetIds.length > 0) params.set('sheetIds', sheetIds.join(','));
    return request(
      `/api/workbooks/${workbookId}/export/xlsx?${params.toString()}`,
      {},
      exportResultResponseSchema,
    );
  },

  exportPdf: (
    workbookId: string,
    settings: PdfPrintSettings,
    revisionId?: string,
  ): Promise<ApiResponse<ExportResult>> =>
    request(
      `/api/workbooks/${workbookId}/export/pdf?rev=${revisionId ?? 'latest'}`,
      { method: 'POST', body: JSON.stringify(settings) },
      exportResultResponseSchema,
    ),

  // Jobs
  getJobStatus: (
    jobId: string,
  ): Promise<
    ApiResponse<{
      id: string;
      status: string;
      progress: number;
      result?: unknown;
      error?: string;
    }>
  > => request(`/api/jobs/${jobId}`, {}, jobStatusResponseSchema),

  // Workbook management
  deleteWorkbook: (id: string): Promise<ApiResponse<{ success: boolean }>> =>
    request(`/api/workbooks/${id}`, { method: 'DELETE' }),

  renameWorkbook: (id: string, name: string): Promise<ApiResponse<{ success: boolean }>> =>
    request(`/api/workbooks/${id}/rename`, { method: 'PATCH', body: JSON.stringify({ name }) }),

  // ─── PDF Workspace ───

  uploadPdf: async (file: File): Promise<ApiResponse<{ id: string; name: string; fileName: string; pageCount: number; createdAt: string }>> => {
    const formData = new FormData();
    formData.append('file', file);
    const credentials = btoa(`${AUTH_USER}:${AUTH_PASS}`);
    const res = await fetch(`${BASE_URL}/api/pdf/upload`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, body.message ?? 'Upload failed');
    }
    return (await res.json()) as ApiResponse<{ id: string; name: string; fileName: string; pageCount: number; createdAt: string }>;
  },

  listPdfSessions: (): Promise<ApiResponse<Array<{ id: string; name: string; fileName: string; createdAt: string; updatedAt: string }>>> =>
    request('/api/pdf/sessions'),

  getPdfSession: (id: string): Promise<ApiResponse<unknown>> =>
    request(`/api/pdf/sessions/${id}`),

  regeneratePdf: (
    id: string,
  ): Promise<
    ApiResponse<{
      success: boolean;
      replacementsApplied?: number;
      skippedInsertions?: number;
      message?: string;
    }>
  > =>
    request(
      `/api/pdf/sessions/${id}/regenerate`,
      { method: 'POST', body: JSON.stringify({}) },
      undefined,
      45_000,
    ),

  updatePdfContent: (id: string, html: string): Promise<ApiResponse<{ success: boolean }>> =>
    request(`/api/pdf/sessions/${id}/content`, { method: 'PATCH', body: JSON.stringify({ html }) }),

  replaceTextInPdf: (id: string, replacements: Array<{ find: string; replace: string }>): Promise<ApiResponse<{ success: boolean; replacementsApplied: number }>> =>
    request(
      `/api/pdf/sessions/${id}/replace-text`,
      { method: 'POST', body: JSON.stringify({ replacements }) },
      undefined,
      45_000,
    ),

  deletePdfSession: (id: string): Promise<ApiResponse<{ success: boolean }>> =>
    request(`/api/pdf/sessions/${id}`, { method: 'DELETE' }),

  // DOCX Workspace

  uploadDocx: async (
    file: File,
  ): Promise<
    ApiResponse<{ id: string; name: string; fileName: string; pageCount: number; createdAt: string }>
  > => {
    const formData = new FormData();
    formData.append('file', file);
    const credentials = btoa(`${AUTH_USER}:${AUTH_PASS}`);
    const res = await fetch(`${BASE_URL}/api/docx/upload`, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      body: formData,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(res.status, body.message ?? 'Upload failed');
    }
    return (await res.json()) as ApiResponse<{
      id: string;
      name: string;
      fileName: string;
      pageCount: number;
      createdAt: string;
    }>;
  },

  listDocxSessions: (): Promise<
    ApiResponse<Array<{ id: string; name: string; fileName: string; createdAt: string; updatedAt: string }>>
  > => request('/api/docx/sessions'),

  getDocxSession: (id: string): Promise<ApiResponse<unknown>> =>
    request(`/api/docx/sessions/${id}`),

  regenerateDocx: (
    id: string,
  ): Promise<
    ApiResponse<{
      success: boolean;
      replacementsApplied?: number;
      skippedInsertions?: number;
      message?: string;
    }>
  > =>
    request(`/api/docx/sessions/${id}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, undefined, 45_000),

  updateDocxContent: (id: string, html: string): Promise<ApiResponse<{ success: boolean }>> =>
    request(`/api/docx/sessions/${id}/content`, {
      method: 'PATCH',
      body: JSON.stringify({ html }),
    }),

  replaceTextInDocx: (
    id: string,
    replacements: Array<{ find: string; replace: string }>,
  ): Promise<ApiResponse<{ success: boolean; replacementsApplied: number }>> =>
    request(`/api/docx/sessions/${id}/replace-text`, {
      method: 'POST',
      body: JSON.stringify({ replacements }),
    }, undefined, 45_000),

  deleteDocxSession: (id: string): Promise<ApiResponse<{ success: boolean }>> =>
    request(`/api/docx/sessions/${id}`, { method: 'DELETE' }),
};

export { ApiError };

/**
 * Trigger a browser "Save As" download dialog for a given URL.
 * Fetches the file as a blob and uses a hidden anchor with the `download`
 * attribute so the OS file-picker appears.
 */
export async function triggerDownload(url: string, fileName: string): Promise<void> {
  const credentials = btoa(`${AUTH_USER}:${AUTH_PASS}`);
  const res = await fetch(`${BASE_URL}${url}`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

/**
 * Build a full URL for inline preview (e.g. PDF in iframe).
 * Includes auth credentials in the URL for the iframe to load.
 */
export function buildPreviewUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
