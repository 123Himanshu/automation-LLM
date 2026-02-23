'use client';

import { PdfSidebar } from '@/components/pdf/pdf-sidebar';
import { PdfChatPanel } from '@/components/pdf/pdf-chat-panel';
import { PdfViewerPanel } from '@/components/pdf/pdf-viewer-panel';

export default function PdfWorkspacePage() {
    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50">
            {/* LEFT SIDEBAR — Chat History */}
            <div className="w-64 shrink-0">
                <PdfSidebar />
            </div>

            {/* CENTER — Chat Panel */}
            <div className="flex-1 min-w-0 border-r border-gray-200">
                <PdfChatPanel />
            </div>

            {/* RIGHT — PDF Viewer / Editor */}
            <div className="w-[480px] shrink-0">
                <PdfViewerPanel />
            </div>
        </div>
    );
}
