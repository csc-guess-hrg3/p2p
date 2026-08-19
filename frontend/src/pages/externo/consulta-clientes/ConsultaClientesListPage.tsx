import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useClientes } from '@/lib/portal';
import { DataGrid } from '@/components/externo/DataGrid';
import { Input } from '@/components/ui/input';

/** Aba Clientes — lista os clientes do representante. Clique abre o cliente. */
export function ConsultaClientesListPage() {
  const navigate = useNavigate();
  const clientes = useClientes();
  const [busca, setBusca] = useState('');

  const rows = useMemo(() => {
    const all = clientes.data?.rows ?? [];
    const q = busca.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      ['NOME_CLIFOR', 'RAZAO_SOCIAL', 'CGC_CPF', 'CLIFOR', 'CIDADE'].some((c) =>
        String(r[c] ?? '')
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [clientes.data, busca]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Consulta de Clientes
          </h1>
          <p className="text-sm text-muted-foreground">
            Seus clientes. Clique em um para ver dados, faturamentos e
            financeiro.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="w-64 pl-8"
            placeholder="Buscar cliente…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {clientes.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : clientes.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar seus clientes.
        </p>
      ) : (
        <DataGrid
          columns={clientes.data?.columns ?? []}
          rows={rows}
          rowKey={(r) => String(r.CLIFOR)}
          onRowClick={(r) =>
            navigate(`/externo/consulta-clientes/${String(r.CLIFOR).trim()}`)
          }
          emptyText="Nenhum cliente encontrado."
          csvName="clientes"
          pageSize={20}
        />
      )}
    </div>
  );
}
