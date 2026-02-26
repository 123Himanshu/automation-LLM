'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, RotateCcw, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { BrandLogo } from '@/components/ui/brand-logo';

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
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);

  const handleCopy = useCallback((): void => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable */ });
  }, [content]);

  const isUser = role === 'user';
  const isError = status === 'error';
  const isStreaming = status === 'streaming';

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' as const }}
        className="flex justify-end py-2"
      >
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600/90 px-4 py-2.5 text-[14.5px] leading-relaxed text-white shadow-lg shadow-indigo-500/10">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' as const }}
      className="group/msg py-3"
    >
      {/* Avatar + label row */}
      <div className="mb-2 flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-indigo-500/20">
          <BrandLogo size={16} />
        </div>
        <span className="text-[13px] font-medium text-slate-300">Private LLM</span>
        <span className="text-[11px] text-slate-600">{formatTime(timestamp)}</span>
      </div>

      {/* Content */}
      <div className="pl-[38px]">
        {isError && !content ? (
          <p className="text-sm text-red-400/80">Something went wrong generating a response.</p>
        ) : (
          <MarkdownMessage content={content} />
        )}

        {isStreaming && (
          <motion.span
            className="mt-1 inline-block h-5 w-[3px] rounded-full bg-indigo-400"
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}

        {/* Action bar — appears on hover like Claude/ChatGPT */}
        {!isStreaming && content && (
          <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity duration-200 group-hover/msg:opacity-100">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
              aria-label={copied ? 'Copied' : 'Copy message'}
              title={copied ? 'Copied!' : 'Copy'}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>

            {isLastAssistant && status === 'done' && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
                aria-label="Regenerate response"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}

            {isError && onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-red-400 transition-colors hover:bg-red-500/10"
                aria-label="Retry message"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
            )}

            <div className="mx-1 h-3 w-px bg-white/[0.06]" />

            <button
              onClick={() => setFeedback(feedback === 'up' ? null : 'up')}
              className={`rounded-lg p-1.5 transition-colors ${
                feedback === 'up'
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-600 hover:bg-white/[0.06] hover:text-slate-400'
              }`}
              aria-label="Good response"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setFeedback(feedback === 'down' ? null : 'down')}
              className={`rounded-lg p-1.5 transition-colors ${
                feedback === 'down'
                  ? 'bg-red-500/10 text-red-400'
                  : 'text-slate-600 hover:bg-white/[0.06] hover:text-slate-400'
              }`}
              aria-label="Bad response"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
