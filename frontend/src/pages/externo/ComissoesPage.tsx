import { Wallet } from 'lucide-react';
import { useComissoes, formatMoney, type ComissaoTitulo } from '@/lib/portal';
import { formatDate } from '@/lib/format';

/**
 * Portal do representante — "Comissões a receber".
 * A comissão vem por título; o rep recebe conforme cada título é pago. A lista
 * mostra os títulos em aberto (some conforme o cliente paga). Escopo do rep no
 * servidor.
 */
export function ComissoesPage() {
  const { data, isLoading, isError } = useComissoes();
  const resumo = data?.resumo;
  const titulos = data?.titulos ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Wallet className="size-5 text-primary" />
          Comissões a receber
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sua comissão por título em aberto — você recebe conforme cada título é
          pago pelo cliente.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 overflow-hidden rounded-xl border bg-border sm:grid-cols-3 [&>*]:bg-card">
        <Kpi
          label="Total a receber"
          value={formatMoney(resumo?.total ?? 0)}
          hint={`${resumo?.titulos ?? 0} título${resumo?.titulos === 1 ? '' : 's'}`}
          tone="primary"
          loading={isLoading}
        />
        <Kpi
          label="A vencer"
          value={formatMoney(resumo?.aVencer ?? 0)}
          hint="clientes em dia"
          loading={isLoading}
        />
        <Kpi
          label="Vencidos"
          value={formatMoney(resumo?.vencidos ?? 0)}
          hint={`${resumo?.vencidosTitulos ?? 0} título${resumo?.vencidosTitulos === 1 ? '' : 's'} em atraso`}
          tone={resumo && resumo.vencidos > 0 ? 'bad' : undefined}
          loading={isLoading}
        />
      </div>

      {/* Lista de títulos */}
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 text-right font-medium">Título</th>
                <th className="px-4 py-3 text-right font-medium">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Carregando…
                  </td>
                </tr>
              )}
              {isError && !isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-destructive">
                    Não foi possível carregar suas comissões.
                  </td>
                </tr>
              )}
              {!isLoading && !isError && titulos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nenhum título em aberto.
                  </td>
                </tr>
              )}
              {titulos.map((t, i) => (
                <TituloRow key={`${t.documento}-${i}`} t={t} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TituloRow({ t }: { t: ComissaoTitulo }) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-4 py-3 font-medium text-foreground">{t.cliente || '—'}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(t.vencimento)}</td>
      <td className="px-4 py-3">
        <PosicaoBadge posicao={t.posicao} />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {formatMoney(t.valorAReceber)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="font-semibold tabular-nums text-foreground">
          {formatMoney(t.comissao)}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {t.primeiroPedido ? (
            <span className="font-medium text-primary">10% · 1º pedido</span>
          ) : (
            `${t.taxa}%`
          )}
        </div>
      </td>
    </tr>
  );
}

function PosicaoBadge({ posicao }: { posicao: string }) {
  const p = posicao.toUpperCase();
  const cls = p.includes('VENCID')
    ? 'bg-destructive/10 text-destructive'
    : p.includes('HOJE')
      ? 'bg-warning/10 text-warning'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${cls}`}>
      {posicao || '—'}
    </span>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'primary' | 'bad';
  loading?: boolean;
}) {
  const valueCls =
    tone === 'primary'
      ? 'text-primary'
      : tone === 'bad'
        ? 'text-destructive'
        : 'text-foreground';
  return (
    <div className="p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <div className="mt-1 h-7 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueCls}`}>
          {value}
        </div>
      )}
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
