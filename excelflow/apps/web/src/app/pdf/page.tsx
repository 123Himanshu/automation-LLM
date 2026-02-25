'use client';

import { WorkspaceTopNav } from '@/components/layout/workspace-top-nav';
import { PdfChatPanel } from '@/components/pdf/pdf-chat-panel';
import { PdfSidebar } from '@/components/pdf/pdf-sidebar';
import { PdfViewerPanel } from '@/components/pdf/pdf-viewer-panel';

export default function PdfWorkspacePage() {
  return (
    <div className="h-screen overflow-hidden bg-app-canvas">
      <WorkspaceTopNav />

      <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-slate-50">
        <div className="w-64 shrink-0">
          <PdfSidebar />
        </div>

        <div className="min-w-0 flex-1 border-r border-slate-200">
          <PdfChatPanel />
        </div>

        <div className="w-[480px] shrink-0 border-l border-slate-200">
          <PdfViewerPanel />
        </div>
      </div>
    </div>
  );
}
