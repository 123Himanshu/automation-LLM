'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  Download,
  Edit3,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { api, authCredentials } from '@/lib/api-client';
import { useDocxStore } from '@/stores/docx-store';

type ViewMode = 'docx' | 'edit' | 'find-replace';

interface ReplacementRow {
  id: string;
  find: string;
  replace: string;
}

export function DocxViewerPanel() {
  const {
    activeSession,
    activeSessionId,
    isRegenerating,
    isSavingContent,
    saveContent,
    regenerateDocx,
    docxVersion,
    lastRegenerateMessage,
  } = useDocxStore();

  const [viewMode, setViewMode] = useState<ViewMode>('docx');
  const [replacements, setReplacements] = useState<ReplacementRow[]>([
    { id: crypto.randomUUID(), find: '', replace: '' },
  ]);
  const [isApplying, setIsApplying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!activeSessionId) return;
    setViewMode('docx');
  }, [activeSessionId, docxVersion]);

  useEffect(() => {
    if (!lastRegenerateMessage) return;
    setStatusMessage(lastRegenerateMessage);
    const timeout = setTimeout(() => setStatusMessage(null), 5000);
    return () => clearTimeout(timeout);
  }, [lastRegenerateMessage]);

  if (!activeSession || !activeSessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-100 text-gray-400">
        <Eye className="mb-3 h-12 w-12 text-gray-300" />
        <p className="text-sm font-medium">No DOCX selected</p>
        <p className="mt-1 text-xs">Upload a DOCX to view it here</p>
      </div>
    );
  }

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/docx/sessions/${activeSessionId}/download`, {
        headers: { Authorization: `Basic ${authCredentials}` },
      });
      if (!res.ok) throw new Error('Download failed');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = activeSession.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      setStatusMessage('Download failed.');
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  const handleSaveAndRegenerate = async () => {
    const editor = document.getElementById('docx-editor-content');
    if (!editor) return;

    setStatusMessage('Applying style-preserving changes...');
    const html = editor.innerHTML;
    await saveContent(html);
    await regenerateDocx();
    await useDocxStore.getState().selectSession(activeSessionId);
    setViewMode('docx');
  };

  const addRow = () => {
    setReplacements((prev) => [...prev, { id: crypto.randomUUID(), find: '', replace: '' }]);
  };

  const removeRow = (id: string) => {
    setReplacements((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const updateRow = (id: string, field: 'find' | 'replace', value: string) => {
    setReplacements((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const applyReplacements = async () => {
    const valid = replacements.filter((row) => row.find.trim() !== '');
    if (valid.length === 0) {
      setStatusMessage('Enter at least one "Find" value.');
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsApplying(true);
    setStatusMessage(null);
    try {
      await api.replaceTextInDocx(
        activeSessionId,
        valid.map((row) => ({ find: row.find, replace: row.replace })),
      );
      await useDocxStore.getState().selectSession(activeSessionId);
      setStatusMessage('DOCX updated.');
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      console.error('Replace failed:', err);
      setStatusMessage('Replacement failed.');
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setIsApplying(false);
    }
  };

  const isBusy = isRegenerating || isSavingContent || isApplying;

  return (
    <div className="flex h-full flex-col bg-gray-100">
      <div className="flex items-center gap-1.5 border-b bg-white/90 px-3 py-2 backdrop-blur-sm">
        <FileText className="h-4 w-4 shrink-0 text-violet-500" />
        <h4 className="flex-1 truncate text-[11px] font-medium uppercase tracking-wider text-gray-500">
          {activeSession.fileName}
        </h4>

        <ToolbarBtn
          active={viewMode === 'docx'}
          onClick={() => setViewMode('docx')}
          icon={<Eye className="h-3.5 w-3.5" />}
          label="View DOCX"
        />
        <ToolbarBtn
          active={viewMode === 'edit'}
          onClick={() => setViewMode('edit')}
          icon={<Edit3 className="h-3.5 w-3.5" />}
          label="Edit"
        />
        <ToolbarBtn
          active={viewMode === 'find-replace'}
          onClick={() => setViewMode('find-replace')}
          icon={<Search className="h-3.5 w-3.5" />}
          label="Find & Replace"
        />

        <div className="mx-1 h-5 w-px bg-gray-200" />

        <button
          onClick={handleDownload}
          className="rounded-lg p-1.5 text-gray-500 transition-all hover:bg-gray-100"
          title="Download DOCX"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {statusMessage && (
        <div className="border-b bg-gray-50 px-4 py-1.5 text-xs text-gray-600">{statusMessage}</div>
      )}

      <div className="flex-1 overflow-hidden">
        {viewMode === 'docx' && (
          <div className="h-full overflow-y-auto bg-gray-200 p-4">
            <div className="prose prose-sm prose-gray mx-auto min-h-full max-w-3xl rounded-lg bg-white p-5 shadow">
              <div dangerouslySetInnerHTML={{ __html: activeSession.documentHtml || '<p>No content extracted.</p>' }} />
            </div>
          </div>
        )}

        {viewMode === 'edit' && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-3xl p-6">
              <div className="mb-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs text-amber-700">
                  <strong>Edit Mode</strong> - Changes are applied using style-preserving DOCX regeneration.
                </p>
                <button
                  onClick={handleSaveAndRegenerate}
                  disabled={isBusy}
                  className="ml-3 shrink-0 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-md transition-all hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50"
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
                      Save & Regenerate
                    </>
                  )}
                </button>
              </div>

              <div
                id="docx-editor-content"
                contentEditable
                suppressContentEditableWarning
                className="prose prose-sm prose-gray min-h-[500px] rounded-lg border-2 border-dashed border-amber-300 bg-white p-5 shadow-sm focus:outline-none"
                style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", lineHeight: 1.5, fontSize: '11pt' }}
                dangerouslySetInnerHTML={{ __html: activeSession.documentHtml || '<p>No content extracted.</p>' }}
              />
            </div>
          </div>
        )}

        {viewMode === 'find-replace' && (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-2xl space-y-4 p-6">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-violet-500" />
                <h3 className="text-lg font-semibold text-gray-700">Find & Replace in DOCX</h3>
              </div>
              <p className="text-sm text-gray-500">
                This updates text directly in the existing DOCX XML to preserve original style and structure.
              </p>

              <div className="space-y-2">
                {replacements.map((row, idx) => (
                  <div key={row.id} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-xs text-gray-400">{idx + 1}.</span>
                    <input
                      type="text"
                      placeholder="Find text..."
                      value={row.find}
                      onChange={(e) => updateRow(row.id, 'find', e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <span className="text-sm text-gray-300">{'->'}</span>
                    <input
                      type="text"
                      placeholder="Replace with..."
                      value={row.replace}
                      onChange={(e) => updateRow(row.id, 'replace', e.target.value)}
                      className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                    <button
                      onClick={() => removeRow(row.id)}
                      disabled={replacements.length <= 1}
                      className="rounded p-1.5 text-gray-300 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={addRow}
                  className="flex items-center gap-1 rounded-lg border bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                >
                  <Plus className="h-3 w-3" />
                  Add Row
                </button>
                <button
                  onClick={applyReplacements}
                  disabled={isApplying}
                  className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-md disabled:opacity-50"
                >
                  {isApplying ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-3.5 w-3.5" />
                      Apply Changes
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-xs text-blue-700">
                  Tip: For the strongest style preservation, prefer small targeted text edits.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
        active
          ? 'border-violet-300 bg-violet-100 text-violet-700'
          : 'border-transparent text-gray-500 hover:bg-gray-100'
      }`}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

