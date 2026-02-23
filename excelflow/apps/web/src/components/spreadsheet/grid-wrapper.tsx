'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  CellValueChangedEvent,
  GridReadyEvent,
  CellClickedEvent,
  ColDef,
  ColumnResizedEvent,
  GridApi,
  CellKeyDownEvent,
} from 'ag-grid-community';
import type { Sheet, CellValue } from '@excelflow/shared';
import { colIndexToLetter, letterToColIndex, buildCellRef } from '@excelflow/shared';
import { useUIStore } from '@/stores/ui-store';
import { useWorkbookStore } from '@/stores/workbook-store';
import { toast } from '@/hooks/use-toast';
import { GridContextMenu } from './context-menu';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';

interface GridWrapperProps {
  sheet: Sheet | null;
  classification: string;
  onCellChange: (cellRef: string, value: string) => void;
}

/** Parse TSV clipboard text into a 2D array */
function parseTSV(text: string): string[][] {
  return text.split('\n').filter((line) => line.length > 0).map((line) => line.split('\t'));
}

export function GridWrapper({ sheet, classification, onCellChange }: GridWrapperProps) {
  const gridRef = useRef<AgGridReact>(null);
  const gridApiRef = useRef<GridApi | null>(null);
  const setSelectedRange = useUIStore((s) => s.setSelectedRange);
  const setSelectionRect = useUIStore((s) => s.setSelectionRect);
  const setFormulaBarValue = useUIStore((s) => s.setFormulaBarValue);
  const setStatusBarInfo = useUIStore((s) => s.setStatusBarInfo);

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [ctxCellRef, setCtxCellRef] = useState<string | null>(null);

  const { columnDefs, rowData } = useMemo(() => {
    if (!sheet) return { columnDefs: [] as ColDef[], rowData: [] as Record<string, unknown>[] };
    const maxCol = Math.max(sheet.usedRange.endCol + 1, 26);
    const maxRow = Math.max(sheet.usedRange.endRow + 1, 100);

    const cols: ColDef[] = [{
      headerName: '', field: '__rowNum', width: 55, pinned: 'left',
      editable: false, suppressMovable: true,
      cellClass: 'row-number-cell', headerClass: 'row-number-header',
    }];

    for (let c = 0; c < maxCol; c++) {
      const letter = colIndexToLetter(c);
      cols.push({
        headerName: letter, field: letter,
        width: Math.max(sheet.columnWidths[c] ?? 120, 80), minWidth: 60,
        editable: true, sortable: false,
        cellClass: (params) => {
          const cellRef = `${letter}${(params.rowIndex ?? 0) + 1}`;
          const cell = sheet.cells[cellRef];
          const classes: string[] = [];
          if (cell?.formula) classes.push('formula-cell');
          if (cell?.type === 'number') classes.push('number-cell');
          return classes.join(' ');
        },
        cellStyle: (params) => {
          const cellRef = `${letter}${(params.rowIndex ?? 0) + 1}`;
          const cell = sheet.cells[cellRef];
          if (!cell?.format) return undefined;
          const fmt = cell.format;
          const style: Record<string, string> = {};
          if (fmt.bold) style['fontWeight'] = '700';
          if (fmt.italic) style['fontStyle'] = 'italic';
          if (fmt.fontSize) style['fontSize'] = `${Math.round(fmt.fontSize * 1.333)}px`;
          if (fmt.fontColor) style['color'] = fmt.fontColor;
          if (fmt.bgColor) style['backgroundColor'] = fmt.bgColor;
          if (fmt.alignment) style['textAlign'] = fmt.alignment;
          return Object.keys(style).length > 0 ? style : undefined;
        },
      });
    }

    const rows: Record<string, unknown>[] = [];
    for (let r = 0; r < maxRow; r++) {
      const row: Record<string, unknown> = { __rowNum: r + 1 };
      for (let c = 0; c < maxCol; c++) {
        const letter = colIndexToLetter(c);
        const cell = sheet.cells[`${letter}${r + 1}`];
        row[letter] = cell?.computedValue ?? cell?.value ?? '';
      }
      rows.push(row);
    }
    return { columnDefs: cols, rowData: rows };
  }, [sheet]);

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent) => {
      const colField = event.colDef.field;
      if (!colField || colField === '__rowNum') return;
      const rowIndex = event.rowIndex;
      if (rowIndex === null || rowIndex === undefined) return;
      const cellRef = `${colField}${rowIndex + 1}`;
      onCellChange(cellRef, String(event.newValue ?? ''));
    },
    [onCellChange],
  );

  const handleCellClicked = useCallback(
    (event: CellClickedEvent) => {
      const colField = event.colDef.field;
      if (!colField || colField === '__rowNum') return;
      const rowIndex = event.rowIndex;
      if (rowIndex === null || rowIndex === undefined) return;
      const cellRef = `${colField}${rowIndex + 1}`;
      setSelectedRange(cellRef);
      setSelectionRect(null);
      setStatusBarInfo(null);
      const cell = sheet?.cells[cellRef];
      setFormulaBarValue(cell?.formula ?? String(cell?.value ?? ''));
    },
    [sheet, setSelectedRange, setSelectionRect, setFormulaBarValue, setStatusBarInfo],
  );

  /** Multi-cell paste + keyboard shortcuts */
  const handleCellKeyDown = useCallback(
    (event: CellKeyDownEvent) => {
      const e = event.event as KeyboardEvent | undefined;
      if (!e || !sheet) return;

      // Ctrl+C — copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const colField = event.colDef.field;
        if (!colField || colField === '__rowNum') return;
        const rowIndex = event.rowIndex;
        if (rowIndex === null || rowIndex === undefined) return;
        const cellRef = `${colField}${rowIndex + 1}`;
        const cell = sheet.cells[cellRef];
        const text = cell?.formula ?? String(cell?.computedValue ?? cell?.value ?? '');
        navigator.clipboard.writeText(text).catch(() => {});
      }

      // Ctrl+V — multi-cell paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const colField = event.colDef.field;
        if (!colField || colField === '__rowNum') return;
        const rowIndex = event.rowIndex;
        if (rowIndex === null || rowIndex === undefined) return;
        e.preventDefault();
        navigator.clipboard.readText().then((text) => {
          if (!text) return;
          const rows = parseTSV(text);
          if (rows.length === 1 && rows[0]!.length === 1) {
            // Single cell paste
            onCellChange(`${colField}${rowIndex + 1}`, rows[0]![0]!.trim());
            return;
          }
          // Multi-cell paste via SET_RANGE
          const startCol = letterToColIndex(colField);
          const values: CellValue[][] = rows.map((row) =>
            row.map((v) => {
              const trimmed = v.trim();
              if (trimmed === '') return null;
              const num = Number(trimmed);
              return isNaN(num) ? trimmed : num;
            }),
          );
          const { activeSheetId } = useWorkbookStore.getState();
          if (!activeSheetId) return;
          useWorkbookStore.getState().applyActions([{
            type: 'SET_RANGE',
            sheetId: activeSheetId,
            range: {
              startRow: rowIndex, startCol,
              endRow: rowIndex + values.length - 1,
              endCol: startCol + (values[0]?.length ?? 1) - 1,
            },
            values,
          }]);
          toast.info(`Pasted ${values.length}×${values[0]?.length ?? 0} cells`);
        }).catch(() => {});
      }

      // Delete / Backspace — clear cell
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (event.colDef.field && event.colDef.field !== '__rowNum' && event.rowIndex !== null && event.rowIndex !== undefined) {
          onCellChange(`${event.colDef.field}${event.rowIndex + 1}`, '');
        }
      }
    },
    [sheet, onCellChange],
  );

  const handleGridReady = useCallback((event: GridReadyEvent) => {
    gridApiRef.current = event.api;
    // Auto-size columns to fit content on initial load
    setTimeout(() => {
      const allColIds = event.api.getColumns()
        ?.map((col) => col.getColId())
        .filter((id) => id !== '__rowNum') ?? [];
      if (allColIds.length > 0) {
        event.api.autoSizeColumns(allColIds);
      }
    }, 100);
  }, []);

  // Right-click context menu
  const gridContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = gridContainerRef.current;
    if (!container) return;
    const handler = (e: MouseEvent): void => {
      let target = e.target as HTMLElement | null;
      let colId: string | null = null;
      let rowIndex: number | null = null;
      while (target && target !== container) {
        const col = target.getAttribute('col-id');
        const rowEl = target.closest<HTMLElement>('[row-index]');
        if (col && rowEl) { colId = col; rowIndex = parseInt(rowEl.getAttribute('row-index') ?? '', 10); break; }
        target = target.parentElement;
      }
      if (!colId || colId === '__rowNum' || rowIndex === null || isNaN(rowIndex)) return;
      e.preventDefault();
      const cellRef = `${colId}${rowIndex + 1}`;
      setSelectedRange(cellRef);
      setCtxCellRef(cellRef);
      setCtxMenu({ x: e.clientX, y: e.clientY });
    };
    container.addEventListener('contextmenu', handler);
    return () => container.removeEventListener('contextmenu', handler);
  }, [setSelectedRange]);

  const handleCtxCopy = useCallback(() => {
    if (!ctxCellRef || !sheet) return;
    const cell = sheet.cells[ctxCellRef];
    const text = cell?.formula ?? String(cell?.computedValue ?? cell?.value ?? '');
    navigator.clipboard.writeText(text).catch(() => {});
  }, [ctxCellRef, sheet]);

  const handleCtxPaste = useCallback(() => {
    if (!ctxCellRef) return;
    navigator.clipboard.readText().then((text) => {
      if (text) onCellChange(ctxCellRef, text.trim());
    }).catch(() => {});
  }, [ctxCellRef, onCellChange]);

  const handleCtxClear = useCallback(() => {
    if (ctxCellRef) onCellChange(ctxCellRef, '');
  }, [ctxCellRef, onCellChange]);

  const updateColumnWidth = useWorkbookStore((s) => s.updateColumnWidth);
  const handleColumnResized = useCallback(
    (event: ColumnResizedEvent) => {
      if (!event.finished || !event.column || !sheet) return;
      const field = event.column.getColDef().field;
      if (!field || field === '__rowNum') return;
      updateColumnWidth(sheet.id, letterToColIndex(field), event.column.getActualWidth());
    },
    [sheet, updateColumnWidth],
  );

  const enableColumnVirtualization = classification === 'large' || classification === 'heavy';

  if (!sheet) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-4xl mb-2">📊</div>
          <p className="text-sm">No sheet selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ag-theme-alpine flex-1 w-full h-full" ref={gridContainerRef}>
      <AgGridReact
        ref={gridRef}
        columnDefs={columnDefs}
        rowData={rowData}
        onCellValueChanged={handleCellValueChanged}
        onCellClicked={handleCellClicked}
        onCellKeyDown={handleCellKeyDown}
        onGridReady={handleGridReady}
        onColumnResized={handleColumnResized}
        cellSelection={true}
        rowBuffer={20}
        suppressColumnVirtualisation={!enableColumnVirtualization}
        enableCellTextSelection={true}
        ensureDomOrder={true}
        undoRedoCellEditing={true}
        undoRedoCellEditingLimit={20}
        defaultColDef={{ resizable: true, suppressMovable: true }}
        getRowId={(params) => String(params.data.__rowNum)}
      />
      <GridContextMenu
        position={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onCopy={handleCtxCopy}
        onPaste={handleCtxPaste}
        onClear={handleCtxClear}
        cellRef={ctxCellRef}
      />
    </div>
  );
}
