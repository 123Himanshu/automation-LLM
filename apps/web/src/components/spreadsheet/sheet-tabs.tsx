'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Sheet, Plus, Pencil, Trash2, X, Check } from 'lucide-react';

interface SheetTabsProps {
  sheets: Array<{ id: string; name: string }>;
  activeSheetId: string | null;
  onSelect: (sheetId: string) => void;
  onAddSheet?: () => void;
  onRenameSheet?: (sheetId: string, name: string) => void;
  onDeleteSheet?: (sheetId: string) => void;
}

export function SheetTabs({ sheets, activeSheetId, onSelect, onAddSheet, onRenameSheet, onDeleteSheet }: SheetTabsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [ctxMenuId, setCtxMenuId] = useState<string | null>(null);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback(
    (id: string) => () => onSelect(id),
    [onSelect],
  );

  const startRename = useCallback((id: string, currentName: string) => {
    setEditingId(id);
    setEditValue(currentName);
    setCtxMenuId(null);
    setCtxPos(null);
    setTimeout(() => inputRef.current?.select(), 50);
  }, []);

  const commitRename = useCallback(() => {
    if (editingId && editValue.trim() && onRenameSheet) {
      onRenameSheet(editingId, editValue.trim());
    }
    setEditingId(null);
  }, [editingId, editValue, onRenameSheet]);

  const handleDoubleClick = useCallback((id: string, name: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    startRename(id, name);
  }, [startRename]);

  const handleContextMenu = useCallback((id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenuId(id);
    setCtxPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxPos) return;
    const handler = (e: MouseEvent): void => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenuId(null);
        setCtxPos(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxPos]);

  return (
    <div
      className="flex h-9 items-center border-t bg-gradient-to-r from-muted/30 to-muted/50 px-2 gap-0.5 overflow-x-auto scrollbar-thin"
      role="tablist"
      aria-label="Sheet tabs"
    >
      <div className="flex h-7 w-7 items-center justify-center text-muted-foreground/50">
        <Sheet className="h-3.5 w-3.5" />
      </div>
      {sheets.map((sheet) => (
        <div key={sheet.id} className="relative">
          {editingId === sheet.id ? (
            <div className="flex items-center gap-0.5 h-7 bg-white border rounded-t-md px-1">
              <input
                ref={inputRef}
                className="w-20 h-5 text-xs px-1 border rounded outline-none focus:ring-1 focus:ring-primary"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onBlur={commitRename}
                aria-label="Rename sheet"
              />
              <button onClick={commitRename} className="p-0.5 text-green-600 hover:bg-green-50 rounded" aria-label="Confirm rename">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => setEditingId(null)} className="p-0.5 text-muted-foreground hover:bg-muted rounded" aria-label="Cancel rename">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <button
              role="tab"
              aria-selected={sheet.id === activeSheetId}
              className={cn(
                'relative h-7 rounded-t-md px-4 text-xs font-medium transition-all duration-150 whitespace-nowrap',
                sheet.id === activeSheetId
                  ? 'bg-white border border-b-0 text-foreground shadow-sm z-10'
                  : 'text-muted-foreground hover:bg-white/60 hover:text-foreground',
              )}
              onClick={handleSelect(sheet.id)}
              onDoubleClick={handleDoubleClick(sheet.id, sheet.name)}
              onContextMenu={handleContextMenu(sheet.id)}
            >
              {sheet.name}
              {sheet.id === activeSheetId && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          )}
        </div>
      ))}

      {onAddSheet && (
        <button
          onClick={onAddSheet}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/80 hover:text-foreground transition-colors"
          aria-label="Add new sheet"
          title="Add sheet"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex-1" />
      <span className="text-[10px] text-muted-foreground/50 pr-1">
        {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
      </span>

      {/* Context menu */}
      {ctxPos && ctxMenuId && (
        <div
          ref={ctxRef}
          className="fixed z-[100] min-w-[140px] rounded-lg border bg-white py-1 shadow-xl"
          style={{ top: ctxPos.y, left: ctxPos.x }}
          role="menu"
          aria-label="Sheet context menu"
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors"
            onClick={() => {
              const s = sheets.find((sh) => sh.id === ctxMenuId);
              if (s) startRename(s.id, s.name);
            }}
          >
            <Pencil className="h-3 w-3 text-muted-foreground" /> Rename
          </button>
          {sheets.length > 1 && onDeleteSheet && (
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/5 transition-colors"
              onClick={() => { onDeleteSheet(ctxMenuId); setCtxMenuId(null); setCtxPos(null); }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
