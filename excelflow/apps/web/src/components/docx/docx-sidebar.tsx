'use client';

import { useEffect, useRef } from 'react';
import { FileText, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { useDocxStore } from '@/stores/docx-store';

export function DocxSidebar() {
  const {
    sessions,
    activeSessionId,
    isUploading,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
  } = useDocxStore();

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
    <aside className="flex h-full flex-col border-r border-gray-800 bg-gray-950 text-gray-100">
      <div className="border-b border-gray-800 p-3">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-900/30 transition-all duration-200 hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isUploading ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading...
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New DOCX Chat
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          onChange={handleFileSelect}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            <Upload className="mb-3 h-10 w-10 text-gray-600" />
            <p className="text-sm font-medium text-gray-500">No DOCX files yet</p>
            <p className="mt-1 text-xs text-gray-600">Upload a DOCX to start chatting</p>
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.id}
            className={`group flex cursor-pointer items-center gap-2 rounded-lg p-2.5 transition-all duration-150 ${
              activeSessionId === session.id
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
            }`}
            onClick={() => void selectSession(session.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && void selectSession(session.id)}
          >
            <FileText className="h-4 w-4 shrink-0 text-violet-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-xs text-gray-600">{session.fileName}</p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this session?')) void deleteSession(session.id);
              }}
              className="rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-900/30 hover:text-red-400"
              aria-label="Delete session"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-800 p-3 text-center">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-600">DOCX AI Workspace</p>
      </div>
    </aside>
  );
}

