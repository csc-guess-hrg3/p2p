import { type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency, formatDate } from '@/lib/format';

/**
 * Dialog reutilizável de detalhe pra qualquer entidade financeira
 * (ITP, IAD, Provisão, DDA). Recebe um `record` genérico + um array
 * de seções com os campos a renderizar. Mantém a lógica de
 * formatação centralizada (currency / date / fallback "—").
 */
export interface DetailField {
  /** Label do campo (português, sem código). */
  label: string;
  /** Valor literal OU função que extrai do record. */
  value: ReactNode | ((r: Record<string, unknown>) => ReactNode);
  /** Hint pra renderizar — currency/date/text. Default: text. */
  kind?: 'currency' | 'date' | 'text';
  /** Span de colunas (1-3). Default: 1. */
  cols?: 1 | 2 | 3;
}

export interface DetailSection {
  title: string;
  fields: DetailField[];
}

interface Props<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Subtítulo (ex.: nº lançamento, fornecedor). */
  subtitle?: string;
  record: T | null;
  sections: DetailSection[];
  /** Conteúdo livre adicional após as seções de campos — usado pra
      tabelas relacionadas (parcelas, itens, movs etc.). */
  footer?: ReactNode;
}

function render(
  field: DetailField,
  record: Record<string, unknown>,
): ReactNode {
  const raw =
    typeof field.value === 'function'
      ? field.value(record)
      : field.value;
  if (raw === undefined || raw === null || raw === '') return '—';
  if (field.kind === 'currency') {
    return formatCurrency(raw as number | string);
  }
  if (field.kind === 'date') {
    return formatDate(raw as string);
  }
  return raw;
}

export function DetailDialog<T extends Record<string, unknown>>({
  open,
  onClose,
  title,
  subtitle,
  record,
  sections,
  footer,
}: Props<T>) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </DialogHeader>
        {record &&
          sections.map((sec) => (
            <section key={sec.title} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {sec.title}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {sec.fields.map((f) => (
                  <div
                    key={f.label}
                    className={
                      f.cols === 3
                        ? 'sm:col-span-3'
                        : f.cols === 2
                          ? 'sm:col-span-2'
                          : ''
                    }
                  >
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {f.label}
                    </p>
                    <p className="text-sm">
                      {render(f, record as Record<string, unknown>)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        {footer}
      </DialogContent>
    </Dialog>
  );
}
