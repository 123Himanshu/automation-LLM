'use client';

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useUIStore } from '@/stores/ui-store';
import { useWorkbookStore } from '@/stores/workbook-store';
import { useJobStore } from '@/stores/job-store';
import { api, triggerDownload } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import type { PdfPrintSettings } from '@excelflow/shared';
import {
  ChooseFormatView,
  SheetSelectionView,
  GeneratingView,
  PreviewView,
} from './export-views';
import type { PendingExport } from './export-views';

type ExportStep = 'choose' | 'select-sheets' | 'generating' | 'preview';

export function ExportModal(): ReactElement {
  const isOpen = useUIStore((s) => s.isExportModalOpen);
  const closeModal = useUIStore((s) => s.closeExportModal);
  const workbook = useWorkbookStore((s) => s.workbook);
  const sheets = useWorkbookStore((s) => s.sheets);
  const revisionId = useWorkbookStore((s) => s.revisionId);
  const jobs = useJobStore((s) => s.jobs);
  const trackJob = useJobStore((s) => s.trackJob);

  const [step, setStep] = useState<ExportStep>('choose');
  const [pendingExport, setPendingExport] = useState<PendingExport | null>(null);
  const [chosenFormat, setChosenFormat] = useState<'xlsx' | 'pdf' | null>(null);
  const [isExporting, setIsExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [trackingJobId, setTrackingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<string>>(new Set());

  // PDF settings
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [gridlines, setGridlines] = useState(true);
  const [repeatHeaders, setRepeatHeaders] = useState(true);

  // Initialize all sheets as selected when modal opens
  useEffect(() => {
    if (isOpen && sheets.length > 0) {
      setSelectedSheetIds(new Set(sheets.map((s) => s.id)));
    }
  }, [isOpen, sheets]);

  const handleClose = useCallback((): void => {
    closeModal();
    setStep('choose');
    setPendingExport(null);
    setChosenFormat(null);
    setIsExporting(null);
    setTrackingJobId(null);
    setError(null);
    setIsDownloading(false);
  }, [closeModal]);

  const handleFormatChosen = useCallback((format: 'xlsx' | 'pdf'): void => {
    setChosenFormat(format);
    setError(null);
    setStep('select-sheets');
  }, []);

  const toggleSheet = useCallback((sheetId: string): void => {
    setSelectedSheetIds((prev) => {
      const next = new Set(prev);
      if (next.has(sheetId)) next.delete(sheetId);
      else next.add(sheetId);
      return next;
    });
  }, []);

  const toggleAll = useCallback((): void => {
    setSelectedSheetIds((prev) => {
      if (prev.size === sheets.length) return new Set();
      return new Set(sheets.map((s) => s.id));
    });
  }, [sheets]);

  const sheetIdsArray = useMemo(() => Array.from(selectedSheetIds), [selectedSheetIds]);

  // Poll job completion
  useEffect(() => {
    if (!trackingJobId) return;
    const job = jobs[trackingJobId];
    if (!job) return;

    if (job.status === 'completed' && job.result) {
      const result = job.result as { downloadUrl?: string; previewUrl?: string; fileName?: string };
      if (result.downloadUrl) {
        const fileName = result.fileName ?? `export.${isExporting === 'pdf' ? 'pdf' : 'xlsx'}`;
        const isPdf = fileName.endsWith('.pdf');
        setPendingExport({
          format: isPdf ? 'pdf' : 'xlsx',
          downloadUrl: result.downloadUrl,
          previewUrl: result.previewUrl ?? (isPdf ? `${result.downloadUrl}?mode=inline` : undefined),
          fileName,
        });
        setStep('preview');
        setIsExporting(null);
        setTrackingJobId(null);
      }
    } else if (job.status === 'failed') {
      setError(job.error ?? 'Export failed');
      setStep('select-sheets');
      setIsExporting(null);
      setTrackingJobId(null);
    }
  }, [trackingJobId, jobs, isExporting]);

  const handleExport = useCallback(async (): Promise<void> => {
    if (!workbook || !chosenFormat || selectedSheetIds.size === 0) return;
    setIsExporting(chosenFormat);
    setStep('generating');
    setError(null);

    try {
      if (chosenFormat === 'xlsx') {
        const res = await api.exportXlsx(workbook.id, revisionId ?? undefined, sheetIdsArray);
        if (res.data.isAsync && res.data.jobId) {
          trackJob(res.data.jobId);
          setTrackingJobId(res.data.jobId);
        } else if (res.data.downloadUrl) {
          setPendingExport({
            format: 'xlsx',
            downloadUrl: res.data.downloadUrl,
            fileName: res.data.fileName ?? `${workbook.name}.xlsx`,
          });
          setStep('preview');
          setIsExporting(null);
        }
      } else {
        const settings: PdfPrintSettings = {
          scope: 'all_sheets',
          orientation,
          scaling: 'fit_to_page',
          gridlines,
          repeatHeaders,
          sheetIds: sheetIdsArray,
        };
        const res = await api.exportPdf(workbook.id, settings, revisionId ?? undefined);
        if (res.data.jobId) {
          trackJob(res.data.jobId);
          setTrackingJobId(res.data.jobId);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
      setStep('select-sheets');
      setIsExporting(null);
    }
  }, [workbook, chosenFormat, selectedSheetIds, sheetIdsArray, revisionId, orientation, gridlines, repeatHeaders, trackJob]);

  const handleDownload = useCallback(async (): Promise<void> => {
    if (!pendingExport) return;
    setIsDownloading(true);
    try {
      await triggerDownload(pendingExport.downloadUrl, pendingExport.fileName);
      toast.success(`${pendingExport.fileName} downloaded`);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setIsDownloading(false);
    }
  }, [pendingExport, handleClose]);

  const jobProgress = trackingJobId ? jobs[trackingJobId]?.progress ?? 0 : 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        {step === 'choose' && (
          <ChooseFormatView error={error} onChoose={handleFormatChosen} />
        )}
        {step === 'select-sheets' && chosenFormat && (
          <SheetSelectionView
            format={chosenFormat}
            sheets={sheets}
            selectedIds={selectedSheetIds}
            orientation={orientation}
            gridlines={gridlines}
            repeatHeaders={repeatHeaders}
            onOrientationChange={setOrientation}
            onGridlinesChange={setGridlines}
            onRepeatHeadersChange={setRepeatHeaders}
            onToggleSheet={toggleSheet}
            onToggleAll={toggleAll}
            onBack={() => { setStep('choose'); setError(null); }}
            onExport={handleExport}
            error={error}
          />
        )}
        {step === 'generating' && (
          <GeneratingView format={isExporting} progress={jobProgress} />
        )}
        {step === 'preview' && pendingExport && (
          <PreviewView
            pendingExport={pendingExport}
            isDownloading={isDownloading}
            error={error}
            onDownload={handleDownload}
            onBack={() => { setStep('select-sheets'); setPendingExport(null); setError(null); }}
            onClose={handleClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
