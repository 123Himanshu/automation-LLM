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
import { motion, AnimatePresence } from 'framer-motion';
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
import { BrandLogo } from '@/components/ui/brand-logo';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';

function DocumentBadge(): React.ReactNode {
  const document = useLLMStore((s) => s.document);
  const removeDocument = useLLMStore((s) => s.removeDocument);
  if (!document) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-3xl items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-2 backdrop-blur"
    >
      <FileText className="h-4 w-4 shrink-0 text-violet-400" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-violet-200">{document.fileName}</p>
        <p className="text-[11px] text-violet-400/70">
          {document.pageCount} pages · {document.totalChunks} chunks · {Math.round(document.totalChars / 1000)}k chars
        </p>
      </div>
      <button
        onClick={() => void removeDocument()}
        className="rounded-lg p-1 text-violet-400/60 transition-colors hover:bg-violet-500/20 hover:text-violet-300"
        aria-label="Remove document"
        title="Remove document"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

/** Dark-themed top nav for the LLM chat page */
function LLMTopNav(): React.ReactNode {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="mr-1 inline-flex shrink-0 items-center gap-2 rounded-md">
          <BrandLogo size={32} />
          <span className="text-sm font-semibold tracking-tight text-slate-200">Private LLM</span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label="Main navigation">
          <Link href="/" className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
            Home
          </Link>
          <Link href="/excel" className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
            Excel Flow
          </Link>
          <Link href="/pdf" className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
            PDF
          </Link>
          <Link href="/docx" className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300">
            DOCX
          </Link>
          <span className="flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-3 py-1.5 text-xs font-medium text-indigo-400 ring-1 ring-indigo-500/20" aria-current="page">
            <Sparkles className="h-3 w-3" />
            AI Chat
          </span>
        </nav>
      </div>
    </header>
  );
}

/** Animated background blobs */
function AnimatedBackground(): React.ReactNode {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-violet-600/8 blur-3xl"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-32 top-1/4 h-80 w-80 rounded-full bg-indigo-600/8 blur-3xl"
        animate={{ x: [0, -25, 0], y: [0, 30, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-purple-600/6 blur-3xl"
        animate={{ x: [0, 20, 0], y: [0, -20, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
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

  useEffect(() => {
    if (initialHandled.current) return;
    const q = searchParams.get('q');
    if (q && messages.length === 0) {
      initialHandled.current = true;
      sendMessage(q);
    }
  }, [searchParams, messages.length, sendMessage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  useEffect(() => {
    function handleGlobalKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        clearChat();
      }
      if (e.key === 'Escape' && isLoading) stopGeneration();
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [clearChat, isLoading, stopGeneration]);

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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  }, [handleSubmit]);

  const handleSuggestion = useCallback((text: string): void => { sendMessage(text); }, [sendMessage]);

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
  const hasStreamingMsg = messages.some((m) => m.status === 'streaming');
  const showThinking = isLoading && !hasStreamingMsg;

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-violet-500/30 bg-slate-900/90 px-12 py-10 shadow-2xl"
            >
              <Upload className="h-10 w-10 text-violet-400" />
              <p className="text-lg font-medium text-white">Drop PDF here</p>
              <p className="text-sm text-slate-400">Upload a document to chat about it</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-3 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2 backdrop-blur"
                >
                  <span className="text-sm text-red-400">{error}</span>
                  <button
                    onClick={dismissError}
                    className="ml-2 rounded p-0.5 text-red-400/60 transition-colors hover:bg-red-500/20 hover:text-red-300"
                    aria-label="Dismiss error"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-white/10 py-4">
        {isUploading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-3 flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2"
          >
            <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
            <span className="text-sm text-violet-300">Processing PDF...</span>
          </motion.div>
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
                className="w-full resize-none rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-12 text-sm text-slate-200 placeholder:text-slate-500 backdrop-blur focus:border-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                style={{ maxHeight: '160px' }}
                aria-label="Chat message input"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-2.5 left-2.5 rounded-lg p-1.5 text-slate-500 transition-all hover:bg-white/10 hover:text-slate-300"
                aria-label="Upload PDF"
                title="Upload PDF for document Q&A"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {isLoading ? (
                <button
                  type="button"
                  onClick={stopGeneration}
                  className="absolute bottom-2.5 right-2.5 rounded-lg bg-red-500/80 p-1.5 text-white transition-all hover:bg-red-500"
                  aria-label="Stop generation"
                  title="Stop (Esc)"
                >
                  <Square className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="absolute bottom-2.5 right-2.5 rounded-lg bg-violet-600 p-1.5 text-white transition-all hover:bg-violet-500 disabled:opacity-30"
                  aria-label="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
            {messages.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                type="button"
                onClick={clearChat}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-slate-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                title="Clear chat (Ctrl+L)"
                aria-label="Clear chat history"
              >
                <Trash2 className="h-4 w-4" />
              </motion.button>
            )}
          </div>
        </form>
        <p className="mt-2 text-center text-[11px] text-slate-600">
          Private LLM · Drop a PDF to chat about it · Esc to stop · Ctrl+L to clear
        </p>
      </div>
    </div>
  );
}

export default function LLMPage(): React.ReactNode {
  return (
    <div className="relative min-h-screen bg-[#0a0a14]">
      <AnimatedBackground />
      <div className="relative z-10 flex h-screen flex-col">
        {/* Dark top nav for LLM page */}
        <LLMTopNav />
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
            </div>
          }
        >
          <LLMChat />
        </Suspense>
      </div>
    </div>
  );
}
