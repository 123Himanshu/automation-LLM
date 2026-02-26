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
  Paperclip,
  FileText,
  X,
  Upload,
  Square,
} from 'lucide-react';
import { useLLMStore } from '@/stores/llm-store';
import { LLMEmptyState } from '@/components/chat/llm-empty-state';
import { LLMMessageBubble } from '@/components/chat/llm-message-bubble';
import { ThinkingIndicator } from '@/components/chat/thinking-indicator';
import { LightPageShell } from '@/components/layout/light-page-shell';

function DocumentBadge(): React.ReactNode {
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
  const messages = useLLMStore((s) => s.messages);
  const isLoading = useLLMStore((s) => s.isLoading);
  const error = useLLMStore((s) => s.error);
  const document = useLLMStore((s) => s.document);
  const isUploading = useLLMStore((s) => s.isUploading);
  const sendMessage = useLLMStore((s) => s.sendMessage);
  const clearChat = useLLMStore((s) => s.clearChat);
  const stopGeneration = useLLMStore((s) => s.stopGeneration);
  const retryLastMessage = useLLMStore((s) => s.retryLastMessage);
  const regenerateLastResponse = useLLMStore((s) => s.regenerateLastResponse);
  const dismissError = useLLMStore((s) => s.dismissError);
  const uploadDocument = useLLMStore((s) => s.uploadDocument);

  const [input, setInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchParams = useSearchParams();
  const initialHandled = useRef(false);

  // Handle initial query from URL
  useEffect(() => {
    if (initialHandled.current) return;
    const q = searchParams.get('q');
    if (q && messages.length === 0) {
      initialHandled.current = true;
      sendMessage(q);
    }
  }, [searchParams, messages.length, sendMessage]);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-focus input after sending
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  // Keyboard shortcuts: Ctrl+L to clear, Escape to stop
  useEffect(() => {
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        clearChat();
      }
      if (e.key === 'Escape' && isLoading) {
        stopGeneration();
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [clearChat, isLoading, stopGeneration]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleSubmit = useCallback((e?: FormEvent): void => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    sendMessage(trimmed);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleSuggestion = useCallback((text: string): void => {
    sendMessage(text);
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

  const handleDragOver = useCallback((e: DragEvent): void => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: DragEvent): void => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: DragEvent): void => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const isEmpty = messages.length === 0;
  const lastAssistantIdx = messages.findLastIndex((m) => m.role === 'assistant');
  // Show thinking indicator only when loading and no streaming message exists
  const hasStreamingMsg = messages.some((m) => m.status === 'streaming');
  const showThinking = isLoading && !hasStreamingMsg;

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

      {document && <div className="pt-4"><DocumentBadge /></div>}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileInput}
        className="hidden"
        aria-hidden="true"
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-6" role="log" aria-live="polite" aria-label="Chat messages">
        {isEmpty ? (
          <LLMEmptyState
            onSuggestion={handleSuggestion}
            onUploadClick={() => fileInputRef.current?.click()}
            document={document}
          />
        ) : (
          <div className="space-y-1">
            {messages.map((msg, idx) => (
              <LLMMessageBubble
                key={msg.id}
                id={msg.id}
                role={msg.role}
                content={msg.content}
                timestamp={msg.timestamp}
                status={msg.status}
                isLast={idx === messages.length - 1}
                isLastAssistant={idx === lastAssistantIdx}
                onRetry={retryLastMessage}
                onRegenerate={regenerateLastResponse}
              />
            ))}

            {showThinking && <ThinkingIndicator />}

            {error && (
              <div className="mx-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2">
                <span className="text-sm text-red-600">{error}</span>
                <button
                  onClick={dismissError}
                  className="ml-2 rounded p-0.5 text-red-400 transition-colors hover:bg-red-100 hover:text-red-600"
                  aria-label="Dismiss error"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
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
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={document ? `Ask about "${document.fileName}"...` : 'Ask anything...'}
                rows={1}
                className="w-full resize-none rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                style={{ maxHeight: '160px' }}
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
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="absolute bottom-2.5 right-2.5 rounded-lg bg-red-500 p-1.5 text-white transition-all hover:bg-red-600"
                  aria-label="Stop generation"
                  title="Stop (Esc)"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="absolute bottom-2.5 right-2.5 rounded-lg bg-violet-600 p-1.5 text-white transition-all hover:bg-violet-700 disabled:opacity-40 disabled:hover:bg-violet-600"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearChat}
                className="rounded-xl border border-slate-200 bg-white p-3 text-slate-400 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                title="Clear chat (Ctrl+L)"
                aria-label="Clear chat history"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Powered by Groq AI · Drop a PDF to chat about it · Esc to stop · Ctrl+L to clear
        </p>
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
