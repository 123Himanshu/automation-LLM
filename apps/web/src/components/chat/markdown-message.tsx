'use client';

import { memo, useCallback, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, ChevronDown, ChevronRight, Terminal } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
}

function CopyButton({ text }: { text: string }): React.ReactNode {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((): void => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable */ });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-slate-400 transition-all hover:bg-white/10 hover:text-slate-200"
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
      ) : (
        <><Copy className="h-3.5 w-3.5" /><span>Copy</span></>
      )}
    </button>
  );
}

function CollapsibleBlock({ summary, children }: { summary: string; children: ReactNode }): React.ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {summary}
      </button>
      {open && <div className="border-t border-white/5 px-4 pb-3 pt-2">{children}</div>}
    </div>
  );
}

const LANG_LABELS: Record<string, string> = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  tsx: 'TSX', jsx: 'JSX', py: 'Python', python: 'Python', rb: 'Ruby', ruby: 'Ruby',
  go: 'Go', rust: 'Rust', rs: 'Rust', java: 'Java', cpp: 'C++', c: 'C',
  cs: 'C#', csharp: 'C#', php: 'PHP', swift: 'Swift', kotlin: 'Kotlin',
  sql: 'SQL', html: 'HTML', css: 'CSS', scss: 'SCSS', json: 'JSON', yaml: 'YAML',
  yml: 'YAML', xml: 'XML', bash: 'Bash', sh: 'Shell', zsh: 'Shell',
  powershell: 'PowerShell', ps1: 'PowerShell', dockerfile: 'Dockerfile',
  graphql: 'GraphQL', markdown: 'Markdown', md: 'Markdown', prisma: 'Prisma',
};

function getLangLabel(lang: string): string {
  return LANG_LABELS[lang.toLowerCase()] ?? lang.toUpperCase();
}

export const MarkdownMessage = memo(function MarkdownMessage({ content }: MarkdownMessageProps): React.ReactNode {
  return (
    <div className="markdown-msg text-[14.5px] leading-[1.75]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '');
            const codeString = String(children).replace(/\n$/, '');

            if (match) {
              const lang = match[1] ?? '';
              return (
                <div className="group/code my-4 overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d1117]">
                  <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-4 py-2">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-3.5 w-3.5 text-slate-500" />
                      <span className="text-[11px] font-medium text-slate-500">{getLangLabel(lang)}</span>
                    </div>
                    <CopyButton text={codeString} />
                  </div>
                  <SyntaxHighlighter
                    style={oneDark}
                    language={lang}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      padding: '16px 20px',
                      fontSize: '13px',
                      background: 'transparent',
                      lineHeight: '1.6',
                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                    }}
                    codeTagProps={{ style: { fontFamily: 'inherit' } }}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              );
            }

            return (
              <code
                className="rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[13px] font-mono text-indigo-300"
                {...props}
              >
                {children}
              </code>
            );
          },

          table({ children }) {
            return (
              <div className="my-4 overflow-x-auto rounded-xl border border-white/[0.08]">
                <table className="w-full text-[13px] border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-white/[0.04]">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-4 py-2.5 text-left text-[12px] font-semibold text-slate-300 border-b border-white/[0.08] whitespace-nowrap">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-4 py-2 text-[13px] text-slate-400 border-b border-white/[0.04] whitespace-nowrap">
                {children}
              </td>
            );
          },
          tr({ children }) {
            return <tr className="transition-colors hover:bg-white/[0.02]">{children}</tr>;
          },

          h1({ children }) {
            return <h1 className="mt-6 mb-3 text-[18px] font-semibold text-slate-100 border-b border-white/[0.06] pb-2">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mt-5 mb-2.5 text-[16px] font-semibold text-slate-100">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mt-4 mb-2 text-[15px] font-semibold text-slate-200">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="mt-3 mb-1.5 text-[14px] font-medium text-slate-300">{children}</h4>;
          },

          p({ children }) {
            return <p className="my-2.5 leading-[1.75] text-slate-300">{children}</p>;
          },

          ul({ children }) {
            return <ul className="my-2.5 ml-1 space-y-1.5 list-none">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2.5 ml-1 space-y-1.5 list-none counter-reset-item">{children}</ol>;
          },
          li({ children }) {
            return (
              <li className="relative pl-6 text-[14.5px] leading-[1.75] text-slate-300 before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-indigo-400/50">
                {children}
              </li>
            );
          },

          blockquote({ children }) {
            return (
              <blockquote className="my-4 rounded-r-xl border-l-[3px] border-indigo-500/40 bg-indigo-500/[0.05] py-2 pl-4 pr-3 text-[14px] italic text-slate-400">
                {children}
              </blockquote>
            );
          },

          hr() {
            return <hr className="my-6 border-white/[0.06]" />;
          },

          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 underline decoration-indigo-400/30 underline-offset-2 transition-colors hover:text-indigo-300 hover:decoration-indigo-300/50"
              >
                {children}
              </a>
            );
          },

          strong({ children }) {
            return <strong className="font-semibold text-slate-100">{children}</strong>;
          },

          em({ children }) {
            return <em className="italic text-slate-400">{children}</em>;
          },

          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt ?? ''}
                className="my-3 rounded-xl border border-white/[0.08] max-w-full h-auto"
                loading="lazy"
              />
            );
          },

          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
