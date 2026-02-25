'use client';

export function WorkbookSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading workbook">
      {/* Header skeleton */}
      <div className="flex h-14 items-center justify-between border-b bg-white px-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded bg-muted animate-pulse" />
          <div className="h-5 w-48 rounded bg-muted animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-20 rounded bg-muted animate-pulse" />
          <div className="h-8 w-20 rounded bg-muted animate-pulse" />
          <div className="h-8 w-20 rounded bg-muted animate-pulse" />
        </div>
      </div>

      {/* Formula bar skeleton */}
      <div className="flex h-8 items-center border-b px-2 gap-2">
        <div className="h-5 w-12 rounded bg-muted animate-pulse" />
        <div className="h-5 flex-1 rounded bg-muted animate-pulse" />
      </div>

      {/* Grid skeleton */}
      <div className="flex-1 p-1 overflow-hidden">
        <div className="grid grid-cols-8 gap-px h-full">
          {Array.from({ length: 80 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/30 animate-pulse rounded-sm"
              style={{ animationDelay: `${(i % 8) * 50}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Sheet tabs skeleton */}
      <div className="flex h-8 items-center border-t px-2 gap-2">
        <div className="h-5 w-20 rounded bg-muted animate-pulse" />
        <div className="h-5 w-20 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}
