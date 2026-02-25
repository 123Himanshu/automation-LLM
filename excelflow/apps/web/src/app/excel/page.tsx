'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check, FileSpreadsheet, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import type { WorkbookMeta } from '@excelflow/shared';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api-client';
import { LightPageShell } from '@/components/layout/light-page-shell';

export default function ExcelWorkspaceHomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workbooks, setWorkbooks] = useState<WorkbookMeta[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  const loadWorkbooks = useCallback(() => {
    void api
      .listWorkbooks()
      .then((res) => setWorkbooks(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadWorkbooks();
  }, [loadWorkbooks]);

  const handleCreateNew = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const res = await api.createWorkbook();
      router.push(`/workbook/${res.data.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create workbook');
    } finally {
      setIsCreating(false);
    }
  }, [router]);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploading(true);
      setError(null);
      try {
        const res = await api.uploadWorkbook(file);
        router.push(`/workbook/${res.data.id}`);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [router],
  );

  const handleDelete = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this workbook? This cannot be undone.')) return;
    try {
      await api.deleteWorkbook(id);
      setWorkbooks((prev) => prev.filter((wb) => wb.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }, []);

  const startRename = useCallback((id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditName(name);
    setTimeout(() => editRef.current?.select(), 50);
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingId || !editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await api.renameWorkbook(editingId, editName.trim());
      setWorkbooks((prev) =>
        prev.map((wb) => (wb.id === editingId ? { ...wb, name: editName.trim() } : wb)),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rename failed');
    }
    setEditingId(null);
  }, [editingId, editName]);

  return (
    <LightPageShell contentClassName="space-y-6">
      <section className="light-card relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="absolute -top-24 right-[-80px] h-48 w-48 rounded-full bg-blue-100/70 blur-2xl" />
        <div className="absolute -bottom-24 left-[-80px] h-48 w-48 rounded-full bg-cyan-100/70 blur-2xl" />

        <div className="relative flex flex-col gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel Flow Workspace
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Build and automate spreadsheets with AI assistance
            </h1>
            <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
              Upload `.xlsx` or `.csv`, edit in real time, and use the assistant for formulas, summaries,
              and structured transformations.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleCreateNew} disabled={isCreating} className="h-10 rounded-xl px-4">
              <Plus className="mr-2 h-4 w-4" />
              {isCreating ? 'Creating...' : 'Create New Workbook'}
            </Button>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="h-10 rounded-xl border-slate-300 bg-white px-4 text-slate-700"
              aria-label="Upload Excel file"
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload Excel File'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              onChange={handleUpload}
              className="hidden"
              aria-hidden="true"
            />
          </div>
        </div>
      </section>

      {error && (
        <div
          className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <section className="light-card rounded-2xl p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Workbooks</h2>

        {workbooks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center">
            <p className="text-sm font-medium text-slate-700">No workbook yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Create a new workbook or upload a file to start.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {workbooks.map((wb) => (
              <div
                key={wb.id}
                className="group flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 transition-colors hover:bg-slate-50"
                onClick={() => router.push(`/workbook/${wb.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && router.push(`/workbook/${wb.id}`)}
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                  <FileSpreadsheet className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  {editingId === wb.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={editRef}
                        className="h-7 w-44 rounded-md border border-slate-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void commitRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onBlur={() => {
                          void commitRename();
                        }}
                        aria-label="Rename workbook"
                      />
                      <button
                        onClick={() => {
                          void commitRename();
                        }}
                        className="rounded p-0.5 text-emerald-600 hover:bg-emerald-50"
                        aria-label="Confirm"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(null);
                        }}
                        className="rounded p-0.5 text-slate-500 hover:bg-slate-100"
                        aria-label="Cancel"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="truncate text-sm font-medium text-slate-800">{wb.name}</div>
                      <div className="text-xs text-slate-500">
                        {wb.sheetCount} sheet{wb.sheetCount !== 1 ? 's' : ''} · {wb.classification}
                      </div>
                    </>
                  )}
                </div>

                {editingId !== wb.id && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => startRename(wb.id, wb.name, e)}
                      className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                      aria-label="Rename workbook"
                      title="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => void handleDelete(wb.id, e)}
                      className="rounded p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete workbook"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </LightPageShell>
  );
}
