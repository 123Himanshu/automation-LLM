'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import { useFormatActions } from '@/hooks/use-format-actions';
import type { Alignment } from '@excelflow/shared';
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Merge,
  SplitSquareHorizontal,
  ArrowUpNarrowWide,
  ArrowDownNarrowWide,
  Plus,
  Minus,
  Rows3,
  Columns3,
  Paintbrush,
  Type,
  ChevronDown,
  Hash,
  Search,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36] as const;

const NUMBER_FORMATS = [
  { label: 'General', value: '' },
  { label: 'Number (1,000.00)', value: '#,##0.00' },
  { label: 'Currency ($1,000.00)', value: '$#,##0.00' },
  { label: 'Percentage (10.00%)', value: '0.00%' },
  { label: 'Date (MM/DD/YYYY)', value: 'MM/DD/YYYY' },
  { label: 'Integer (1,000)', value: '#,##0' },
] as const;

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#EFEFEF', '#F3F3F3', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF', '#9900FF', '#FF00FF',
  '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3', '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC',
  '#DD7E6B', '#EA9999', '#F9CB9C', '#FFE599', '#B6D7A8', '#A2C4C9', '#A4C2F4', '#9FC5E8', '#B4A7D6', '#D5A6BD',
  '#CC4125', '#E06666', '#F6B26B', '#FFD966', '#93C47D', '#76A5AF', '#6D9EEB', '#6FA8DC', '#8E7CC3', '#C27BA0',
] as const;

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarButton({ icon, label, onClick, active, disabled }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}

interface ColorPickerProps {
  icon: React.ReactNode;
  label: string;
  currentColor: string;
  onSelect: (color: string) => void;
}

function ColorPicker({ icon, label, currentColor, onSelect }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-0.5 rounded px-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={label}
        title={label}
      >
        <span className="flex h-5 w-5 items-center justify-center">{icon}</span>
        <span className="h-1 w-4 rounded-sm" style={{ backgroundColor: currentColor }} />
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-lg border bg-white p-2 shadow-lg animate-fade-in">
          <div className="grid grid-cols-10 gap-0.5">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { onSelect(c); setOpen(false); }}
                className={`h-5 w-5 rounded-sm border transition-transform hover:scale-125 ${
                  c === currentColor ? 'ring-2 ring-primary ring-offset-1' : 'border-border/40'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FontSizeSelect({ onSelect }: { onSelect: (size: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('11');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback((size: number) => {
    setValue(String(size));
    onSelect(size);
    setOpen(false);
  }, [onSelect]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1 rounded border bg-white px-2 text-xs font-mono text-foreground hover:bg-muted transition-colors min-w-[48px]"
        aria-label="Font size"
        title="Font size"
      >
        {value}
        <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-white py-1 shadow-lg animate-fade-in">
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              onClick={() => handleSelect(s)}
              className={`w-full px-3 py-1 text-left text-xs hover:bg-muted transition-colors ${
                String(s) === value ? 'bg-primary/5 text-primary font-medium' : ''
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface StructuralMenuProps {
  icon: React.ReactNode;
  label: string;
  items: Array<{ label: string; onClick: () => void; icon?: React.ReactNode }>;
}

function StructuralMenu({ icon, label, items }: StructuralMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label={label}
        title={label}
      >
        <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-[160px] rounded-lg border bg-white py-1 shadow-lg animate-fade-in">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
            >
              {item.icon && <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const {
    toggleBold, toggleItalic, setAlignment, setFontSize,
    setFontColor, setBgColor, setNumberFormat, mergeCells, unmergeCells,
    insertRows, deleteRows, insertCols, deleteCols,
    sortAsc, sortDesc,
  } = useFormatActions();

  const toggleFind = useUIStore((s) => s.toggleFind);
  const [fontColor, setFontColorState] = useState('#000000');
  const [bgColor, setBgColorState] = useState('#FFFFFF');

  const handleFontColor = useCallback((c: string) => { setFontColorState(c); setFontColor(c); }, [setFontColor]);
  const handleBgColor = useCallback((c: string) => { setBgColorState(c); setBgColor(c); }, [setBgColor]);
  const handleAlign = useCallback((a: Alignment) => () => setAlignment(a), [setAlignment]);

  return (
    <div
      className="relative flex h-9 items-center border-b bg-white px-2 gap-0.5"
      role="toolbar"
      aria-label="Formatting toolbar"
    >
      {/* Font size */}
      <FontSizeSelect onSelect={setFontSize} />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Text formatting */}
      <ToolbarButton icon={<Bold className="h-3.5 w-3.5" />} label="Bold (Ctrl+B)" onClick={toggleBold} />
      <ToolbarButton icon={<Italic className="h-3.5 w-3.5" />} label="Italic (Ctrl+I)" onClick={toggleItalic} />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Number format */}
      <StructuralMenu
        icon={<Hash className="h-3.5 w-3.5" />}
        label="Number format"
        items={NUMBER_FORMATS.map((f) => ({
          label: f.label,
          onClick: () => setNumberFormat(f.value),
        }))}
      />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Colors */}
      <ColorPicker icon={<Type className="h-3.5 w-3.5" />} label="Font color" currentColor={fontColor} onSelect={handleFontColor} />
      <ColorPicker icon={<Paintbrush className="h-3.5 w-3.5" />} label="Fill color" currentColor={bgColor} onSelect={handleBgColor} />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Alignment */}
      <ToolbarButton icon={<AlignLeft className="h-3.5 w-3.5" />} label="Align left" onClick={handleAlign('left')} />
      <ToolbarButton icon={<AlignCenter className="h-3.5 w-3.5" />} label="Align center" onClick={handleAlign('center')} />
      <ToolbarButton icon={<AlignRight className="h-3.5 w-3.5" />} label="Align right" onClick={handleAlign('right')} />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Merge */}
      <ToolbarButton icon={<Merge className="h-3.5 w-3.5" />} label="Merge cells" onClick={mergeCells} />
      <ToolbarButton icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />} label="Unmerge cells" onClick={unmergeCells} />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Sort */}
      <ToolbarButton icon={<ArrowUpNarrowWide className="h-3.5 w-3.5" />} label="Sort A→Z" onClick={sortAsc} />
      <ToolbarButton icon={<ArrowDownNarrowWide className="h-3.5 w-3.5" />} label="Sort Z→A" onClick={sortDesc} />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Rows & Columns */}
      <StructuralMenu
        icon={<Rows3 className="h-3.5 w-3.5" />}
        label="Rows"
        items={[
          { label: 'Insert row above', onClick: () => insertRows(1), icon: <Plus className="h-3 w-3" /> },
          { label: 'Delete row', onClick: () => deleteRows(1), icon: <Minus className="h-3 w-3" /> },
        ]}
      />
      <StructuralMenu
        icon={<Columns3 className="h-3.5 w-3.5" />}
        label="Columns"
        items={[
          { label: 'Insert column left', onClick: () => insertCols(1), icon: <Plus className="h-3 w-3" /> },
          { label: 'Delete column', onClick: () => deleteCols(1), icon: <Minus className="h-3 w-3" /> },
        ]}
      />

      <div className="mx-1 h-5 w-px bg-border" role="separator" />

      {/* Find */}
      <ToolbarButton icon={<Search className="h-3.5 w-3.5" />} label="Find & Replace (Ctrl+F)" onClick={toggleFind} />
    </div>
  );
}
