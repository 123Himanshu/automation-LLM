'use client';

import { useEffect, useRef } from 'react';
import { usePdfStore } from '@/stores/pdf-store';
import { FileText, Plus, Trash2, Upload, Loader2 } from 'lucide-react';

export function PdfSidebar() {
    const {
        sessions,
        activeSessionId,
        isUploading,
        loadSessions,
        createSession,
        selectSession,
        deleteSession,
    } = usePdfStore();

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await createSession(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <aside className="flex flex-col h-full bg-gray-950 text-gray-100 border-r border-gray-800">
            {/* Header */}
            <div className="p-3 border-b border-gray-800">
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30"
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

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sessions.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                        <Upload className="h-10 w-10 text-gray-600 mb-3" />
                        <p className="text-sm text-gray-500 font-medium">No PDFs yet</p>
                        <p className="text-xs text-gray-600 mt-1">Upload a PDF to start chatting</p>
                    </div>
                )}

                {sessions.map((session) => (
                    <div
                        key={session.id}
                        className={`
              group flex items-center gap-2 p-2.5 rounded-lg cursor-pointer transition-all duration-150
              ${activeSessionId === session.id
                                ? 'bg-gray-800 text-white'
                                : 'text-gray-400 hover:bg-gray-900 hover:text-gray-200'
                            }
            `}
                        onClick={() => selectSession(session.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && selectSession(session.id)}
                    >
                        <FileText className="h-4 w-4 shrink-0 text-violet-400" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{session.name}</p>
                            <p className="text-xs text-gray-600 truncate">{session.fileName}</p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Delete this session?')) deleteSession(session.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/30 hover:text-red-400 transition-all"
                            aria-label="Delete session"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-gray-800 text-center">
                <p className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">PDF AI Workspace</p>
            </div>
        </aside>
    );
}
