'use client';

import React, { Suspense, useRef, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Send, Loader2, Trash2, Bot, User, Sparkles } from 'lucide-react';
import { useLLMStore } from '@/stores/llm-store';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { LightPageShell } from '@/components/layout/light-page-shell';

const SUGGESTIONS = [
  'Explain how VLOOKUP works in Excel',
  'Write a Python script to merge two CSV files',
  'What is the difference between margin and padding?',
  'Help me write a professional email',
];

function LLMChat(): React.ReactNode {
  const { messages, isLoading, error, sendMessage, clearChat } = useLLMStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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

  const handleSubmit = (e?: FormEvent): void => {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    void sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestion = (text: string): void => {
    void sendMessage(text);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-6">
        {isEmpty ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100">
              <Sparkles className="h-8 w-8 text-violet-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Ask anything</h2>
            <p className="mt-2 max-w-md text-center text-sm text-slate-500">
              I can help with coding, data analysis, writing, math, and more.
            </p>
            <div className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSuggestion(s)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600 transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
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
                    <p className="text-sm text-slate-800 whitespace-pre-wrap">{msg.content}</p>
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
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2">
            <div className="relative flex-1">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."
                rows={1}
                className="w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
                style={{ maxHeight: '120px' }}
                aria-label="Chat message input"
              />
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
          Powered by GPT-4o. Responses may not always be accurate.
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
