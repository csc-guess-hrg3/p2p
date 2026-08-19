import {
  useClienteFinanceiro,
  formatMoney,
  type AgingBucket,
} from '@/lib/portal';
import { DataGrid } from '@/components/externo/DataGrid';

const ZERO: AgingBucket = { d7: 0, d30: 0, maior30: 0, total: 0 };

/** Aba Financeiro — matriz Vencidos × A Vencer + lista de títulos. */
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

  const { vencidos, aVencer } = fin.data.aging;
  const linhas: { label: string; v: AgingBucket; a: AgingBucket }[] = [
    { label: 'Duplicatas', v: vencidos, a: aVencer },
    { label: 'Cheques', v: ZERO, a: ZERO },
    { label: 'Cartões', v: ZERO, a: ZERO },
    { label: 'Aviso Débito', v: ZERO, a: ZERO },
    { label: 'Aviso Crédito (-)', v: ZERO, a: ZERO },
  ];

  return (
    <div className="space-y-6">
      {/* Matriz de posição */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left"></th>
              <th className="px-3 py-2 text-center" colSpan={4}>
                Vencidos (em Dias)
              </th>
              <th className="px-3 py-2 text-center" colSpan={4}>
                A Vencer (em Dias)
              </th>
            </tr>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-3 py-1.5 text-left">Instrumento</th>
              <th className="px-3 py-1.5 text-right">Maior 30</th>
              <th className="px-3 py-1.5 text-right">30</th>
              <th className="px-3 py-1.5 text-right">7</th>
              <th className="px-3 py-1.5 text-right">Total</th>
              <th className="px-3 py-1.5 text-right">7</th>
              <th className="px-3 py-1.5 text-right">30</th>
              <th className="px-3 py-1.5 text-right">Maior 30</th>
              <th className="px-3 py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <MatrixRow key={l.label} label={l.label} v={l.v} a={l.a} />
            ))}
            <MatrixRow label="Total" v={vencidos} a={aVencer} bold />
          </tbody>
        </table>
      </div>

      {/* Títulos */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Títulos</h3>
        <DataGrid
          columns={fin.data.titulos.columns}
          rows={fin.data.titulos.rows}
          emptyText="Nenhum título em aberto para este cliente."
          csvName={`financeiro-${codigo ?? ''}`}
        />
      </div>
    </div>
  );
}

function MatrixRow({
  label,
  v,
  a,
  bold,
}: {
  label: string;
  v: AgingBucket;
  a: AgingBucket;
  bold?: boolean;
}) {
  const cell = (n: number) => (n ? formatMoney(n) : '—');
  return (
    <tr className={`border-b last:border-0 ${bold ? 'font-semibold' : ''}`}>
      <td className="px-3 py-1.5">{label}</td>
      <td className="px-3 py-1.5 text-right">{cell(v.maior30)}</td>
      <td className="px-3 py-1.5 text-right">{cell(v.d30)}</td>
      <td className="px-3 py-1.5 text-right">{cell(v.d7)}</td>
      <td className="px-3 py-1.5 text-right">{cell(v.total)}</td>
      <td className="px-3 py-1.5 text-right">{cell(a.d7)}</td>
      <td className="px-3 py-1.5 text-right">{cell(a.d30)}</td>
      <td className="px-3 py-1.5 text-right">{cell(a.maior30)}</td>
      <td className="px-3 py-1.5 text-right">{cell(a.total)}</td>
    </tr>
  );
}
