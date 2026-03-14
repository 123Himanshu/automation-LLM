'use client';

import { memo, useCallback, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, ChevronDown, ChevronRight, Terminal } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
  variant?: 'light' | 'dark';
}

function CopyButton({ text, dark }: { text: string; dark: boolean }): React.ReactNode {
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
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-all ${
        dark
          ? 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? (
        <><Check className="h-3.5 w-3.5 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
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

export const MarkdownMessage = memo(function MarkdownMessage({ content, variant = 'light' }: MarkdownMessageProps): React.ReactNode {
  const d = variant === 'dark';

  return (
    <div className={`markdown-msg text-[14.5px] leading-[1.75] ${d ? 'text-slate-100' : 'text-slate-900'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '');
            const codeString = String(children).replace(/\n$/, '');

            if (match) {
              const lang = match[1] ?? '';
              return (
                <div className={`group/code my-4 overflow-hidden rounded-xl border ${
                  d ? 'border-white/[0.08] bg-[#0d1117]' : 'border-slate-200 bg-[#fafafa]'
                }`}>
                  <div className={`flex items-center justify-between border-b px-4 py-2 ${
                    d ? 'border-white/[0.06] bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Terminal className={`h-3.5 w-3.5 ${d ? 'text-slate-500' : 'text-slate-400'}`} />
                      <span className={`text-[11px] font-medium ${d ? 'text-slate-500' : 'text-slate-500'}`}>{getLangLabel(lang)}</span>
                    </div>
                    <CopyButton text={codeString} dark={d} />
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
                className={`rounded-md px-1.5 py-0.5 text-[13px] font-mono ${
                  d ? 'bg-white/[0.08] text-indigo-300' : 'bg-slate-100 text-indigo-600'
                }`}
                {...props}
              >
                {children}
              </code>
            );
          },

          table({ children }) {
            return (
              <div className={`my-4 overflow-x-auto rounded-xl border ${d ? 'border-white/[0.08]' : 'border-slate-200'}`}>
                <table className="w-full text-[13px] border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className={d ? 'bg-white/[0.04]' : 'bg-slate-50'}>{children}</thead>;
          },
          th({ children }) {
            return (
              <th className={`px-4 py-2.5 text-left text-[12px] font-semibold border-b whitespace-nowrap ${
                d ? 'text-slate-100 border-white/[0.08]' : 'text-slate-700 border-slate-200'
              }`}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className={`px-4 py-2 text-[13px] border-b whitespace-nowrap ${
                d ? 'text-slate-200 border-white/[0.04]' : 'text-slate-800 border-slate-100'
              }`}>
                {children}
              </td>
            );
          },
          tr({ children }) {
            return <tr className={`transition-colors ${d ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>{children}</tr>;
          },

          h1({ children }) {
            return <h1 className={`mt-6 mb-3 text-[18px] font-semibold border-b pb-2 ${
              d ? 'text-white border-white/[0.06]' : 'text-slate-900 border-slate-200'
            }`}>{children}</h1>;
          },
          h2({ children }) {
            return <h2 className={`mt-5 mb-2.5 text-[16px] font-semibold ${d ? 'text-white' : 'text-slate-900'}`}>{children}</h2>;
          },
          h3({ children }) {
            return <h3 className={`mt-4 mb-2 text-[15px] font-semibold ${d ? 'text-white' : 'text-slate-800'}`}>{children}</h3>;
          },
          h4({ children }) {
            return <h4 className={`mt-3 mb-1.5 text-[14px] font-medium ${d ? 'text-slate-100' : 'text-slate-700'}`}>{children}</h4>;
          },

          p({ children }) {
            return <p className={`my-2.5 leading-[1.75] ${d ? 'text-slate-100' : 'text-slate-900'}`}>{children}</p>;
          },

          ul({ children }) {
            return <ul className="my-2.5 ml-1 space-y-1.5 list-none">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-2.5 ml-1 space-y-1.5 list-none counter-reset-item">{children}</ol>;
          },
          li({ children }) {
            return (
              <li className={`relative pl-6 text-[14.5px] leading-[1.75] before:absolute before:left-0 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full ${
                d ? 'text-slate-100 before:bg-indigo-400/50' : 'text-slate-900 before:bg-indigo-500/40'
              }`}>
                {children}
              </li>
            );
          },

          blockquote({ children }) {
            return (
              <blockquote className={`my-4 rounded-r-xl border-l-[3px] py-2 pl-4 pr-3 text-[14px] italic ${
                d ? 'border-indigo-500/40 bg-indigo-500/[0.05] text-slate-200' : 'border-indigo-400/40 bg-indigo-50/50 text-slate-700'
              }`}>
                {children}
              </blockquote>
            );
          },

          hr() {
            return <hr className={`my-6 ${d ? 'border-white/[0.06]' : 'border-slate-200'}`} />;
          },

          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={`underline underline-offset-2 transition-colors ${
                  d ? 'text-indigo-400 decoration-indigo-400/30 hover:text-indigo-300' : 'text-indigo-600 decoration-indigo-600/30 hover:text-indigo-500'
                }`}
              >
                {children}
              </a>
            );
          },

          strong({ children }) {
            return <strong className={`font-semibold ${d ? 'text-slate-100' : 'text-slate-900'}`}>{children}</strong>;
          },

          em({ children }) {
            return <em className={`italic ${d ? 'text-slate-300' : 'text-slate-600'}`}>{children}</em>;
          },

          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt ?? ''}
                className={`my-3 rounded-xl border max-w-full h-auto ${d ? 'border-white/[0.08]' : 'border-slate-200'}`}
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
