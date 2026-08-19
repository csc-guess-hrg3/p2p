import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import {
  useClientes,
  formatMoney,
  type ClienteListItem,
} from '@/lib/portal';
import { Input } from '@/components/ui/input';

/** Aba Clientes — "Meus clientes": lista escaneável. Clique abre o cliente. */
export function ConsultaClientesListPage() {
  const navigate = useNavigate();
  const clientes = useClientes();
  const [busca, setBusca] = useState('');

  const rows = useMemo(() => {
    const all = clientes.data ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return all;
    return all.filter((c) =>
      [c.nome, c.razaoSocial, c.codigo, c.cidade].some((v) =>
        (v ?? '').toLowerCase().includes(q),
      ),
    );
  }, [clientes.data, busca]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meus clientes</h1>
        <p className="text-sm text-muted-foreground">
          {clientes.data
            ? `${clientes.data.length} cliente${clientes.data.length === 1 ? '' : 's'} que você atende.`
            : 'Carregando…'}
        </p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl pl-9"
          placeholder="Buscar por nome, código ou cidade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {clientes.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : clientes.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar seus clientes.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum cliente encontrado.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((c) => (
            <li key={c.codigo}>
              <button
                type="button"
                onClick={() => navigate(`/externo/consulta-clientes/${c.codigo}`)}
                className="flex w-full items-center justify-between gap-4 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-primary"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.nome}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono text-[11px] text-muted-foreground/70">
                      #{c.codigo}
                    </span>
                    <span>•</span>
                    <span>
                      {[c.cidade, c.uf].filter(Boolean).join(' / ') || '—'}
                    </span>
                    <StatusChip c={c} />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      A receber
                    </div>
                    <div className="font-medium tabular-nums">
                      {c.aReceber ? formatMoney(c.aReceber) : '—'}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/50" />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ c }: { c: ClienteListItem }) {
  let cls = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  let txt = 'Em dia';
  if (c.vencido > 0) {
    cls = 'bg-destructive/10 text-destructive';
    txt = `${formatMoney(c.vencido)} vencido`;
  } else if (!c.aReceber) {
    cls = 'bg-muted text-muted-foreground';
    txt = 'Sem títulos';
  }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {txt}
    </span>
  );
}
