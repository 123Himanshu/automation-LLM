'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useWorkbookStore } from '@/stores/workbook-store';
import { useUIStore } from '@/stores/ui-store';
import { toast } from '@/hooks/use-toast';
import { Search, X, ChevronDown, ChevronUp, ArrowRightLeft } from 'lucide-react';

interface FindMatch {
  cellRef: string;
  value: string;
}

export function FindReplace() {
  const isFindOpen = useUIStore((s) => s.isFindOpen);
  const closeFind = useUIStore((s) => s.closeFind);
  const setSelectedRange = useUIStore((s) => s.setSelectedRange);

  const [searchText, setSearchText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isFindOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setMatches([]);
      setCurrentIdx(-1);
    }
  }, [isFindOpen]);

  const doSearch = useCallback(() => {
    if (!searchText.trim()) { setMatches([]); setCurrentIdx(-1); return; }
    const { sheets, activeSheetId } = useWorkbookStore.getState();
    const sheet = sheets.find((s) => s.id === activeSheetId);
    if (!sheet) return;

    const needle = caseSensitive ? searchText : searchText.toLowerCase();
    const found: FindMatch[] = [];
    for (const [ref, cell] of Object.entries(sheet.cells)) {
      const val = String(cell.computedValue ?? cell.value ?? '');
      const haystack = caseSensitive ? val : val.toLowerCase();
      if (haystack.includes(needle)) {
        found.push({ cellRef: ref, value: val });
      }
    }
    setMatches(found);
    setCurrentIdx(found.length > 0 ? 0 : -1);
    if (found.length > 0) setSelectedRange(found[0]!.cellRef);
    if (found.length === 0 && searchText.trim()) toast.info('No matches found');
  }, [searchText, caseSensitive, setSelectedRange]);

  // Search on Enter or text change
  useEffect(() => { doSearch(); }, [searchText, caseSensitive, doSearch]);

  const goNext = useCallback(() => {
    if (matches.length === 0) return;
    const next = (currentIdx + 1) % matches.length;
    setCurrentIdx(next);
    setSelectedRange(matches[next]!.cellRef);
  }, [matches, currentIdx, setSelectedRange]);

  const goPrev = useCallback(() => {
    if (matches.length === 0) return;
    const prev = (currentIdx - 1 + matches.length) % matches.length;
    setCurrentIdx(prev);
    setSelectedRange(matches[prev]!.cellRef);
  }, [matches, currentIdx, setSelectedRange]);

  const replaceOne = useCallback(() => {
    if (currentIdx < 0 || currentIdx >= matches.length) return;
    const match = matches[currentIdx]!;
    const { activeSheetId } = useWorkbookStore.getState();
    if (!activeSheetId) return;
    useWorkbookStore.getState().updateCell(activeSheetId, match.cellRef, replaceText);
    toast.info(`Replaced ${match.cellRef}`);
    // Re-search after replace
    setTimeout(doSearch, 400);
  }, [currentIdx, matches, replaceText, doSearch]);

  const replaceAll = useCallback(() => {
    if (matches.length === 0) return;
    const { activeSheetId, applyActions } = useWorkbookStore.getState();
    if (!activeSheetId) return;
    // Batch all replacements into a single action dispatch (avoids N re-renders + N API calls)
    const actions = matches.map((match) => ({
      type: 'SET_CELL' as const,
      sheetId: activeSheetId,
      cellRef: match.cellRef,
      value: replaceText,
    }));
    applyActions(actions, 'manual');
    toast.success(`Replaced ${matches.length} cell(s)`);
    setTimeout(doSearch, 500);
  }, [matches, replaceText, doSearch]);

  // Keyboard shortcut: Ctrl+F to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        useUIStore.getState().toggleFind();
      }
      if (e.key === 'Escape' && isFindOpen) closeFind();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isFindOpen, closeFind]);

  if (!isFindOpen) return null;

  return (
    <div className="absolute top-0 right-4 z-50 mt-1 w-80 rounded-lg border bg-white shadow-lg p-3 space-y-2 animate-fade-in">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-primary" />
          Find {showReplace && '& Replace'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Toggle replace"
            title="Toggle replace"
          >
            <ArrowRightLeft className="h-3 w-3" />
          </button>
          <button onClick={closeFind} className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors" aria-label="Close find">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search input */}
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          className="flex-1 h-7 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Find..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') goNext(); }}
          aria-label="Search text"
        />
        <button onClick={goPrev} className="p-1 rounded hover:bg-muted" aria-label="Previous match" disabled={matches.length === 0}>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={goNext} className="p-1 rounded hover:bg-muted" aria-label="Next match" disabled={matches.length === 0}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Match count + case toggle */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {matches.length > 0 ? `${currentIdx + 1} of ${matches.length}` : searchText ? 'No results' : ''}
        </span>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="h-3 w-3" />
          Match case
        </label>
      </div>

      {/* Replace section */}
      {showReplace && (
        <div className="space-y-1.5 pt-1 border-t">
          <input
            className="w-full h-7 rounded border px-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Replace with..."
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            aria-label="Replace text"
          />
          <div className="flex gap-1.5">
            <button
              onClick={replaceOne}
              disabled={currentIdx < 0}
              className="flex-1 h-6 rounded border text-[10px] font-medium hover:bg-muted transition-colors disabled:opacity-40"
            >
              Replace
            </button>
            <button
              onClick={replaceAll}
              disabled={matches.length === 0}
              className="flex-1 h-6 rounded border text-[10px] font-medium hover:bg-muted transition-colors disabled:opacity-40"
            >
              Replace All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
