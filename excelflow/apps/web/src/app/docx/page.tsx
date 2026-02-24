'use client';

import { DocxChatPanel } from '@/components/docx/docx-chat-panel';
import { DocxSidebar } from '@/components/docx/docx-sidebar';
import { DocxViewerPanel } from '@/components/docx/docx-viewer-panel';

export default function DocxWorkspacePage() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
      <div className="w-64 shrink-0">
        <DocxSidebar />
      </div>

      <div className="min-w-0 flex-1 border-r border-gray-200">
        <DocxChatPanel />
      </div>

      <div className="w-[480px] shrink-0">
        <DocxViewerPanel />
      </div>
    </div>
  );
}

