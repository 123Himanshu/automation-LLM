'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormatActions } from '@/hooks/use-format-actions';
import {
  Copy,
  ClipboardPaste,
  Trash2,
  Bold,
  Italic,
  Merge,
  SplitSquareHorizontal,
  ArrowUpNarrowWide,
  ArrowDownNarrowWide,
  Plus,
  Minus,
} from 'lucide-react';

interface ContextMenuPosition {
  x: number;
  y: number;
}

interface GridContextMenuProps {
  position: ContextMenuPosition | null;
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onClear: () => void;
  cellRef: string | null;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

function MenuItem({ icon, label, shortcut, onClick, danger }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors ${
        danger
          ? 'text-destructive hover:bg-destructive/5'
          : 'text-foreground hover:bg-muted'
      }`}
    >
      <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-muted-foreground font-mono">{shortcut}</span>
      )}
    </button>
  );
}

function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

export function GridContextMenu({ position, onClose, onCopy, onPaste, onClear, cellRef }: GridContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    toggleBold, toggleItalic, mergeCells, unmergeCells,
    insertRows, deleteRows, insertCols, deleteCols,
    sortAsc, sortDesc,
  } = useFormatActions();

  // Close on outside click
  useEffect(() => {
    if (!position) return;
    const handler = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [position, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!position) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [position, onClose]);

  if (!position) return null;

  const wrap = (fn: () => void) => () => { fn(); onClose(); };

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[200px] rounded-lg border bg-white py-1 shadow-xl animate-fade-in"
      style={{ top: position.y, left: position.x }}
      role="menu"
      aria-label="Cell context menu"
    >
      {cellRef && (
        <div className="px-3 py-1 text-[10px] font-mono text-muted-foreground border-b mb-1">
          {cellRef}
        </div>
      )}

      <MenuItem icon={<Copy className="h-3.5 w-3.5" />} label="Copy" shortcut="Ctrl+C" onClick={wrap(onCopy)} />
      <MenuItem icon={<ClipboardPaste className="h-3.5 w-3.5" />} label="Paste" shortcut="Ctrl+V" onClick={wrap(onPaste)} />
      <MenuItem icon={<Trash2 className="h-3.5 w-3.5" />} label="Clear cell" shortcut="Del" onClick={wrap(onClear)} />

      <MenuSeparator />

      <MenuItem icon={<Bold className="h-3.5 w-3.5" />} label="Bold" shortcut="Ctrl+B" onClick={wrap(toggleBold)} />
      <MenuItem icon={<Italic className="h-3.5 w-3.5" />} label="Italic" shortcut="Ctrl+I" onClick={wrap(toggleItalic)} />

      <MenuSeparator />

      <MenuItem icon={<Merge className="h-3.5 w-3.5" />} label="Merge cells" onClick={wrap(mergeCells)} />
      <MenuItem icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />} label="Unmerge cells" onClick={wrap(unmergeCells)} />

      <MenuSeparator />

      <MenuItem icon={<Plus className="h-3.5 w-3.5" />} label="Insert row above" onClick={wrap(() => insertRows(1))} />
      <MenuItem icon={<Minus className="h-3.5 w-3.5" />} label="Delete row" onClick={wrap(() => deleteRows(1))} />
      <MenuItem icon={<Plus className="h-3.5 w-3.5" />} label="Insert column left" onClick={wrap(() => insertCols(1))} />
      <MenuItem icon={<Minus className="h-3.5 w-3.5" />} label="Delete column" onClick={wrap(() => deleteCols(1))} />

      <MenuSeparator />

      <MenuItem icon={<ArrowUpNarrowWide className="h-3.5 w-3.5" />} label="Sort A → Z" onClick={wrap(sortAsc)} />
      <MenuItem icon={<ArrowDownNarrowWide className="h-3.5 w-3.5" />} label="Sort Z → A" onClick={wrap(sortDesc)} />
    </div>
  );
}
