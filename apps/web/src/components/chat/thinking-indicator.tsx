'use client';

import React from 'react';
import { Bot } from 'lucide-react';

/** Animated typing dots indicator shown while AI is generating */
export function ThinkingIndicator(): React.ReactNode {
  return (
    <div className="flex gap-3 px-3 py-3">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 text-violet-600">
        <Bot className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-1.5 pt-1.5">
        <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
