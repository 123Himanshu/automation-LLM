import { useCallback, useSyncExternalStore } from 'react';

interface ToastItem {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

type ToastListener = () => void;

const TOAST_LIMIT = 5;
const DEFAULT_DURATION = 5000;

let toasts: ToastItem[] = [];
let listeners: ToastListener[] = [];

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: ToastListener): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): ToastItem[] {
  return toasts;
}

function addToast(toast: Omit<ToastItem, 'id'>): string {
  const id = crypto.randomUUID();
  toasts = [{ ...toast, id }, ...toasts].slice(0, TOAST_LIMIT);
  emitChange();

  const duration = toast.duration ?? DEFAULT_DURATION;
  setTimeout(() => dismissToast(id), duration);

  return id;
}

function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emitChange();
}

export function useToast(): {
  toasts: ToastItem[];
  toast: (props: Omit<ToastItem, 'id'>) => string;
  dismiss: (id: string) => void;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const toast = useCallback((props: Omit<ToastItem, 'id'>): string => {
    return addToast(props);
  }, []);

  const dismiss = useCallback((id: string): void => {
    dismissToast(id);
  }, []);

  return { toasts: current, toast, dismiss };
}

/** Imperative toast — can be called outside React components */
export const toast = {
  success: (description: string): string =>
    addToast({ description, variant: 'default' }),
  error: (description: string): string =>
    addToast({ description, variant: 'destructive', duration: 8000 }),
  info: (description: string): string =>
    addToast({ description, variant: 'default' }),
};

export type { ToastItem };
