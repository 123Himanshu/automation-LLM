'use client';

import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

/**
 * Listens for 'api-validation-warning' CustomEvents dispatched by api-client.ts
 * when a Zod response validation fails. Shows a dev-facing toast so contract
 * drift between frontend schemas and backend responses is immediately visible.
 */
export function ApiWarningListener() {
  useEffect(() => {
    function handleWarning(e: Event): void {
      const detail = (e as CustomEvent).detail as
        | { issues: Array<{ path: unknown[]; message: string }> }
        | undefined;

      if (!detail?.issues?.length) return;

      const firstIssue = detail.issues[0];
      const path = Array.isArray(firstIssue?.path)
        ? firstIssue.path.join('.')
        : 'unknown';

      toast.error(
        `API contract mismatch at "${path}": ${firstIssue?.message ?? 'validation failed'}` +
        (detail.issues.length > 1 ? ` (+${detail.issues.length - 1} more)` : ''),
      );
    }

    window.addEventListener('api-validation-warning', handleWarning);
    return () => window.removeEventListener('api-validation-warning', handleWarning);
  }, []);

  return null;
}
