'use client';

import React, {
  Suspense,
  useRef,
  useEffect,
  useState,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
  type DragEvent,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Send,
  Loader2,
  Trash2,
  Bot,
  User,
  Sparkles,
  Paperclip,
  FileText,
  X,
  Upload,
} from 'lucide-react';
import { useLLMStore } from '@/stores/llm-store';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { LightPageShell } from '@/components/layout/light-page-shell';

const SUGGESTIONS = [
  'Explain how VLOOKUP works in Excel',
  'Write a Python script to merge two CSV files',
  'What is the difference between margin and padding?',
  'Help me write a professional email',
];

function DocumentBadge() {
  const document = useLLMStore((s) => s.document);
  const removeDocument = useLLMStore((s) => s.removeDocument);

  if (!document) return null;

  return (
    <div className="mx-auto flex max-w-3xl items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2">
      <FileText className="h-4 w-4 shrink-0 text-violet-600" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-violet-800">{document.fileName}</p>
        <p className="text-[11px] text-violet-500">
          {document.pageCount} pages · {document.totalChunks} chunks · {Math.round(document.totalChars / 1000)}k chars
        </p>
      </div>
      <button
        onClick={() => void removeDocument()}
        className="rounded-lg p-1 text-violet-400 transition-colors hover:bg-violet-100 hover:text-violet-600"
        aria-label="Remove document"
        title="Remove document"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function LLMChat(): React.ReactNode {
  const { messages, isLoading, error, sendMessage, clearChat } = useLLMStore();
  const document = useLLMStore((s) => s.document);
  const isUploading = useLLMStore((s) => s.isUploading);
  const uploadDocument = useLLMStore((s) => s.uploadDocument);
  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const initialHandled = useRef(false);

  useEffect(() => {
    if (initialHandled.current) return;
    const q = searchParams.get('q');
    if (q && messages.length === 0) {
      initialHandled.current = true;
      void sendMessage(q);
    }
  }, [searchParams, messages.length, sendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = useCallback((e?: FormEvent): void => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    void sendMessage(trimmed);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleSuggestion = useCallback((text: string): void => {
    void sendMessage(text);
  }, [sendMessage]);

  const handleFileSelect = useCallback((file: File): void => {
    if (file.type !== 'application/pdf') {
      useLLMStore.setState({ error: 'Only PDF files are supported.' });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      useLLMStore.setState({ error: 'File too large. Maximum size is 20MB.' });
      return;
    }
    void uploadDocument(file);
  }, [uploadDocument]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: DragEvent): void => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const isEmpty = messages.length === 0;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-violet-500/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-violet-400 bg-white/90 px-12 py-10 shadow-lg">
            <Upload className="h-10 w-10 text-violet-500" />
            <p className="text-lg font-medium text-violet-700">Drop PDF here</p>
            <p className="text-sm text-violet-400">Upload a document to chat about it</p>
          </div>
        </div>
      )}

      {/* Document badge */}
      {document && (
        <div className="pt-4">
          <DocumentBadge />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInput}
        className="hidden"
        aria-hidden="true"
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-6">
        {isEmpty ? (
          <EmptyState
            onSuggestion={handleSuggestion}
            onUploadClick={() => fileInputRef.current?.click()}
            document={document}
          />
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 rounded-xl px-3 py-3 ${
                  msg.role === 'user' ? 'bg-slate-50' : ''
                }`}
              >
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600'
                  }`}
                >
                  {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  {msg.role === 'assistant' ? (
                    <MarkdownMessage content={msg.content} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 px-3 py-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                  <span className="text-sm text-slate-400">Thinking...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mx-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-slate-200 bg-white/80 py-4 backdrop-blur">
        {isUploading && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <span className="text-sm text-violet-600">Processing PDF...</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={document ? `Ask about "${document.fileName}"...` : 'Ask anything...'}
                rows={1}
                className="w-full resize-none rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                style={{ maxHeight: '120px' }}
                aria-label="Chat message input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2.5 left-2.5 rounded-lg p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600"
                aria-label="Upload PDF"
                title="Upload PDF for document Q&A"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute bottom-2.5 right-2.5 rounded-lg bg-violet-600 p-1.5 text-white transition-all hover:bg-violet-700 disabled:opacity-40 disabled:hover:bg-violet-600"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="rounded-xl border border-slate-200 bg-white p-3 text-slate-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                title="Clear chat"
                aria-label="Clear chat history"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Powered by Groq AI · Drop a PDF to chat about it
        </p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  onSuggestion: (text: string) => void;
  onUploadClick: () => void;
  document: { fileName: string } | null;
}

function EmptyState({ onSuggestion, onUploadClick, document: doc }: EmptyStateProps) {
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

      {/* Upload area */}
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

      {/* Suggestion chips */}
      <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
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

export default function LLMPage(): React.ReactNode {
  return (
    <LightPageShell contentClassName="flex flex-col h-[calc(100vh-3.5rem)] p-0 sm:p-0 md:py-0">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        }
      >
        <LLMChat />
      </Suspense>
    </LightPageShell>
  );
}
