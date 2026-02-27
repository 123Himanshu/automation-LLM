'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Code2, Lightbulb, PenLine, ArrowUpRight } from 'lucide-react';
import { BrandLogo } from '@/components/ui/brand-logo';

const GENERAL_SUGGESTIONS = [
  { text: 'Explain how async/await works in JavaScript', icon: Code2, tag: 'Code' },
  { text: 'Write a Python function to parse CSV data', icon: Code2, tag: 'Code' },
  { text: 'Help me draft a professional project proposal', icon: PenLine, tag: 'Write' },
  { text: 'What are the best practices for REST API design?', icon: Lightbulb, tag: 'Learn' },
] as const;

const DOCUMENT_SUGGESTIONS = [
  { text: 'Summarize the key points of this document', icon: FileText, tag: 'Summary' },
  { text: 'What are the main conclusions?', icon: Lightbulb, tag: 'Analyze' },
  { text: 'List all important dates and deadlines', icon: FileText, tag: 'Extract' },
  { text: 'Explain the technical terms used', icon: Code2, tag: 'Explain' },
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
    transition: { staggerChildren: 0.06, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export function LLMEmptyState({ onSuggestion, onUploadClick, document: doc }: LLMEmptyStateProps): React.ReactNode {
  const suggestions = doc ? DOCUMENT_SUGGESTIONS : GENERAL_SUGGESTIONS;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex h-full flex-col items-center justify-center px-4 pb-8"
    >
      {/* Logo + greeting */}
      <motion.div variants={itemVariants} className="mb-2">
        <BrandLogo size={48} />
      </motion.div>

      <motion.h1
        variants={itemVariants}
        className="mt-4 bg-gradient-to-r from-slate-100 via-indigo-200 to-slate-100 bg-clip-text text-2xl font-semibold tracking-tight text-transparent"
      >
        {doc ? `Chat about your document` : 'How can I help you today?'}
      </motion.h1>

      <motion.p variants={itemVariants} className="mt-2 max-w-md text-center text-[14px] leading-relaxed text-slate-500">
        {doc
          ? `"${doc.fileName}" is loaded. Ask anything about it.`
          : 'I can help with coding, analysis, writing, and more.'}
      </motion.p>

      {/* Upload area — only when no doc */}
      {!doc && (
        <motion.button
          variants={itemVariants}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onUploadClick}
          className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-4 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/[0.04]"
          aria-label="Upload a PDF document"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10">
            <FileText className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="text-left">
            <p className="text-[13px] font-medium text-slate-300">Upload a PDF</p>
            <p className="text-[11px] text-slate-600">Drag & drop or click · Max 20MB</p>
          </div>
        </motion.button>
      )}

      {/* Suggestion cards */}
      <motion.div variants={itemVariants} className="mt-8 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestions.map((s) => {
          const Icon = s.icon;
          return (
            <motion.button
              key={s.text}
              whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.04)' }}
              whileTap={{ scale: 0.99 }}
              onClick={() => onSuggestion(s.text)}
              className="group/card flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-white/[0.12]"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover/card:text-indigo-400" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-snug text-slate-400 transition-colors group-hover/card:text-slate-200">{s.text}</p>
              </div>
              <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700 opacity-0 transition-all group-hover/card:text-slate-400 group-hover/card:opacity-100" />
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
