'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api-client';
import type { WorkbookMeta } from '@excelflow/shared';
import { Upload, FileSpreadsheet, AlertCircle, Plus, Trash2, Pencil, Check, X, FileText } from 'lucide-react';

export default function HomePage() {
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
    api.listWorkbooks()
      .then((res) => setWorkbooks(res.data))
      .catch(() => { });
  }, []);

  useEffect(() => { loadWorkbooks(); }, [loadWorkbooks]);

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

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [router]);

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
    if (!editingId || !editName.trim()) { setEditingId(null); return; }
    try {
      await api.renameWorkbook(editingId, editName.trim());
      setWorkbooks((prev) => prev.map((wb) => wb.id === editingId ? { ...wb, name: editName.trim() } : wb));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rename failed');
    }
    setEditingId(null);
  }, [editingId, editName]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-primary" />
          <h1 className="text-3xl font-bold">ExcelFlow</h1>
          <p className="text-muted-foreground">Upload an Excel file to get started</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div
          className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 bg-white p-12 transition-colors hover:border-primary/50 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload Excel file"
        >
          <Upload className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{isUploading ? 'Uploading...' : 'Click to upload .xlsx or .csv'}</p>
          <p className="text-xs text-muted-foreground mt-1">Max 50MB</p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.csv" onChange={handleUpload} className="hidden" aria-hidden="true" />
        </div>

        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={handleCreateNew} disabled={isCreating} aria-label="Create new empty workbook">
            <Plus className="mr-2 h-4 w-4" />
            {isCreating ? 'Creating...' : 'Create New Workbook'}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/pdf')}
            aria-label="Open PDF AI Workspace"
            className="border-violet-300 text-violet-700 hover:bg-violet-50"
          >
            <FileText className="mr-2 h-4 w-4" />
            PDF AI Workspace
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/docx')}
            aria-label="Open DOCX AI Workspace"
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <FileText className="mr-2 h-4 w-4" />
            DOCX AI Workspace
          </Button>
        </div>

        {workbooks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground">Recent Workbooks</h2>
            <div className="space-y-2">
              {workbooks.map((wb) => (
                <div
                  key={wb.id}
                  className="flex w-full items-center gap-3 rounded-md border bg-white p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                  onClick={() => router.push(`/workbook/${wb.id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && router.push(`/workbook/${wb.id}`)}
                >
                  <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    {editingId === wb.id ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          ref={editRef}
                          className="h-6 w-40 rounded border px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                          onBlur={commitRename}
                          aria-label="Rename workbook"
                        />
                        <button onClick={commitRename} className="p-0.5 text-green-600 hover:bg-green-50 rounded" aria-label="Confirm">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-0.5 text-muted-foreground hover:bg-muted rounded" aria-label="Cancel">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">{wb.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {wb.sheetCount} sheet{wb.sheetCount !== 1 ? 's' : ''} · {wb.classification}
                        </div>
                      </>
                    )}
                  </div>
                  {editingId !== wb.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => startRename(wb.id, wb.name, e)}
                        className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label="Rename workbook"
                        title="Rename"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(wb.id, e)}
                        className="p-1.5 rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
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
          </div>
        )}
      </div>
    </div>
  );
}
