'use client';

import { useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/stores/ui-store';
import { useWorkbookStore } from '@/stores/workbook-store';
import {
  MessageSquare,
  Download,
  FileSpreadsheet,
  Undo2,
  Redo2,
} from 'lucide-react';

interface AppHeaderProps {
  workbookName?: string;
  classification?: string;
}

export function AppHeader({ workbookName, classification }: AppHeaderProps) {
  const toggleChat = useUIStore((s) => s.toggleChat);
  const openExportModal = useUIStore((s) => s.openExportModal);
  const isChatOpen = useUIStore((s) => s.isChatOpen);
  const canUndo = useWorkbookStore((s) => s.canUndo);
  const canRedo = useWorkbookStore((s) => s.canRedo);
  const undo = useWorkbookStore((s) => s.undo);
  const redo = useWorkbookStore((s) => s.redo);

  const handleToggleChat = useCallback(() => toggleChat(), [toggleChat]);
  const handleExport = useCallback(() => openExportModal(), [openExportModal]);
  const handleUndo = useCallback(() => undo(), [undo]);
  const handleRedo = useCallback(() => redo(), [redo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const classificationBadge = classification && classification !== 'normal' ? (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
      classification === 'heavy'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'
    }`}>
      {classification}
    </span>
  ) : null;

  return (
    <header className="flex h-12 items-center justify-between border-b bg-white px-3 shadow-sm" role="banner">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <FileSpreadsheet className="h-4.5 w-4.5 text-primary" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold truncate max-w-[200px]">
            {workbookName ?? 'ExcelFlow'}
          </h1>
          {classificationBadge}
        </div>
      </div>

      <nav className="flex items-center gap-1" aria-label="Workbook actions">
        {/* Edit group */}
        <div className="flex items-center rounded-lg bg-muted/40 p-0.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Undo (Ctrl+Z)"
            title="Undo (Ctrl+Z)"
            className="h-7 w-7"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRedo}
            disabled={!canRedo}
            aria-label="Redo (Ctrl+Y)"
            title="Redo (Ctrl+Y)"
            className="h-7 w-7"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mx-1 h-5 w-px bg-border" role="separator" />

        {/* Tools group */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          aria-label="Export workbook"
          title="Export"
          className="h-8 gap-1.5 text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>

        <div className="mx-1 h-5 w-px bg-border" role="separator" />

        {/* AI Chat toggle */}
        <Button
          variant={isChatOpen ? 'default' : 'ghost'}
          size="sm"
          onClick={handleToggleChat}
          aria-label="Toggle AI chat"
          title="AI Assistant"
          className={`h-8 gap-1.5 text-xs ${isChatOpen ? '' : ''}`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          AI Chat
        </Button>
      </nav>
    </header>
  );
}
