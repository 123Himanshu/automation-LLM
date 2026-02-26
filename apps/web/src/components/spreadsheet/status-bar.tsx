'use client';

import { useUIStore } from '@/stores/ui-store';
import { Loader2 } from 'lucide-react';

export function StatusBar() {
  const isSaving = useUIStore((s) => s.isSaving);
  const statusBarInfo = useUIStore((s) => s.statusBarInfo);

  return (
    <div
      className="flex h-6 items-center justify-between border-t bg-muted/30 px-3 text-[10px] text-muted-foreground select-none"
      role="status"
      aria-label="Status bar"
    >
      <div className="flex items-center gap-2">
        {isSaving && (
          <span className="flex items-center gap-1 text-primary">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        )}
        {!isSaving && <span>Ready</span>}
      </div>

      {statusBarInfo && statusBarInfo.count > 0 && (
        <div className="flex items-center gap-3 font-mono">
          <span>Count: {statusBarInfo.count}</span>
          {statusBarInfo.numCount > 0 && (
            <>
              <span>Sum: {formatNum(statusBarInfo.sum)}</span>
              <span>Avg: {formatNum(statusBarInfo.avg)}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatNum(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
