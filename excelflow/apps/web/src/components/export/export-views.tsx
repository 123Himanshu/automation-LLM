'use client';

import { type ReactElement, useEffect, useState } from 'react';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileSpreadsheet, FileText, Loader2, Download, ArrowLeft, X, Check } from 'lucide-react';

/* ── Choose Format View ─────────────────────────────────────────────── */

interface ChooseFormatViewProps {
  error: string | null;
  onChoose: (format: 'xlsx' | 'pdf') => void;
}

export function ChooseFormatView({ error, onChoose }: ChooseFormatViewProps): ReactElement {
  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-0">
        <DialogTitle className="flex items-center gap-2 text-lg">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Download className="h-4 w-4 text-primary" />
          </div>
          Export Workbook
        </DialogTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a format, then pick which sheets to include
        </p>
      </DialogHeader>

      <div className="px-6 pb-6 space-y-4 pt-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2" role="alert">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={() => onChoose('xlsx')}
          className="w-full flex items-start gap-4 rounded-xl border-2 border-border p-4 text-left hover:border-primary/30 hover:bg-primary/5 transition-all duration-150"
          aria-label="Export as Excel"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold">Excel (.xlsx)</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Preserves formulas, formatting, column widths, and all sheets
            </p>
          </div>
        </button>

        <button
          onClick={() => onChoose('pdf')}
          className="w-full flex items-start gap-4 rounded-xl border-2 border-border p-4 text-left hover:border-primary/30 hover:bg-primary/5 transition-all duration-150"
          aria-label="Export as PDF"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100">
            <FileText className="h-5 w-5 text-red-600" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold">PDF Document</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Print-ready layout with customizable settings
            </p>
          </div>
        </button>
      </div>
    </>
  );
}

/* ── Sheet Selection View ───────────────────────────────────────────── */

export interface SheetSelectionViewProps {
  format: 'xlsx' | 'pdf';
  sheets: Array<{ id: string; name: string }>;
  selectedIds: Set<string>;
  orientation: 'portrait' | 'landscape';
  gridlines: boolean;
  repeatHeaders: boolean;
  onOrientationChange: (v: 'portrait' | 'landscape') => void;
  onGridlinesChange: (v: boolean) => void;
  onRepeatHeadersChange: (v: boolean) => void;
  onToggleSheet: (id: string) => void;
  onToggleAll: () => void;
  onBack: () => void;
  onExport: () => void;
  error: string | null;
}

export function SheetSelectionView({
  format, sheets, selectedIds,
  orientation, gridlines, repeatHeaders,
  onOrientationChange, onGridlinesChange, onRepeatHeadersChange,
  onToggleSheet, onToggleAll, onBack, onExport, error,
}: SheetSelectionViewProps): ReactElement {
  const allSelected = selectedIds.size === sheets.length;
  const noneSelected = selectedIds.size === 0;
  const isPdf = format === 'pdf';

  return (
    <>
      <div className="flex items-center gap-2 px-6 pt-6 pb-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <p className="text-sm font-semibold">
            Select sheets to export as {isPdf ? 'PDF' : 'Excel'}
          </p>
          <p className="text-xs text-muted-foreground">
            {selectedIds.size} of {sheets.length} sheet{sheets.length !== 1 ? 's' : ''} selected
          </p>
        </div>
      </div>

      <div className="px-6 pb-4 space-y-3">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2" role="alert">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={onToggleAll}
          className="w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/50 transition-colors"
          aria-label={allSelected ? 'Deselect all sheets' : 'Select all sheets'}
        >
          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
            allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
          }`}>
            {allSelected && <Check className="h-3 w-3" />}
          </div>
          <span className="text-sm font-medium">
            {allSelected ? 'Deselect all' : 'Select all sheets'}
          </span>
        </button>

        <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border p-2">
          {sheets.map((sheet) => {
            const checked = selectedIds.has(sheet.id);
            return (
              <button
                key={sheet.id}
                onClick={() => onToggleSheet(sheet.id)}
                className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                aria-label={`${checked ? 'Deselect' : 'Select'} sheet ${sheet.name}`}
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                  checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                }`}>
                  {checked && <Check className="h-3 w-3" />}
                </div>
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{sheet.name}</span>
              </button>
            );
          })}
        </div>

        {isPdf && (
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">Orientation:</span>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" name="orient" checked={orientation === 'portrait'} onChange={() => onOrientationChange('portrait')} className="accent-primary" />
                Portrait
              </label>
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input type="radio" name="orient" checked={orientation === 'landscape'} onChange={() => onOrientationChange('landscape')} className="accent-primary" />
                Landscape
              </label>
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer rounded-lg bg-muted/30 px-3 py-1.5">
              <input type="checkbox" checked={gridlines} onChange={(e) => onGridlinesChange(e.target.checked)} className="accent-primary" />
              Gridlines
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer rounded-lg bg-muted/30 px-3 py-1.5">
              <input type="checkbox" checked={repeatHeaders} onChange={(e) => onRepeatHeadersChange(e.target.checked)} className="accent-primary" />
              Repeat headers
            </label>
          </div>
        )}

        <Button onClick={onExport} disabled={noneSelected} className="w-full gap-2">
          <Download className="h-4 w-4" />
          Export {selectedIds.size} sheet{selectedIds.size !== 1 ? 's' : ''} as {isPdf ? 'PDF' : 'XLSX'}
        </Button>
      </div>
    </>
  );
}

