import Link from 'next/link';
import { ArrowRight, FileSpreadsheet, FileText, Sparkles } from 'lucide-react';
import { LightPageShell } from '@/components/layout/light-page-shell';
import { Button } from '@/components/ui/button';

const workspaces = [
  {
    title: 'Excel Flow',
    description:
      'Create and edit spreadsheets with formula help, revision history, and AI-assisted operations.',
    href: '/excel',
    accent: 'from-blue-50 to-cyan-50 border-blue-200',
    icon: FileSpreadsheet,
    cta: 'Open Excel Workspace',
  },
  {
    title: 'PDF Workspace',
    description:
      'Upload PDF files, apply style-preserving edits, collaborate with AI, and regenerate downloadable files.',
    href: '/pdf',
    accent: 'from-indigo-50 to-sky-50 border-indigo-200',
    icon: FileText,
    cta: 'Open PDF Workspace',
  },
  {
    title: 'DOCX Workspace',
    description:
      'Edit DOCX files in real time, apply AI-assisted changes, and regenerate while preserving document styling.',
    href: '/docx',
    accent: 'from-cyan-50 to-emerald-50 border-cyan-200',
    icon: FileText,
    cta: 'Open DOCX Workspace',
  },
];

export default function HomePage() {
  return (
    <LightPageShell contentClassName="space-y-8 md:space-y-10">
      <section className="light-card relative overflow-hidden rounded-3xl p-6 sm:p-8 md:p-10">
        <div className="absolute -left-24 top-4 h-44 w-44 rounded-full bg-blue-100/70 blur-3xl" />
        <div className="absolute -right-20 bottom-[-30px] h-48 w-48 rounded-full bg-cyan-100/70 blur-3xl" />

        <div className="relative space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            <Sparkles className="h-3.5 w-3.5" />
            Unified AI Productivity Suite
          </div>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            One home for spreadsheet, PDF, and DOCX workflows
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Choose a workspace and continue instantly. Every workspace supports real-time editing,
            AI assistance, and export-ready outputs while preserving structure and formatting.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild className="h-10 rounded-xl px-4">
              <Link href="/excel">
                Start with Excel
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl border-slate-300 bg-white px-4">
              <Link href="/pdf">Go to PDF Workspace</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-xl border-slate-300 bg-white px-4">
              <Link href="/docx">Go to DOCX Workspace</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {workspaces.map((workspace) => {
          const Icon = workspace.icon;
          return (
            <article
              key={workspace.title}
              className={`light-card flex h-full flex-col rounded-2xl border bg-gradient-to-b ${workspace.accent} p-5`}
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/90 text-slate-800 shadow-sm">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{workspace.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{workspace.description}</p>
              <Button asChild variant="outline" className="mt-5 justify-between rounded-xl border-slate-300 bg-white">
                <Link href={workspace.href}>
                  {workspace.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </article>
          );
        })}
      </section>
    </LightPageShell>
  );
}
