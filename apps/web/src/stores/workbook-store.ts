import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Sheet, WorkbookClassification, WorkbookMeta, ActionBatch, CellValue, Action, CellFormat } from '@excelflow/shared';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { useUIStore } from './ui-store';
import { PERFORMANCE, buildCellRef } from '@excelflow/shared';

/** Pending edit queued for batching */
interface PendingEdit {
  sheetId: string;
  cellRef: string;
  value: CellValue;
  formula?: string;
}

interface WorkbookState {
  workbook: WorkbookMeta | null;
  sheets: Sheet[];
  activeSheetId: string | null;
  revisionId: string | null;
  classification: WorkbookClassification;
  isLoading: boolean;
  error: string | null;

  // Undo/Redo
  undoStack: string[];
  redoStack: string[];
  canUndo: boolean;
  canRedo: boolean;

  // Actions
  loadWorkbook: (id: string) => Promise<void>;
  setActiveSheet: (sheetId: string) => void;
  updateCell: (sheetId: string, cellRef: string, value: CellValue, formula?: string) => void;
  applyActions: (actions: Action[], source?: 'manual' | 'ai') => Promise<void>;
  setSheets: (sheets: Sheet[]) => void;
  refreshSheets: () => Promise<void>;
  updateColumnWidth: (sheetId: string, colIndex: number, width: number) => void;
  addSheet: () => Promise<void>;
  renameSheet: (sheetId: string, name: string) => Promise<void>;
  deleteSheet: (sheetId: string) => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearError: () => void;
}

/** Batch debounce timer and pending edits */
let batchTimer: ReturnType<typeof setTimeout> | undefined;
const pendingEdits: PendingEdit[] = [];

/** Flush all pending edits as a single batch */
async function flushPendingEdits(): Promise<void> {
  if (pendingEdits.length === 0) return;
  const edits = pendingEdits.splice(0, pendingEdits.length);
  const state = useWorkbookStore.getState();
  if (!state.workbook) return;

  const actions: Action[] = edits.map((e) => ({
    type: 'SET_CELL' as const,
    sheetId: e.sheetId,
    cellRef: e.cellRef,
    value: e.value,
    formula: e.formula,
  }));

  await state.applyActions(actions, 'manual');
}

