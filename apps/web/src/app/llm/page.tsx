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
  ArrowUp,
  Loader2,
  Plus,
  Paperclip,
  FileText,
  X,
  Upload,
  Square,
  Sparkles,
} from 'lucide-react';
import { useLLMStore } from '@/stores/llm-store';
import { LLMEmptyState } from '@/components/chat/llm-empty-state';
import { LLMMessageBubble } from '@/components/chat/llm-message-bubble';
import { ThinkingIndicator } from '@/components/chat/thinking-indicator';
import { BrandLogo } from '@/components/ui/brand-logo';
import Link from 'next/link';

/** Document badge shown above messages when a PDF is loaded */
function DocumentBadge(): React.ReactNode {
  const document = useLLMStore((s) => s.document);
  const removeDocument = useLLMStore((s) => s.removeDocument);
  if (!document) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto flex max-w-2xl items-center gap-2.5 rounded-xl border border-indigo-500/15 bg-indigo-500/[0.06] px-4 py-2.5"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15">
        <FileText className="h-4 w-4 text-indigo-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-slate-200">{document.fileName}</p>
        <p className="text-[11px] text-slate-500">
          {document.pageCount} pages · {document.totalChunks} chunks
        </p>
      </div>
      <button
        onClick={() => void removeDocument()}
        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
        aria-label="Remove document"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
}

/** Minimal top nav */
function LLMTopNav(): React.ReactNode {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.04] bg-[#0a0a12]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-3 px-4">
        <Link href="/" className="inline-flex shrink-0 items-center gap-2">
          <BrandLogo size={28} />
          <span className="text-[13px] font-semibold text-slate-300">Private LLM</span>
        </Link>
        <div className="flex-1" />
        <nav className="flex items-center gap-0.5" aria-label="Main navigation">
          <Link href="/" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300">
            Home
          </Link>
          <Link href="/excel" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300">
            Excel
          </Link>
          <Link href="/pdf" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300">
            PDF
          </Link>
          <Link href="/docx" className="rounded-lg px-2.5 py-1.5 text-[12px] text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-300">
            DOCX
          </Link>
          <span className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-[12px] font-medium text-indigo-400 ring-1 ring-indigo-500/15" aria-current="page">
            <Sparkles className="h-3 w-3" />
            AI Chat
          </span>
        </nav>
      </div>
    </header>
  );
}

/** Subtle animated background */
function AnimatedBackground(): React.ReactNode {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-indigo-600/[0.04] blur-[100px]"
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-40 top-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/[0.04] blur-[100px]"
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
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
      if (e.key === 'l' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); clearChat(); }
      if (e.key === 'Escape' && isLoading) stopGeneration();
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [clearChat, isLoading, stopGeneration]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
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
  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-indigo-500/30 bg-[#0d0d1a]/95 px-14 py-12 shadow-2xl"
            >
              <Upload className="h-10 w-10 text-indigo-400" />
              <p className="text-lg font-medium text-white">Drop PDF here</p>
              <p className="text-sm text-slate-500">Upload a document to chat about it</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" onChange={handleFileInput} className="hidden" aria-hidden="true" />

      {/* Document badge */}
      {document && <div className="px-4 pt-3"><DocumentBadge /></div>}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin" role="log" aria-live="polite" aria-label="Chat messages">
        {isEmpty ? (
          <LLMEmptyState
            onSuggestion={handleSuggestion}
            onUploadClick={() => fileInputRef.current?.click()}
            document={document}
          />
        ) : (
          <div className="mx-auto max-w-2xl px-4 py-6">
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
                  className="mt-2 flex items-center justify-between rounded-xl border border-red-500/15 bg-red-500/[0.06] px-4 py-2.5"
                >
                  <span className="text-[13px] text-red-400">{error}</span>
                  <button onClick={dismissError} className="rounded-lg p-1 text-red-400/50 hover:bg-red-500/10 hover:text-red-300" aria-label="Dismiss error">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area — ChatGPT-style centered */}
      <div className="mx-auto w-full max-w-2xl px-4 pb-4 pt-2">
        {isUploading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-3 flex items-center gap-2 rounded-xl border border-indigo-500/15 bg-indigo-500/[0.06] px-4 py-2.5">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            <span className="text-[13px] text-indigo-300">Processing PDF...</span>
          </motion.div>
        )}
        <form onSubmit={handleSubmit} className="relative">
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-lg shadow-black/20 transition-colors focus-within:border-indigo-500/25 focus-within:bg-white/[0.04]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={document ? `Ask about "${document.fileName}"...` : 'Message Private LLM...'}
              rows={1}
              className="w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[14.5px] text-slate-200 placeholder:text-slate-600 focus:outline-none"
              style={{ maxHeight: '200px' }}
              aria-label="Chat message input"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                  aria-label="Upload PDF"
                  title="Upload PDF"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearChat}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                    title="New chat (Ctrl+L)"
                    aria-label="New chat"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <button
                    type="button"
                    onClick={stopGeneration}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-600 text-white transition-colors hover:bg-slate-500"
                    aria-label="Stop generation"
                    title="Stop (Esc)"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!canSend}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white transition-all hover:bg-indigo-500 disabled:bg-white/[0.06] disabled:text-slate-600"
                    aria-label="Send message"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
        <p className="mt-2.5 text-center text-[11px] text-slate-600">
          Private LLM can make mistakes. Verify important information.
        </p>
      </div>
    </div>
  );
}

export default function LLMPage(): React.ReactNode {
  return (
    <div className="relative min-h-screen bg-[#0a0a12]">
      <AnimatedBackground />
      <div className="relative z-10 flex h-screen flex-col">
        <LLMTopNav />
        <Suspense
          fallback={
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            </div>
          }
        >
          <LLMChat />
        </Suspense>
      </div>
    </div>
  );
}
