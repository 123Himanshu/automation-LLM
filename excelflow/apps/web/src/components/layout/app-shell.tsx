'use client';

import { ReactNode, useCallback, useRef, useEffect } from 'react';
import { useUIStore } from '@/stores/ui-store';

interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
  sidebar?: ReactNode;
}

export function AppShell({ header, children, sidebar }: AppShellProps) {
  const chatPanelWidth = useUIStore((s) => s.chatPanelWidth);
  const setChatPanelWidth = useUIStore((s) => s.setChatPanelWidth);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = chatPanelWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [chatPanelWidth],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent): void => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setChatPanelWidth(startWidth.current + delta);
    };

    const handleMouseUp = (): void => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setChatPanelWidth]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50/30">
      {header}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden" role="main">
          {children}
        </main>
        {sidebar && (
          <>
            {/* Resize handle */}
            <div
              className="w-1 cursor-col-resize bg-transparent hover:bg-primary/20 active:bg-primary/40 transition-colors flex-shrink-0 relative group"
              onMouseDown={handleMouseDown}
              role="separator"
              aria-label="Resize chat panel"
              title="Drag to resize"
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-border group-hover:bg-primary/40 transition-colors" />
            </div>
            <aside
              style={{ width: chatPanelWidth }}
              className="border-l bg-white shadow-sm animate-fade-in flex-shrink-0"
              role="complementary"
              aria-label="Side panel"
            >
              {sidebar}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
