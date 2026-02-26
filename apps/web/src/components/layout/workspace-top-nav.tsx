'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Home',
    isActive: (pathname) => pathname === '/',
  },
  {
    href: '/excel',
    label: 'Excel Flow',
    isActive: (pathname) => pathname === '/excel' || pathname.startsWith('/workbook/'),
  },
  {
    href: '/pdf',
    label: 'PDF Workspace',
    isActive: (pathname) => pathname.startsWith('/pdf'),
  },
  {
    href: '/docx',
    label: 'DOCX Workspace',
    isActive: (pathname) => pathname.startsWith('/docx'),
  },
];

export function WorkspaceTopNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="mr-1 inline-flex shrink-0 items-center gap-2 rounded-md">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 to-cyan-100">
            <FileSpreadsheet className="h-4 w-4 text-blue-700" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900">ExcelFlow</span>
        </Link>

        <nav
          className="scrollbar-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          aria-label="Main navigation"
        >
          {navItems.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
