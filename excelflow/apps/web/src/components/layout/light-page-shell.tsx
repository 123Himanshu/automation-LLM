import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { WorkspaceTopNav } from '@/components/layout/workspace-top-nav';

interface LightPageShellProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}

export function LightPageShell({ children, className, contentClassName }: LightPageShellProps) {
  return (
    <div className={cn('min-h-screen bg-app-canvas', className)}>
      <WorkspaceTopNav />
      <main className={cn('mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-10', contentClassName)}>
        {children}
      </main>
    </div>
  );
}
