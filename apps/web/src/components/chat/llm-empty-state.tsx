'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, FileText, Code, BarChart3, PenLine } from 'lucide-react';

const GENERAL_SUGGESTIONS = [
  { text: 'Explain how VLOOKUP works in Excel', icon: BarChart3 },
  { text: 'Write a Python script to merge two CSV files', icon: Code },
  { text: 'What is the difference between margin and padding?', icon: Code },
  { text: 'Help me write a professional email', icon: PenLine },
] as const;

const DOCUMENT_SUGGESTIONS = [
  { text: 'Summarize this document', icon: FileText },
  { text: 'What are the key points?', icon: Sparkles },
  { text: 'List all important dates mentioned', icon: BarChart3 },
  { text: 'What conclusions does the document draw?', icon: PenLine },
] as const;

interface LLMEmptyStateProps {
  onSuggestion: (text: string) => void;
  onUploadClick: () => void;
  document: { fileName: string } | null;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export function LLMEmptyState({ onSuggestion, onUploadClick, document: doc }: LLMEmptyStateProps): React.ReactNode {
  const suggestions = doc ? DOCUMENT_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col items-center justify-center px-4"
    >
      <motion.div
        variants={itemVariants}
        className="relative mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 ring-1 ring-violet-500/20"
      >
        <Sparkles className="h-8 w-8 text-violet-400" />
        <div className="absolute -inset-1 animate-pulse rounded-2xl bg-violet-500/5" />
      </motion.div>

      <motion.h2 variants={itemVariants} className="text-xl font-semibold text-white">
        {doc ? `Chat about "${doc.fileName}"` : 'What can I help you with?'}
      </motion.h2>

      <motion.p variants={itemVariants} className="mt-2 max-w-md text-center text-sm text-slate-400">
        {doc
          ? 'Your document is ready. Ask questions and I\'ll find answers from the relevant sections.'
          : 'I can help with coding, data analysis, writing, math, and more. Upload a PDF to ask questions about it.'}
      </motion.p>

      {!doc && (
        <motion.button
          variants={itemVariants}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onUploadClick}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-8 py-5 backdrop-blur transition-colors hover:border-violet-500/30 hover:bg-white/10"
          aria-label="Upload a PDF document"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20">
            <FileText className="h-5 w-5 text-violet-400" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-200">Upload a PDF</p>
            <p className="text-xs text-slate-500">Drag & drop or click · Max 20MB</p>
          </div>
        </motion.button>
      )}

      <motion.div variants={itemVariants} className="mt-8 grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => {
          const Icon = s.icon;
          return (
            <motion.button
              key={s.text}
              whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.08)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSuggestion(s.text)}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-slate-300 backdrop-blur transition-colors"
            >
              <Icon className="h-4 w-4 shrink-0 text-slate-500" />
              <span>{s.text}</span>
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
