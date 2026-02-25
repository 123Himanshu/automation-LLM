'use client';

import { WorkspaceTopNav } from '@/components/layout/workspace-top-nav';
import { DocxChatPanel } from '@/components/docx/docx-chat-panel';
import { DocxSidebar } from '@/components/docx/docx-sidebar';
import { DocxViewerPanel } from '@/components/docx/docx-viewer-panel';

export default function DocxWorkspacePage() {
  return (
    <div className="h-screen overflow-hidden bg-app-canvas">
      <WorkspaceTopNav />

      <div className="flex h-[calc(100vh-56px)] w-full overflow-hidden bg-slate-50">
        <div className="w-64 shrink-0">
          <DocxSidebar />
        </div>

        <div className="min-w-0 flex-1 border-r border-slate-200">
          <DocxChatPanel />
        </div>

        <div className="w-[480px] shrink-0 border-l border-slate-200">
          <DocxViewerPanel />
        </div>
      </div>
    </div>
  );
}
