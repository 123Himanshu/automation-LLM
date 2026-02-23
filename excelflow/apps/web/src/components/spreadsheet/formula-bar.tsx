'use client';

import { useCallback, useRef, KeyboardEvent } from 'react';
import { useUIStore } from '@/stores/ui-store';
import { FunctionSquare } from 'lucide-react';

interface FormulaBarProps {
  onSubmit: (value: string) => void;
}

export function FormulaBar({ onSubmit }: FormulaBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRange = useUIStore((s) => s.selectedRange);
  const formulaBarValue = useUIStore((s) => s.formulaBarValue);
  const setFormulaBarValue = useUIStore((s) => s.setFormulaBarValue);

  const isFormula = formulaBarValue.startsWith('=');

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        onSubmit(formulaBarValue);
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
      }
    },
    [formulaBarValue, onSubmit],
  );

  return (
    <div className="flex h-9 items-center border-b bg-white px-2 gap-1.5">
      <div className="flex h-7 min-w-[70px] items-center justify-center rounded-md border bg-muted/50 px-2 text-xs font-mono font-semibold text-foreground select-none">
        {selectedRange ?? 'A1'}
      </div>
      <div className="flex h-7 w-7 items-center justify-center text-muted-foreground">
        <FunctionSquare className={`h-4 w-4 transition-colors ${isFormula ? 'text-primary' : ''}`} />
      </div>
      <input
        ref={inputRef}
        type="text"
        className={`flex-1 h-7 rounded-md border px-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all ${
          isFormula ? 'bg-blue-50/50 text-primary' : 'bg-white'
        }`}
        value={formulaBarValue}
        onChange={(e) => setFormulaBarValue(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Formula input"
        placeholder="Enter value or formula (=SUM, =AVERAGE, ...)"
      />
    </div>
  );
}
