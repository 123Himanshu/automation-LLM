'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, SendHorizontal, Sparkles } from 'lucide-react';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { useDocxStore } from '@/stores/docx-store';

export function DocxChatPanel() {
  const { activeSession, activeSessionId, isChatLoading, sendMessage } = useDocxStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages]);

  const handleSend = () => {
    if (!input.trim() || isChatLoading || !activeSessionId) return;
    void sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-gray-50">
        <div className="max-w-md px-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100">
            <Sparkles className="h-8 w-8 text-violet-500" />
          </div>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">DOCX AI Assistant</h2>
          <p className="text-sm leading-relaxed text-gray-500">
            Upload a DOCX from the sidebar to start. You can ask questions, summarize content,
            rewrite sections, and update document text.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-gray-400">
            <div className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5">
              <FileText className="h-3.5 w-3.5" />
              &quot;Summarize this doc&quot;
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5">
              <FileText className="h-3.5 w-3.5" />
              &quot;Fix grammar&quot;
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5">
              <FileText className="h-3.5 w-3.5" />
              &quot;Rewrite intro&quot;
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border bg-white p-2.5">
              <FileText className="h-3.5 w-3.5" />
              &quot;Shorten section 2&quot;
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex items-center gap-2 border-b bg-white/80 px-4 py-3 backdrop-blur-sm">
        <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <h3 className="truncate text-sm font-medium text-gray-700">{activeSession.name}</h3>
        <span className="ml-auto text-xs text-gray-400">{activeSession.messages.length} messages</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {activeSession.messages.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">Send a message to start chatting about your DOCX.</p>
          </div>
        )}

        {activeSession.messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                msg.role === 'user'
                  ? 'rounded-br-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white'
                  : 'rounded-bl-md border border-gray-200 bg-white text-gray-800 shadow-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <MarkdownMessage content={msg.content || '...'} />
              ) : (
                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isChatLoading && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border bg-white px-4 py-3 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
              <span className="text-xs text-gray-400">Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t bg-white p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your DOCX..."
              className="min-h-[44px] max-h-[120px] w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm transition-all focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
              rows={1}
              disabled={isChatLoading}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || isChatLoading}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-900/20 transition-all hover:from-violet-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