export const useWorkbookStore = create<WorkbookState>()(
  immer((set, get) => ({
    workbook: null,
    sheets: [],
    activeSheetId: null,
    revisionId: null,
    classification: 'normal',
    isLoading: false,
    error: null,
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,

    loadWorkbook: async (id: string): Promise<void> => {
      set((s) => { s.isLoading = true; s.error = null; });
      try {
        const res = await api.getWorkbook(id);
        const workbook = res.data;

        const sheetsRes = await api.getSheets(id);
        const sheetSummaries = sheetsRes.data;

        // Parallel sheet loading instead of sequential
        const fullSheets = await Promise.all(
          sheetSummaries.map(async (summary) => {
            const sheetRes = await api.getSheetData(id, summary.id);
            return sheetRes.data;
          }),
        );

        let latestRevisionId: string | null = null;
        try {
          const revRes = await api.listRevisions(id);
          const revisions = revRes.data as Array<{ id: string }>;
          if (revisions.length > 0) {
            latestRevisionId = revisions[revisions.length - 1]!.id;
          }
        } catch {
          // Non-critical
        }

        set((s) => {
          s.workbook = workbook;
          s.classification = workbook.classification;
          s.sheets = fullSheets;
          s.activeSheetId = fullSheets.length > 0 ? fullSheets[0]!.id : null;
          s.revisionId = latestRevisionId;
          s.isLoading = false;
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load workbook';
        set((s) => { s.error = msg; s.isLoading = false; });
        toast.error(msg);
      }
    },

    setActiveSheet: (sheetId: string): void => {
      set((s) => { s.activeSheetId = sheetId; });
    },

    /** Optimistic cell update with batch debounce */
    updateCell: (sheetId: string, cellRef: string, value: CellValue, formula?: string): void => {
      // 1. Optimistic local update — instant feedback
      set((s) => {
        const sheet = s.sheets.find((sh) => sh.id === sheetId);
        if (!sheet) return;
        const isFormula = typeof formula === 'string' && formula.length > 0;
        sheet.cells[cellRef] = {
          value: isFormula ? null : value,
          formula: isFormula ? formula : undefined,
          computedValue: isFormula ? sheet.cells[cellRef]?.computedValue : value,
          type: isFormula ? 'formula' : inferCellType(value),
        };
      });

      // 2. Queue for batch send
      const existing = pendingEdits.findIndex((e) => e.sheetId === sheetId && e.cellRef === cellRef);
      if (existing !== -1) pendingEdits.splice(existing, 1);
      pendingEdits.push({ sheetId, cellRef, value, formula });

      // 3. Debounce flush
      if (batchTimer) clearTimeout(batchTimer);
      batchTimer = setTimeout(() => { flushPendingEdits(); }, PERFORMANCE.CELL_EDIT_DEBOUNCE_MS);
    },

    /** Generic action dispatch — used by format actions, AI, and batch flush */
    applyActions: async (actions: Action[], source: 'manual' | 'ai' = 'manual'): Promise<void> => {
      const state = get();
      if (!state.workbook || actions.length === 0) return;

      // Optimistic: apply FORMAT_CELLS locally for instant feedback
      const formatActions = actions.filter((a): a is Extract<Action, { type: 'FORMAT_CELLS' }> => a.type === 'FORMAT_CELLS');
      if (formatActions.length > 0) {
        set((s) => {
          for (const fa of formatActions) {
            const sheet = s.sheets.find((sh) => sh.id === fa.sheetId);
            if (!sheet) continue;
            for (let r = fa.range.startRow; r <= fa.range.endRow; r++) {
              for (let c = fa.range.startCol; c <= fa.range.endCol; c++) {
                const ref = buildCellRef(c, r);
                const existing = sheet.cells[ref];
                if (existing) {
                  existing.format = { ...existing.format, ...fa.format } as CellFormat;
                } else {
                  sheet.cells[ref] = {
                    value: null, type: 'empty',
                    format: fa.format as CellFormat,
                  };
                }
              }
            }
          }
        });
      }

      useUIStore.getState().setIsSaving(true);

      const batch: ActionBatch = {
        workbookId: state.workbook.id,
        revisionId: state.revisionId ?? 'latest',
        actions,
        source,
      };

      try {
        const res = await api.applyActions(batch);
        const newRevisionId = res.data.revisionId;
        set((s) => {
          if (s.revisionId) s.undoStack.push(s.revisionId);
          s.redoStack = [];
          s.revisionId = newRevisionId;
          s.canUndo = s.undoStack.length > 0;
          s.canRedo = false;
        });

        // Refresh only affected sheets (formula recalc may change other cells)
        // Preserve user-adjusted column widths across re-fetch
        const affectedSheetIds = new Set(
          actions.filter((a) => 'sheetId' in a).map((a) => (a as { sheetId: string }).sheetId),
        );
        const workbookId = state.workbook.id;
        await Promise.all(
          [...affectedSheetIds].map(async (sid) => {
            try {
              const sheetRes = await api.getSheetData(workbookId, sid);
              set((s) => {
                const idx = s.sheets.findIndex((sh) => sh.id === sid);
                if (idx !== -1) {
                  const prevWidths = s.sheets[idx]!.columnWidths;
                  s.sheets[idx] = sheetRes.data;
                  // Restore user column widths (local overrides server)
                  s.sheets[idx]!.columnWidths = { ...sheetRes.data.columnWidths, ...prevWidths };
                }
              });
            } catch { /* non-critical */ }
          }),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to apply actions';
        set((s) => { s.error = msg; });
        toast.error(msg);
      } finally {
        useUIStore.getState().setIsSaving(false);
      }
    },

    setSheets: (sheets: Sheet[]): void => {
      set((s) => {
        s.sheets = sheets;
        if (!s.activeSheetId && sheets.length > 0) {
          s.activeSheetId = sheets[0]!.id;
        }
      });
    },

    refreshSheets: async (): Promise<void> => {
      const state = get();
      if (!state.workbook) return;
      try {
        const sheetsRes = await api.getSheets(state.workbook.id);
        const fullSheets = await Promise.all(
          sheetsRes.data.map(async (summary) => {
            const sheetRes = await api.getSheetData(state.workbook!.id, summary.id);
            return sheetRes.data;
          }),
        );
        set((s) => {
          s.sheets = fullSheets;
          if (!fullSheets.find((sh) => sh.id === s.activeSheetId) && fullSheets.length > 0) {
            s.activeSheetId = fullSheets[0]!.id;
          }
        });
      } catch { /* non-critical */ }
    },

    updateColumnWidth: (sheetId: string, colIndex: number, width: number): void => {
      set((s) => {
        const sheet = s.sheets.find((sh) => sh.id === sheetId);
        if (sheet) sheet.columnWidths[colIndex] = width;
      });
    },

    addSheet: async (): Promise<void> => {
      const state = get();
      if (!state.workbook) return;
      const existingNames = state.sheets.map((s) => s.name);
      let sheetNum = state.sheets.length + 1;
      let newName = `Sheet${sheetNum}`;
      while (existingNames.includes(newName)) { sheetNum++; newName = `Sheet${sheetNum}`; }

      await state.applyActions([{ type: 'CREATE_SHEET', name: newName }]);
      await get().refreshSheets();
      const created = get().sheets.find((s) => s.name === newName);
      if (created) set((s) => { s.activeSheetId = created.id; });
      toast.success(`Created "${newName}"`);
    },

    renameSheet: async (sheetId: string, name: string): Promise<void> => {
      const state = get();
      if (!state.workbook) return;
      // Optimistic
      set((s) => {
        const sheet = s.sheets.find((sh) => sh.id === sheetId);
        if (sheet) sheet.name = name;
      });
      await state.applyActions([{ type: 'RENAME_SHEET', sheetId, name }]);
      toast.success(`Renamed to "${name}"`);
    },

    deleteSheet: async (sheetId: string): Promise<void> => {
      const state = get();
      if (!state.workbook || state.sheets.length <= 1) {
        toast.info('Cannot delete the last sheet');
        return;
      }
      await state.applyActions([{ type: 'DELETE_SHEET', sheetId }]);
      await get().refreshSheets();
      toast.success('Sheet deleted');
    },

    undo: async (): Promise<void> => {
      const state = get();
      if (!state.workbook || state.undoStack.length === 0) return;
      const prevRevisionId = state.undoStack[state.undoStack.length - 1]!;
      try {
        await api.revertRevision(state.workbook.id, prevRevisionId);
        set((s) => {
          if (s.revisionId) s.redoStack.push(s.revisionId);
          s.undoStack.pop();
          s.revisionId = prevRevisionId;
          s.canUndo = s.undoStack.length > 0;
          s.canRedo = s.redoStack.length > 0;
        });
        await get().refreshSheets();
        toast.info('Undo successful');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Undo failed');
      }
    },

    redo: async (): Promise<void> => {
      const state = get();
      if (!state.workbook || state.redoStack.length === 0) return;
      const nextRevisionId = state.redoStack[state.redoStack.length - 1]!;
      try {
        await api.revertRevision(state.workbook.id, nextRevisionId);
        set((s) => {
          if (s.revisionId) s.undoStack.push(s.revisionId);
          s.redoStack.pop();
          s.revisionId = nextRevisionId;
          s.canUndo = s.undoStack.length > 0;
          s.canRedo = s.redoStack.length > 0;
        });
        await get().refreshSheets();
        toast.info('Redo successful');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Redo failed');
      }
    },

    clearError: (): void => { set((s) => { s.error = null; }); },
  })),
);

function inferCellType(value: CellValue): 'string' | 'number' | 'boolean' | 'empty' {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}
