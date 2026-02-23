'use client';

import { memo, useCallback, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';

interface MarkdownMessageProps {
  content: string;
}

/** Copy-to-clipboard button for code blocks */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* clipboard unavailable */ });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 rounded-md bg-white/80 p-1.5 text-muted-foreground hover:bg-white hover:text-foreground transition-all opacity-0 group-hover:opacity-100"
      aria-label={copied ? 'Copied' : 'Copy code'}
      title={copied ? 'Copied!' : 'Copy'}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Collapsible details block for long content */
function CollapsibleBlock({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 rounded-lg border bg-muted/20">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {summary}
      </button>
      {open && <div className="px-3 pb-2">{children}</div>}
    </div>
  );
}

export const MarkdownMessage = memo(function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-msg text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ─── Code blocks with syntax highlighting ───
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? '');
            const codeString = String(children).replace(/\n$/, '');

            if (match) {
              return (
                <div className="group relative my-2 rounded-lg overflow-hidden border bg-[#fafafa]">
                  <div className="flex items-center justify-between bg-muted/50 px-3 py-1 border-b">
                    <span className="text-[10px] font-mono font-medium text-muted-foreground uppercase">{match[1]}</span>
                  </div>
                  <CopyButton text={codeString} />
                  <SyntaxHighlighter
                    style={oneLight}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      margin: 0,
                      padding: '12px',
                      fontSize: '12px',
                      background: 'transparent',
                      lineHeight: '1.5',
                    }}
                  >
                    {codeString}
                  </SyntaxHighlighter>
                </div>
              );
            }

            // Inline code
            return (
              <code
                className="rounded bg-muted/70 px-1.5 py-0.5 text-xs font-mono text-foreground"
                {...props}
              >
                {children}
              </code>
            );
          },

          // ─── Tables — scrollable, styled like Excel ───
          table({ children }) {
            return (
              <div className="my-3 overflow-x-auto rounded-lg border">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            );
          },
          thead({ children }) {
            return <thead className="bg-muted/60">{children}</thead>;
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-foreground border-b border-r last:border-r-0 whitespace-nowrap">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-1.5 text-xs text-foreground border-b border-r last:border-r-0 whitespace-nowrap">
                {children}
              </td>
            );
          },
          tr({ children }) {
            return <tr className="hover:bg-muted/30 transition-colors">{children}</tr>;
          },

          // ─── Headings ───
          h1({ children }) {
            return <h1 className="text-base font-bold mt-4 mb-2 text-foreground border-b pb-1">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-sm font-bold mt-3 mb-1.5 text-foreground">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-semibold mt-2.5 mb-1 text-foreground">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-xs font-semibold mt-2 mb-1 text-foreground uppercase tracking-wide">{children}</h4>;
          },

          // ─── Paragraphs ───
          p({ children }) {
            return <p className="my-1.5 leading-relaxed">{children}</p>;
          },

          // ─── Lists ───
          ul({ children }) {
            return <ul className="my-1.5 ml-4 space-y-0.5 list-disc marker:text-muted-foreground/50">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-1.5 ml-4 space-y-0.5 list-decimal marker:text-muted-foreground/60">{children}</ol>;
          },
          li({ children }) {
            return <li className="text-sm leading-relaxed pl-0.5">{children}</li>;
          },

          // ─── Blockquote ───
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-3 border-primary/30 bg-primary/5 rounded-r-lg pl-3 pr-2 py-2 text-sm italic text-muted-foreground">
                {children}
              </blockquote>
            );
          },

          // ─── Horizontal rule ───
          hr() {
            return <hr className="my-3 border-border/50" />;
          },

          // ─── Links ───
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
              >
                {children}
              </a>
            );
          },

          // ─── Strong / Bold ───
          strong({ children }) {
            return <strong className="font-semibold text-foreground">{children}</strong>;
          },

          // ─── Emphasis / Italic ───
          em({ children }) {
            return <em className="italic text-muted-foreground">{children}</em>;
          },

          // ─── Images ───
          img({ src, alt }) {
            return (
              <img
                src={src}
                alt={alt ?? ''}
                className="my-2 rounded-lg border max-w-full h-auto"
                loading="lazy"
              />
            );
          },

          // ─── Pre (wrapper for code blocks) ───
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