/* ── Generating View ────────────────────────────────────────────────── */

interface GeneratingViewProps {
  format: 'xlsx' | 'pdf' | null;
  progress: number;
}

export function GeneratingView({ format, progress }: GeneratingViewProps): ReactElement {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 space-y-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm font-medium">
        Generating {format === 'pdf' ? 'PDF' : 'Excel'} file...
      </p>
      {progress > 0 && (
        <div className="w-48">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-1">{progress}%</p>
        </div>
      )}
    </div>
  );
}

/* ── Preview / Download View ────────────────────────────────────────── */

export interface PendingExport {
  format: 'xlsx' | 'pdf';
  downloadUrl: string;
  previewUrl?: string;
  fileName: string;
}

interface PreviewViewProps {
  pendingExport: PendingExport;
  isDownloading: boolean;
  error: string | null;
  onDownload: () => void;
  onBack: () => void;
  onClose: () => void;
}

export function PreviewView({ pendingExport, isDownloading, error, onDownload, onBack, onClose }: PreviewViewProps): ReactElement {
  const isPdf = pendingExport.format === 'pdf';
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!isPdf || !pendingExport.previewUrl) return;
    let revoked = false;
    const credentials = btoa(
      `${process.env['NEXT_PUBLIC_AUTH_USER'] ?? 'admin'}:${process.env['NEXT_PUBLIC_AUTH_PASS'] ?? 'changeme'}`,
    );
    setPdfLoading(true);
    const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? '';
    fetch(`${baseUrl}${pendingExport.previewUrl}`, {
      headers: { Authorization: `Basic ${credentials}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`PDF preview failed: ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        setPdfBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => setPdfBlobUrl(null))
      .finally(() => setPdfLoading(false));
    return () => {
      revoked = true;
      setPdfBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPdf, pendingExport.previewUrl]);

  return (
    <>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to sheet selection" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm font-semibold">{pendingExport.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {isPdf ? 'Preview your PDF below' : 'Your Excel file is ready'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={onDownload} disabled={isDownloading} size="sm" className="gap-1.5" aria-label="Save file to your computer">
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {isDownloading ? 'Saving...' : 'Save to Computer'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2" role="alert">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {isPdf && pendingExport.previewUrl ? (
        <div className="px-4 pb-4">
          <div className="rounded-lg border bg-muted/20 overflow-hidden" style={{ height: '60vh' }}>
            {pdfLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : pdfBlobUrl ? (
              <iframe
                src={pdfBlobUrl}
                title="PDF Preview"
                className="w-full h-full"
                style={{ border: 'none' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                <p>Preview unavailable</p>
                <p className="text-xs mt-1">Click &#34;Save to Computer&#34; to download</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 px-6 space-y-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <FileSpreadsheet className="h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-sm font-medium">Excel file ready</p>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Click &#34;Save to Computer&#34; to choose where to save your file
          </p>
        </div>
      )}
    </>
  );
}
