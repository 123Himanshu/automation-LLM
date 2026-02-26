'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { BrandLogo } from '@/components/ui/brand-logo';

export function ThinkingIndicator(): React.ReactNode {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="py-3"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/20 to-violet-500/20 ring-1 ring-indigo-500/20">
          <BrandLogo size={16} />
        </div>
        <span className="text-[13px] font-medium text-slate-300">Private LLM</span>
      </div>
      <div className="flex items-center gap-2 pl-[38px]">
        <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-[7px] w-[7px] rounded-full bg-indigo-400/70"
              animate={{
                opacity: [0.3, 1, 0.3],
                scale: [0.85, 1.15, 0.85],
              }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                delay: i * 0.18,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
        <motion.span
          className="text-[13px] text-slate-500"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          Thinking...
        </motion.span>
      </div>
    </motion.div>
  );
}
