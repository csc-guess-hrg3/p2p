import { useState } from 'react';
import {
  useClienteFaturamentos,
  usePedidosNota,
  formatCell,
} from '@/lib/portal';
import { DataGrid } from '@/components/externo/DataGrid';

interface Nota {
  nf: string;
  serie: string;
  filial: string;
}

const notaKey = (n: Nota) => `${n.nf}|${n.serie}|${n.filial}`;

/** Aba Faturamentos — notas do cliente, totais e o sub-grid "Pedidos da Nota". */
export function ClienteFaturamentos({ codigo }: { codigo: string | undefined }) {
  const fat = useClienteFaturamentos(codigo);
  const [nota, setNota] = useState<Nota | null>(null);
  const pedidos = usePedidosNota(codigo, nota);

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

  return (
    <div className="space-y-5">
      <DataGrid
        columns={fat.data.columns}
        rows={fat.data.rows}
        rowKey={(r) =>
          notaKey({
            nf: String(r.NF_SAIDA),
            serie: String(r.SERIE_NF),
            filial: String(r.FILIAL),
          })
        }
        selectedKey={nota ? notaKey(nota) : undefined}
        onRowClick={(r) =>
          setNota({
            nf: String(r.NF_SAIDA ?? '').trim(),
            serie: String(r.SERIE_NF ?? '').trim(),
            filial: String(r.FILIAL ?? '').trim(),
          })
        }
        emptyText="Nenhum faturamento para este cliente."
        csvName={`faturamentos-${codigo ?? ''}`}
      />

      {/* Totais */}
      {fat.data.rows.length > 0 && (
        <div className="flex flex-wrap justify-end gap-6 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          {fat.data.totais.map((t) => (
            <div key={t.label} className="text-right">
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div className="font-semibold">{formatCell(t.value)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Pedidos da Nota */}
      {nota && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">
            Pedidos da Nota{' '}
            <span className="text-muted-foreground">
              — NF {nota.nf} / série {nota.serie}
            </span>
          </h3>
          {pedidos.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (
            <DataGrid
              columns={pedidos.data?.columns ?? []}
              rows={pedidos.data?.rows ?? []}
              emptyText="Sem pedidos vinculados a esta nota."
              pageSize={10}
            />
          )}
        </div>
      )}
    </div>
  );
}
