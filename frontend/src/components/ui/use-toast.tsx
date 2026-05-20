import * as React from 'react';
import type { ToastProps } from './toast';

/**
 * Hook + store mínimo para toasts globais — inspirado no shadcn/ui.
 * Um único listener atualiza todos os consumidores. O <Toaster /> renderiza
 * os toasts ativos a partir do mesmo store.
 */

type ToastVariant = 'default' | 'destructive' | 'success';

export interface ToastInput {
  id?: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms — default 5s
}

export interface ToastRecord extends ToastInput {
  id: string;
  open: boolean;
}

type Listener = (toasts: ToastRecord[]) => void;

const TOAST_LIMIT = 4;
const DEFAULT_DURATION = 5000;

let memoryState: ToastRecord[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(memoryState);
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function add(toast: ToastInput): string {
  const id = toast.id ?? genId();
  const next: ToastRecord = { open: true, ...toast, id };
  memoryState = [next, ...memoryState].slice(0, TOAST_LIMIT);
  emit();
  const duration = toast.duration ?? DEFAULT_DURATION;
  if (duration > 0) {
    setTimeout(() => dismiss(id), duration);
  }
  return id;
}

function dismiss(id: string) {
  memoryState = memoryState.map((t) =>
    t.id === id ? { ...t, open: false } : t,
  );
  emit();
  // Remoção definitiva depois da animação de fechamento.
  setTimeout(() => {
    memoryState = memoryState.filter((t) => t.id !== id);
    emit();
  }, 250);
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastRecord[]>(memoryState);
  React.useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);
  return {
    toasts,
    toast: (input: ToastInput) => add(input),
    dismiss: (id: string) => dismiss(id),
  };
}

/** API imperativa para usar fora de componentes (axios interceptor, etc.). */
export const toast = (input: ToastInput) => add(input);

export type { ToastProps };
