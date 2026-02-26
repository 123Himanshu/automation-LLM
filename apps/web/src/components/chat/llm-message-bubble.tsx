'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
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
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`group flex gap-3 rounded-xl px-4 py-3 ${
        isUser ? 'bg-white/5' : ''
      }`}
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
          isUser
            ? 'bg-slate-700/60 text-slate-300'
            : 'bg-gradient-to-br from-violet-500/20 to-indigo-500/20 text-violet-400 ring-1 ring-violet-500/20'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        {isError && !content ? (
          <p className="text-sm italic text-red-400">Failed to generate response</p>
        ) : role === 'assistant' ? (
          <div className="dark-markdown">
            <MarkdownMessage content={content} />
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-sm text-slate-200">{content}</p>
        )}

        {isStreaming && (
          <motion.span
            className="inline-block h-4 w-1.5 rounded-sm bg-violet-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}

        <div className="mt-1 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="text-[10px] text-slate-500">{formatTime(timestamp)}</span>

          {role === 'assistant' && content && status !== 'streaming' && (
            <button
              onClick={handleCopy}
              className="rounded p-0.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
              aria-label={copied ? 'Copied' : 'Copy message'}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          )}

          {isError && onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-red-400 transition-colors hover:bg-red-500/10"
              aria-label="Retry message"
            >
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          )}

          {isLastAssistant && role === 'assistant' && status === 'done' && content && onRegenerate && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-500 transition-colors hover:bg-white/10 hover:text-slate-300"
              aria-label="Regenerate response"
            >
              <RefreshCw className="h-3 w-3" />
              Regenerate
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
