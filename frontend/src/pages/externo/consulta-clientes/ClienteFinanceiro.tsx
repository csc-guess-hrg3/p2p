import {
  useClienteFinanceiro,
  formatMoney,
  formatDate,
  type AgingBucket,
} from '@/lib/portal';

/** Aba Financeiro — a receber, posição (vencido × a vencer) e títulos. */
export function ClienteFinanceiro({ codigo }: { codigo: string | undefined }) {
  const fin = useClienteFinanceiro(codigo);

  if (fin.isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }
  if (fin.isError || !fin.data) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o financeiro.
      </p>
    );
  }

  const { vencidos, aVencer, total } = fin.data.aging;
  const titulos = fin.data.titulos.rows;
  const avPct = total > 0 ? (aVencer.total / total) * 100 : 0;
  const vcPct = total > 0 ? 100 - avPct : 0;

  return (
    <div className="space-y-6">
      {/* Posição */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          A receber
        </div>
        <div className="text-3xl font-bold tracking-tight tabular-nums">
          {formatMoney(total)}
        </div>
        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500" style={{ width: `${avPct}%` }} />
          <div className="bg-destructive" style={{ width: `${vcPct}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-500" />A vencer{' '}
            {formatMoney(aVencer.total)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-destructive" />
            Vencido {formatMoney(vencidos.total)}
          </span>
        </div>
      </div>

      {/* Aging */}
      <div className="grid gap-4 sm:grid-cols-2">
        <AgingBox title="A vencer" tone="good" b={aVencer} />
        <AgingBox title="Vencido" tone="bad" b={vencidos} />
      </div>

      {/* Títulos */}
      <div>
        <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Títulos
        </div>
        {titulos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum título em aberto para este cliente.
          </p>
        ) : (
          <ul className="space-y-2">
            {titulos.map((t, i) => (
              <TituloRow key={i} t={t} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AgingBox({
  title,
  tone,
  b,
}: {
  title: string;
  tone: 'good' | 'bad';
  b: AgingBucket;
}) {
  const dot = tone === 'good' ? 'bg-emerald-500' : 'bg-destructive';
  const linhas: [string, number][] = [
    ['Até 7 dias', b.d7],
    ['8 a 30 dias', b.d30],
    ['Mais de 30 dias', b.maior30],
  ];
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
        <span className={`size-2 rounded-full ${dot}`} />
        {title}
      </h4>
      <dl className="divide-y">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex justify-between py-1.5 text-sm">
            <dt className="text-muted-foreground">{k}</dt>
            <dd
              className={`font-medium tabular-nums ${v ? '' : 'text-muted-foreground/50'}`}
            >
              {formatMoney(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function TituloRow({ t }: { t: Record<string, unknown> }) {
  const dias = Number(t.DIAS_VENC);
  const hint = Number.isNaN(dias)
    ? ''
    : dias > 0
      ? `há ${dias} dia${dias === 1 ? '' : 's'}`
      : dias < 0
        ? `em ${-dias} dia${dias === -1 ? '' : 's'}`
        : 'vence hoje';
  const pos = String(t.POSICAO ?? '').toUpperCase();
  const chip = pos.startsWith('VENC')
    ? pos === 'VENCENDO HOJE'
      ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
      : 'bg-destructive/10 text-destructive'
    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {formatDate(t.VENCIMENTO_REAL)}{' '}
          {hint && (
            <span className="text-xs font-normal text-muted-foreground">
              · {hint}
            </span>
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground/70">
          Fatura {String(t.FATURA ?? '—')}
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${chip}`}
      >
        {String(t.POSICAO ?? '—')}
      </span>
      <div className="shrink-0 text-right font-semibold tabular-nums">
        {formatMoney(Number(t.VALOR_A_RECEBER) || 0)}
      </div>
    </li>
  );
}
