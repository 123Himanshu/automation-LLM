'use client';

import { useCallback, useRef, useState, useEffect, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useChatStore } from '@/stores/chat-store';
import { useWorkbookStore } from '@/stores/workbook-store';
import { useUIStore } from '@/stores/ui-store';
import { MarkdownMessage } from './markdown-message';
import { buildSummaryPrompt } from '@/lib/summary-prompt-builder';
import { Send, X, Trash2, Sparkles, Bot, User, BarChart3, ShieldAlert, Check, XCircle } from 'lucide-react';

const SUGGESTIONS = [
  'Summarize this sheet',
  'Find duplicate rows',
  'Calculate column totals',
  'Sort by highest value',
  'Create a pivot table',
  'Highlight missing data',
] as const;

export function ChatPanel() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const clearMessages = useChatStore((s) => s.clearMessages);
  const pendingConfirmation = useChatStore((s) => s.pendingConfirmation);
  const confirmAction = useChatStore((s) => s.confirmAction);
  const rejectAction = useChatStore((s) => s.rejectAction);
  const workbook = useWorkbookStore((s) => s.workbook);
  const sheets = useWorkbookStore((s) => s.sheets);
  const activeSheetId = useWorkbookStore((s) => s.activeSheetId);
  const selectedRange = useUIStore((s) => s.selectedRange);
  const toggleChat = useUIStore((s) => s.toggleChat);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || !workbook || !activeSheetId) return;
    setInput('');
    await sendMessage(workbook.id, msg, activeSheetId, selectedRange ?? undefined);
  }, [input, workbook, activeSheetId, selectedRange, sendMessage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => () => handleSend(suggestion),
    [handleSend],
  );

  const handleQuickSummary = useCallback(() => {
    const activeSheet = sheets.find((s) => s.id === activeSheetId);
    if (!activeSheet) return;
    const prompt = buildSummaryPrompt(activeSheet);
    setInput(prompt);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [sheets, activeSheetId]);

  const handleConfirm = useCallback(() => {
    if (!workbook) return;
    confirmAction(workbook.id);
  }, [workbook, confirmAction]);

  const handleReject = useCallback(() => {
    rejectAction();
  }, [rejectAction]);

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-50/50 to-white">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b bg-white px-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-semibold">AI Assistant</span>
            <span className="ml-2 text-[10px] text-emerald-600 font-medium">● Online</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearMessages}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Clear chat history"
              title="Clear chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={toggleChat}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4" role="log" aria-label="Chat messages">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-6 px-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-sm font-semibold mb-1">How can I help?</h3>
            <p className="text-xs text-muted-foreground text-center mb-5 max-w-[220px]">
              I can analyze your data, create formulas, build summaries, and more.
            </p>
            <div className="w-full space-y-2">
              {/* Quick Summary — featured action */}
              <button
                onClick={handleQuickSummary}
                disabled={isLoading || !activeSheetId}
                className="w-full flex items-center gap-3 rounded-xl border-2 border-primary/20 bg-primary/5 px-3 py-3 text-left hover:bg-primary/10 hover:border-primary/40 transition-all duration-150 disabled:opacity-50"
                aria-label="Quick Summary — auto-generate summary prompt"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <BarChart3 className="h-4.5 w-4.5 text-primary" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-foreground">Quick Summary</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Auto-analyze your sheet and generate a detailed summary prompt
                  </p>
                </div>
              </button>

              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-1">Or try asking</p>
              <div className="grid grid-cols-1 gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={handleSuggestion(s)}
                    disabled={isLoading}
                    className="text-left rounded-lg border border-border/60 bg-white px-3 py-2 text-xs text-foreground hover:bg-primary/5 hover:border-primary/30 transition-all duration-150 disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}>
                {msg.role === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-md'
                  : 'bg-white border shadow-sm rounded-tl-md'
              }`}>
                {msg.role === 'assistant' ? (
                  <MarkdownMessage content={msg.content} />
                ) : (
                  <span className="whitespace-pre-wrap">{msg.content}</span>
                )}
                <div className={`mt-1 text-[10px] ${
                  msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                }`}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl rounded-tl-md bg-white border shadow-sm px-4 py-3">
              <div className="flex gap-1.5" aria-label="AI is thinking">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t bg-white p-3">
        {/* AI Confirmation Banner */}
        {pendingConfirmation && (
          <div className="mb-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-800">Confirmation Required</span>
            </div>
            {pendingConfirmation.toolCall.plan.length > 0 && (
              <ul className="mb-2 space-y-0.5">
                {pendingConfirmation.toolCall.plan.map((step, i) => (
                  <li key={i} className="text-[11px] text-amber-700">• {step}</li>
                ))}
              </ul>
            )}
            <div className="text-[10px] text-amber-600 mb-2">
              {pendingConfirmation.toolCall.estimatedImpact.cellsAffected} cell(s) affected
              {pendingConfirmation.toolCall.estimatedImpact.overwritesData && ' · overwrites existing data'}
              {pendingConfirmation.toolCall.estimatedImpact.createsNewSheet && ' · creates new sheet'}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleConfirm}
                disabled={isLoading}
                className="h-7 gap-1 text-xs"
                aria-label="Confirm AI action"
              >
                <Check className="h-3 w-3" /> Apply
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleReject}
                disabled={isLoading}
                className="h-7 gap-1 text-xs"
                aria-label="Reject AI action"
              >
                <XCircle className="h-3 w-3" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Context indicators */}
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          {selectedRange && (
            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <span className="font-mono font-medium">{selectedRange}</span>
              selected
            </span>
          )}
          {input.length > 50 && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
              Review prompt below — press Enter to send
            </span>
          )}
        </div>

        {/* Quick Summary button — always visible in input area */}
        <div className="mb-2 flex gap-1.5">
          <button
            onClick={handleQuickSummary}
            disabled={isLoading || !activeSheetId}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            aria-label="Quick Summary"
            title="Auto-generate a summary prompt from the active sheet"
          >
            <BarChart3 className="h-3 w-3" />
            Quick Summary
          </button>
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none rounded-xl border bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data..."
            aria-label="Chat message input"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            className="h-10 w-10 rounded-xl shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/60 text-center">
          Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
