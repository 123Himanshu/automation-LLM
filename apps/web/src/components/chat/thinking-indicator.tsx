'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bot } from 'lucide-react';

/** Animated typing dots indicator shown while AI is generating */
export function ThinkingIndicator(): React.ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-3 px-4 py-3"
    >
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 ring-1 ring-violet-500/20">
        <Bot className="h-4 w-4 text-violet-400" />
      </div>
      <div className="flex items-center gap-1 pt-2">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-violet-400"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.2,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
