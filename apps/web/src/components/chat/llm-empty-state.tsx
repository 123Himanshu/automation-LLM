'use client';

import React from 'react';
import { Sparkles, FileText } from 'lucide-react';

const GENERAL_SUGGESTIONS = [
  'Explain how VLOOKUP works in Excel',
  'Write a Python script to merge two CSV files',
  'What is the difference between margin and padding?',
  'Help me write a professional email',
] as const;

const DOCUMENT_SUGGESTIONS = [
  'Summarize this document',
  'What are the key points?',
  'List all important dates mentioned',
  'What conclusions does the document draw?',
] as const;

interface LLMEmptyStateProps {
  onSuggestion: (text: string) => void;
  onUploadClick: () => void;
  document: { fileName: string } | null;
}

export function LLMEmptyState({ onSuggestion, onUploadClick, document: doc }: LLMEmptyStateProps): React.ReactNode {
  const suggestions = doc ? DOCUMENT_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100">
        <Sparkles className="h-8 w-8 text-violet-600" />
      </div>
      <h2 className="text-xl font-semibold text-slate-900">
        {doc ? `Chat about "${doc.fileName}"` : 'Ask anything'}
      </h2>
      <p className="mt-2 max-w-md text-center text-sm text-slate-500">
        {doc
          ? 'Your document is ready. Ask questions and I\'ll find answers from the relevant sections.'
          : 'I can help with coding, data analysis, writing, math, and more. Upload a PDF to ask questions about it.'}
      </p>

      {!doc && (
        <button
          onClick={onUploadClick}
          className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-8 py-5 transition-all hover:border-violet-300 hover:bg-violet-50/50"
          aria-label="Upload a PDF document"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100">
            <FileText className="h-5 w-5 text-violet-600" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-700">Upload a PDF</p>
            <p className="text-xs text-slate-400">Drag & drop or click · Max 20MB</p>
          </div>
        </button>
      )}

      <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
