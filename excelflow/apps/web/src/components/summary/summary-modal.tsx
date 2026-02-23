'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { useWorkbookStore } from '@/stores/workbook-store';
import { api } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import { BarChart3, Table2, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';

type SummaryMode = 'standard' | 'pivot';
type AggFn = 'count' | 'sum' | 'average' | 'min' | 'max';

const AGG_OPTIONS: Array<{ value: AggFn; label: string; icon: string }> = [
  { value: 'count', label: 'Count', icon: '#' },
  { value: 'sum', label: 'Sum', icon: 'Σ' },
  { value: 'average', label: 'Average', icon: 'x̄' },
  { value: 'min', label: 'Min', icon: '↓' },
  { value: 'max', label: 'Max', icon: '↑' },
];

export function SummaryModal() {
  const isOpen = useUIStore((s) => s.isSummaryModalOpen);
  const closeModal = useUIStore((s) => s.closeSummaryModal);
  const workbook = useWorkbookStore((s) => s.workbook);
  const activeSheetId = useWorkbookStore((s) => s.activeSheetId);

  const [isGenerating, setIsGenerating] = useState(false);
  const [scope, setScope] = useState<'active_sheet' | 'all_sheets'>('active_sheet');
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const [mode, setMode] = useState<SummaryMode>('standard');
  const [pivotRowField, setPivotRowField] = useState('');
  const [pivotColumnField, setPivotColumnField] = useState('');
  const [pivotValueField, setPivotValueField] = useState('');
  const [pivotAggregation, setPivotAggregation] = useState<AggFn>('count');

  useEffect(() => {
    if (!isOpen || !workbook) return;
    setLoadingColumns(true);
    setError(null);
    api
      .getSummaryColumns(workbook.id, activeSheetId ?? undefined)
      .then((res) => {
        const cols = res.data ?? [];
        setColumns(cols);
        setSelectedColumns([]);
        setPivotRowField('');
        setPivotColumnField('');
        setPivotValueField('');
      })
      .catch(() => setColumns([]))
      .finally(() => setLoadingColumns(false));
  }, [isOpen, workbook, activeSheetId]);

  const toggleColumn = useCallback((col: string) => {
    setSelectedColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col],
    );
  }, []);

  const selectAll = useCallback(() => setSelectedColumns(columns), [columns]);
  const deselectAll = useCallback(() => setSelectedColumns([]), []);

  const isPivotReady = mode === 'pivot' && pivotRowField && pivotColumnField && pivotValueField;

  const handleGenerate = useCallback(async () => {
    if (!workbook) return;
    setIsGenerating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        scope,
        activeSheet: activeSheetId ?? undefined,
        mode,
      };
      if (mode === 'standard') {
        body['selectedColumns'] = selectedColumns.length > 0 ? selectedColumns : undefined;
      } else {
        body['pivotRowField'] = pivotRowField;
        body['pivotColumnField'] = pivotColumnField;
        body['pivotValueField'] = pivotValueField;
        body['pivotAggregation'] = pivotAggregation;
      }
      await api.generateSummary(workbook.id, body as Parameters<typeof api.generateSummary>[1]);
      await useWorkbookStore.getState().refreshSheets();
      toast.success(mode === 'pivot' ? 'Pivot table created' : 'Summary generated');
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Summary generation failed');
    } finally {
      setIsGenerating(false);
    }
  }, [workbook, activeSheetId, scope, mode, selectedColumns, pivotRowField, pivotColumnField, pivotValueField, pivotAggregation, closeModal]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closeModal()}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            Quick Summary
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Generate AI-powered insights from your spreadsheet data
          </p>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-5 pt-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2" role="alert">
              <span className="shrink-0 mt-0.5">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {/* Mode cards */}
          <div className="grid grid-cols-2 gap-3" role="tablist" aria-label="Summary mode">
            <button
              role="tab"
              aria-selected={mode === 'standard'}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-150 ${
                mode === 'standard'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-muted/30'
              }`}
              onClick={() => setMode('standard')}
            >
              <BarChart3 className={`h-6 w-6 ${mode === 'standard' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">Standard Summary</span>
              <span className="text-[10px] text-muted-foreground text-center">Stats, counts, distributions</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === 'pivot'}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-150 ${
                mode === 'pivot'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-border hover:border-primary/30 hover:bg-muted/30'
              }`}
              onClick={() => setMode('pivot')}
            >
              <Table2 className={`h-6 w-6 ${mode === 'pivot' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium">Pivot Table</span>
              <span className="text-[10px] text-muted-foreground text-center">Cross-tabulate & aggregate</span>
            </button>
          </div>

          {/* Scope */}
          <div className="flex items-center gap-4 rounded-lg bg-muted/30 px-4 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">Scope:</span>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name="scope" value="active_sheet" checked={scope === 'active_sheet'} onChange={() => setScope('active_sheet')} className="accent-primary" />
              Active sheet
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name="scope" value="all_sheets" checked={scope === 'all_sheets'} onChange={() => setScope('all_sheets')} className="accent-primary" />
              All sheets
            </label>
          </div>

          {/* Standard mode: column selection */}
          {mode === 'standard' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium">
                  Columns
                  <span className="ml-1 text-muted-foreground font-normal">(none = AI auto-selects)</span>
                </span>
                {columns.length > 0 && (
                  <div className="flex gap-2 text-[10px]">
                    <button onClick={selectAll} className="text-primary hover:underline" aria-label="Select all columns">All</button>
                    <span className="text-muted-foreground">·</span>
                    <button onClick={deselectAll} className="text-primary hover:underline" aria-label="Deselect all columns">None</button>
                    <span className="text-muted-foreground ml-1">{selectedColumns.length}/{columns.length}</span>
                  </div>
                )}
              </div>
              {loadingColumns ? (
                <div className="flex items-center gap-2 py-4 justify-center text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading columns...
                </div>
              ) : columns.length === 0 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">No columns found</p>
              ) : (
                <div className="max-h-36 overflow-y-auto rounded-lg border p-1.5 space-y-0.5 bg-white" role="group" aria-label="Column selection">
                  {columns.map((col) => (
                    <label
                      key={col}
                      className={`flex items-center gap-2.5 text-xs cursor-pointer rounded-md px-2.5 py-1.5 transition-colors ${
                        selectedColumns.includes(col) ? 'bg-primary/5 text-foreground' : 'hover:bg-muted/50 text-muted-foreground'
                      }`}
                    >
                      <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        selectedColumns.includes(col) ? 'bg-primary border-primary' : 'border-border'
                      }`}>
                        {selectedColumns.includes(col) && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      <input type="checkbox" checked={selectedColumns.includes(col)} onChange={() => toggleColumn(col)} className="sr-only" aria-label={`Include column ${col}`} />
                      <span className="truncate">{col}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pivot mode: field selectors */}
          {mode === 'pivot' && (
            <div className="space-y-3">
              {loadingColumns ? (
                <div className="flex items-center gap-2 py-4 justify-center text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading columns...
                </div>
              ) : columns.length < 2 ? (
                <p className="text-xs text-muted-foreground py-3 text-center">Need at least 2 columns for a pivot table</p>
              ) : (
                <>
                  <PivotFieldSelect label="Row Field" hint="Group by" value={pivotRowField} onChange={setPivotRowField} columns={columns} excludeValues={[pivotColumnField, pivotValueField]} />
                  <PivotFieldSelect label="Column Field" hint="Spread across" value={pivotColumnField} onChange={setPivotColumnField} columns={columns} excludeValues={[pivotRowField, pivotValueField]} />
                  <PivotFieldSelect label="Value Field" hint="Aggregate" value={pivotValueField} onChange={setPivotValueField} columns={columns} excludeValues={[pivotRowField, pivotColumnField]} />
                  <div>
                    <span className="text-xs font-medium mb-2 block">Aggregation</span>
                    <div className="flex gap-1.5">
                      {AGG_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPivotAggregation(opt.value)}
                          className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg border py-2 text-xs transition-all ${
                            pivotAggregation === opt.value
                              ? 'border-primary bg-primary/5 text-primary font-medium shadow-sm'
                              : 'border-border hover:border-primary/30 text-muted-foreground'
                          }`}
                          aria-label={opt.label}
                        >
                          <span className="text-base font-mono">{opt.icon}</span>
                          <span>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Generate button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || (mode === 'pivot' && !isPivotReady)}
            className="w-full h-11 text-sm font-medium"
            size="lg"
          >
            {isGenerating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </span>
            ) : mode === 'pivot' ? (
              isPivotReady ? (
                <span className="flex items-center gap-2">
                  <Table2 className="h-4 w-4" />
                  Generate Pivot Table
                </span>
              ) : (
                'Select all 3 fields'
              )
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {selectedColumns.length > 0 ? `Summarize ${selectedColumns.length} column(s)` : 'AI Auto-Summary'}
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface PivotFieldSelectProps {
  label: string;
  hint: string;
  value: string;
  onChange: (val: string) => void;
  columns: string[];
  excludeValues: string[];
}

function PivotFieldSelect({ label, hint, value, onChange, columns, excludeValues }: PivotFieldSelectProps) {
  const available = columns.filter((c) => !excludeValues.includes(c));
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-1">
        <label className="text-xs font-medium">{label}</label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
        aria-label={label}
      >
        <option value="">— Select column —</option>
        {available.map((col) => (
          <option key={col} value={col}>{col}</option>
        ))}
      </select>
    </div>
  );
}
