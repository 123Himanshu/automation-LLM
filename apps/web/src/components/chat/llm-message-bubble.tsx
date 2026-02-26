'use client';

import React, { useCallback, useState } from 'react';
import { Bot, User, Copy, Check, RotateCcw, RefreshCw } from 'lucide-react';
import { MarkdownMessage } from '@/components/chat/markdown-message';

interface LLMMessageBubbleProps {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  status?: 'streaming' | 'done' | 'error';
  isLast: boolean;
  isLastAssistant: boolean;
  onRetry?: () => void;
  onRegenerate?: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function LLMMessageBubble({
  role,
  content,
  timestamp,
  status,
  isLastAssistant,
  onRetry,
  onRegenerate,
}: LLMMessageBubbleProps): React.ReactNode {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable */ });
  }, [content]);

  const isUser = role === 'user';
  const isError = status === 'error';
  const isStreaming = status === 'streaming';

  return (
    <div className={`group flex gap-3 rounded-xl px-3 py-3 ${isUser ? 'bg-slate-50' : ''}`}>
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
          isUser
            ? 'bg-slate-200 text-slate-600'
            : 'bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600'
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {/* Message content */}
        {isError && !content ? (
          <p className="text-sm italic text-red-400">Failed to generate response</p>
        ) : role === 'assistant' ? (
          <MarkdownMessage content={content} />
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-800">{content}</p>
        )}

        {/* Streaming cursor */}
        {isStreaming && (
          <span className="inline-block h-4 w-1.5 animate-pulse rounded-sm bg-violet-400" />
        )}

        {/* Footer: timestamp + action buttons */}
        <div className="mt-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[10px] text-slate-400">{formatTime(timestamp)}</span>

          {/* Copy button for assistant messages with content */}
          {role === 'assistant' && content && status !== 'streaming' && (
            <button
              onClick={handleCopy}
              className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label={copied ? 'Copied' : 'Copy message'}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          )}

          {/* Retry button on error */}
          {isError && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-500 transition-colors hover:bg-red-50"
              aria-label="Retry message"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}

          {/* Regenerate button on last assistant message */}
          {isLastAssistant && role === 'assistant' && status === 'done' && content && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              aria-label="Regenerate response"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
