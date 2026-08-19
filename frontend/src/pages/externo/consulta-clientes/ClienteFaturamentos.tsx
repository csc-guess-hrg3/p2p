import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  useClienteFaturamentos,
  usePedidosNota,
  formatMoney,
  formatDate,
} from '@/lib/portal';

const str = (v: unknown) => (v == null ? '' : String(v));

/** Aba Faturamentos — métricas + notas expansíveis (com Pedidos da Nota). */
export function ClienteFaturamentos({ codigo }: { codigo: string | undefined }) {
  const fat = useClienteFaturamentos(codigo);

  if (fat.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (fat.isError || !fat.data) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar os faturamentos.
      </p>
    );
  }
  const rows = fat.data.rows;
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum faturamento para este cliente.
      </p>
    );
  }

  const total = fat.data.totais.find((t) => t.label === 'Valor Total')?.value ?? 0;
  const qtde = fat.data.totais.find((t) => t.label === 'Qtde Total')?.value ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total faturado" value={formatMoney(total)} />
        <Metric label="Notas" value={String(rows.length)} />
        <Metric
          label="Ticket médio"
          value={formatMoney(total / rows.length)}
        />
        <Metric label="Peças" value={String(qtde)} />
      </div>

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <NotaCard key={i} codigo={codigo} row={r} />
        ))}
      </div>
    </div>
  );
}

function NotaCard({
  codigo,
  row,
}: {
  codigo: string | undefined;
  row: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  const nf = str(row.NF_SAIDA).trim();
  const serie = str(row.SERIE_NF).trim();
  const filial = str(row.FILIAL).trim();
  const cancelada = row.NOTA_CANCELADA === true;
  const valor = Number(row.VALOR_TOTAL) || 0;

  const pedidos = usePedidosNota(
    open ? codigo : undefined,
    open ? { nf, serie, filial } : null,
  );

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/40 sm:gap-4"
      >
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">NF {nf}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              Série {serie}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            Emissão {formatDate(row.EMISSAO)} · {String(row.QTDE_TOTAL ?? 0)}{' '}
            peças · {str(row.DESC_COND_PGTO)} · {str(row.TRANSPORTADORA)}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
            cancelada
              ? 'bg-destructive/10 text-destructive'
              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {cancelada ? 'Cancelada' : 'Faturada'}
        </span>
        <div className="shrink-0 text-right text-base font-semibold tabular-nums">
          {formatMoney(valor)}
        </div>
      </button>

      {open && (
        <div className="border-t p-4">
          <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm sm:grid-cols-4">
            <Det label="Natureza" value={str(row.DESC_NATUREZA) || '—'} />
            <Det label="Filial" value={str(row.FILIAL) || '—'} />
            <Det label="Desconto" value={formatMoney(Number(row.DESCONTO) || 0)} />
            <Det label="Comissão" value={`${Number(row.COMISSAO) || 0}%`} />
            <Det
              label="Frete / Seguro"
              value={formatMoney((Number(row.FRETE) || 0) + (Number(row.SEGURO) || 0))}
            />
            <Det
              label="ICMS / IPI"
              value={formatMoney((Number(row.ICMS) || 0) + (Number(row.IPI_VALOR) || 0))}
            />
            <Det label="Gerente" value={str(row.GERENTE) || '—'} />
            <Det label="Fatura" value={str(row.FATURA) || '—'} mono />
          </dl>

          <div className="mt-5 mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Pedidos da nota
          </div>
          {pedidos.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (pedidos.data?.rows.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sem pedidos vinculados a esta nota.
            </p>
          ) : (
            <ol className="relative ml-1">
              {pedidos.data!.rows.map((p, i, arr) => (
                <li key={i} className="flex items-start gap-3 pb-4 last:pb-0">
                  <span className="relative mt-1 flex size-2.5 shrink-0">
                    <span className="size-2.5 rounded-full bg-primary" />
                    {i < arr.length - 1 && (
                      <span className="absolute left-1/2 top-2.5 h-full w-px -translate-x-1/2 bg-border" />
                    )}
                  </span>
                  <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3">
                    <span className="text-sm">{formatDate(p.entrega)}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      pedido {str(p.PEDIDO)}
                      {str(p.pedido_cliente) && ` · ${str(p.pedido_cliente)}`}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Det({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-0.5 font-medium ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  );
}
