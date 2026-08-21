import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search, X } from 'lucide-react';
import {
  useClientes,
  formatMoney,
  type ClienteListItem,
} from '@/lib/portal';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type Situacao = 'ALL' | 'VENCIDO' | 'EMDIA' | 'SEMTITULOS';
type Lente = 'NONE' | 'CADASTRO' | 'COMPRA';

/** 'yyyy-mm-dd' -> 'dd/mm/aaaa' (o dado já vem ISO do backend). */
function fmtData(iso: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Aba Clientes — "Meus clientes": lista escaneável + filtros. */
export function ConsultaClientesListPage() {
  const navigate = useNavigate();
  const clientes = useClientes();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState<Situacao>('ALL');
  const [uf, setUf] = useState('ALL');
  const [lente, setLente] = useState<Lente>('NONE');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const todos = clientes.data ?? [];

  // UFs presentes na carteira do rep — alimentam o filtro sem chute.
  const ufs = useMemo(
    () => [...new Set(todos.map((c) => c.uf).filter(Boolean))].sort(),
    [todos],
  );

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos.filter((c) => {
      if (
        q &&
        ![c.nome, c.razaoSocial, c.codigo, c.cidade].some((v) =>
          (v ?? '').toLowerCase().includes(q),
        )
      )
        return false;

      // Situação financeira (mesma lógica do chip).
      if (situacao === 'VENCIDO' && !(c.vencido > 0)) return false;
      if (situacao === 'EMDIA' && !(c.vencido === 0 && c.aReceber > 0))
        return false;
      if (situacao === 'SEMTITULOS' && c.aReceber > 0) return false;

      if (uf !== 'ALL' && c.uf !== uf) return false;

      // Data: cadastro (quando virou cliente) ou compra (última emissão).
      // ISO yyyy-mm-dd compara cronologicamente como string.
      if (lente !== 'NONE') {
        const d = lente === 'CADASTRO' ? c.dataCadastro : c.ultimaCompra;
        if (!d) return false; // sem a data da lente escolhida → fora do período
        if (de && d < de) return false;
        if (ate && d > ate) return false;
      }
      return true;
    });
  }, [todos, busca, situacao, uf, lente, de, ate]);

  const filtrando =
    !!busca || situacao !== 'ALL' || uf !== 'ALL' || lente !== 'NONE';
  const limpar = () => {
    setBusca('');
    setSituacao('ALL');
    setUf('ALL');
    setLente('NONE');
    setDe('');
    setAte('');
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meus clientes</h1>
        <p className="text-sm text-muted-foreground">
          {clientes.data
            ? filtrando
              ? `${rows.length} de ${todos.length} cliente${todos.length === 1 ? '' : 's'}`
              : `${todos.length} cliente${todos.length === 1 ? '' : 's'} que você atende.`
            : 'Carregando…'}
        </p>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input
          className="h-11 rounded-xl pl-9"
          placeholder="Buscar por nome, código ou cidade…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={situacao}
          onValueChange={(v) => setSituacao(v as Situacao)}
        >
          <SelectTrigger className="h-10 w-[9.5rem] rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Situação: todas</SelectItem>
            <SelectItem value="VENCIDO">Vencido</SelectItem>
            <SelectItem value="EMDIA">Em dia</SelectItem>
            <SelectItem value="SEMTITULOS">Sem títulos</SelectItem>
          </SelectContent>
        </Select>

        <Select value={uf} onValueChange={setUf}>
          <SelectTrigger className="h-10 w-[7rem] rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">UF: todas</SelectItem>
            {ufs.map((u) => (
              <SelectItem key={u} value={u}>
                {u}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={lente} onValueChange={(v) => setLente(v as Lente)}>
          <SelectTrigger className="h-10 w-[10.5rem] rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">Data: —</SelectItem>
            <SelectItem value="COMPRA">Última compra</SelectItem>
            <SelectItem value="CADASTRO">Data de cadastro</SelectItem>
          </SelectContent>
        </Select>

        {lente !== 'NONE' && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="De"
              className="h-10 w-[9.5rem] rounded-lg"
              value={de}
              max={ate || undefined}
              onChange={(e) => setDe(e.target.value)}
            />
            <span className="text-xs text-muted-foreground">até</span>
            <Input
              type="date"
              aria-label="Até"
              className="h-10 w-[9.5rem] rounded-lg"
              value={ate}
              min={de || undefined}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        )}

        {filtrando && (
          <button
            type="button"
            onClick={limpar}
            className="inline-flex h-10 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
            Limpar
          </button>
        )}
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
                  {(c.dataCadastro || c.ultimaCompra) && (
                    <div className="mt-1 text-[11px] text-muted-foreground/70">
                      {c.dataCadastro && <>Cadastro {fmtData(c.dataCadastro)}</>}
                      {c.dataCadastro && c.ultimaCompra && ' · '}
                      {c.ultimaCompra && (
                        <>Última compra {fmtData(c.ultimaCompra)}</>
                      )}
                    </div>
                  )}
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
