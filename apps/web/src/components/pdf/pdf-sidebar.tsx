'use client';

import { useEffect, useRef } from 'react';
import { FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { usePdfStore } from '@/stores/pdf-store';

export function PdfSidebar() {
  const { sessions, activeSessionId, isUploading, loadSessions, createSession, selectSession, deleteSession } =
    usePdfStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await createSession(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white text-slate-800">
      <div className="border-b border-slate-200 p-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:from-blue-500 hover:to-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              New PDF Chat
            </>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      <div className="scrollbar-thin flex-1 space-y-1 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
            <Upload className="mx-auto mb-3 h-9 w-9 text-slate-400" />
            <p className="text-sm font-medium text-slate-600">No PDFs yet</p>
            <p className="mt-1 text-xs text-slate-500">Upload a PDF to start chatting</p>
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition-colors ${
              activeSessionId === session.id
                ? 'border-blue-200 bg-blue-50 text-blue-900'
                : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50'
            }`}
            onClick={() => void selectSession(session.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && void selectSession(session.id)}
          >
            <FileText className="h-4 w-4 shrink-0 text-blue-600" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-xs text-slate-500">{session.fileName}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this session?')) void deleteSession(session.id);
              }}
              className="rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
              aria-label="Delete session"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200 p-3 text-center">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">PDF AI Workspace</p>
      </div>
    </aside>
  );
}
