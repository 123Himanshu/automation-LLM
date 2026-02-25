'use client';

import { useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { AppHeader } from '@/components/layout/app-header';
import { ErrorBoundary } from '@/components/layout/error-boundary';
import { WorkbookSkeleton } from '@/components/layout/workbook-skeleton';
import { WorkspaceTopNav } from '@/components/layout/workspace-top-nav';
import { FormulaBar } from '@/components/spreadsheet/formula-bar';
import { Toolbar } from '@/components/spreadsheet/toolbar';
import { SheetTabs } from '@/components/spreadsheet/sheet-tabs';
import { StatusBar } from '@/components/spreadsheet/status-bar';
import { FindReplace } from '@/components/spreadsheet/find-replace';
import { GridWrapper } from '@/components/spreadsheet/grid-wrapper';
import { useWorkbookStore } from '@/stores/workbook-store';
import { useUIStore } from '@/stores/ui-store';

const ChatPanel = lazy(() =>
  import('@/components/chat/chat-panel').then((m) => ({ default: m.ChatPanel })),
);
const ExportModal = lazy(() =>
  import('@/components/export/export-modal').then((m) => ({ default: m.ExportModal })),
);
const SummaryModal = lazy(() =>
  import('@/components/summary/summary-modal').then((m) => ({ default: m.SummaryModal })),
);

export default function WorkbookEditorPage() {
  const params = useParams<{ id: string }>();
  const workbookId = params.id;

  const workbook = useWorkbookStore((s) => s.workbook);
  const sheets = useWorkbookStore((s) => s.sheets);
  const activeSheetId = useWorkbookStore((s) => s.activeSheetId);
  const classification = useWorkbookStore((s) => s.classification);
  const isLoading = useWorkbookStore((s) => s.isLoading);
  const loadWorkbook = useWorkbookStore((s) => s.loadWorkbook);
  const setActiveSheet = useWorkbookStore((s) => s.setActiveSheet);
  const updateCell = useWorkbookStore((s) => s.updateCell);
  const addSheet = useWorkbookStore((s) => s.addSheet);
  const renameSheet = useWorkbookStore((s) => s.renameSheet);
  const deleteSheet = useWorkbookStore((s) => s.deleteSheet);
  const isChatOpen = useUIStore((s) => s.isChatOpen);

  useEffect(() => {
    if (workbookId) loadWorkbook(workbookId);
  }, [workbookId, loadWorkbook]);

  const activeSheet = useMemo(
    () => sheets.find((s) => s.id === activeSheetId) ?? sheets[0] ?? null,
    [sheets, activeSheetId],
  );

  const handleCellChange = useCallback(
    (cellRef: string, value: string) => {
      if (!activeSheetId) return;
      const isFormula = value.startsWith('=');
      updateCell(activeSheetId, cellRef, isFormula ? null : value, isFormula ? value : undefined);
    },
    [activeSheetId, updateCell],
  );

  const handleFormulaSubmit = useCallback(
    (value: string) => {
      const selectedRange = useUIStore.getState().selectedRange;
      if (!selectedRange || !activeSheetId) return;
      const isFormula = value.startsWith('=');
      updateCell(activeSheetId, selectedRange, isFormula ? null : value, isFormula ? value : undefined);
    },
    [activeSheetId, updateCell],
  );

  const sheetList = useMemo(
    () => sheets.map((s) => ({ id: s.id, name: s.name })),
    [sheets],
  );

  if (isLoading) {
    return (
      <div className="h-screen overflow-hidden bg-app-canvas">
        <WorkspaceTopNav />
        <div className="h-[calc(100vh-56px)]">
          <WorkbookSkeleton />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="h-screen overflow-hidden bg-app-canvas">
        <WorkspaceTopNav />
        <div className="h-[calc(100vh-56px)]">
          <AppShell
            header={<AppHeader workbookName={workbook?.name} classification={classification} />}
            sidebar={
              isChatOpen ? (
                <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading chat...</div>}>
                  <ChatPanel />
                </Suspense>
              ) : undefined
            }
          >
            <div className="relative flex h-full flex-col">
              <Toolbar />
              <FormulaBar onSubmit={handleFormulaSubmit} />
              <FindReplace />
              <GridWrapper sheet={activeSheet} classification={classification} onCellChange={handleCellChange} />
              <SheetTabs
                sheets={sheetList}
                activeSheetId={activeSheetId}
                onSelect={setActiveSheet}
                onAddSheet={addSheet}
                onRenameSheet={renameSheet}
                onDeleteSheet={deleteSheet}
              />
              <StatusBar />
            </div>
          </AppShell>
        </div>
      </div>

      <Suspense fallback={null}>
        <ExportModal />
        <SummaryModal />
      </Suspense>
    </ErrorBoundary>
  );
}
