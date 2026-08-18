import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { usePortalReport } from '@/lib/portal';
import { usePagination } from '@/lib/use-pagination';
import { exportToCsv } from '@/lib/csv';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Visualizador GENÉRICO de relatório do portal. Renderiza as colunas cruas da
 * view (cabeçalho + tabela paginada + export CSV). A curadoria de colunas,
 * filtros e formatação fina é a próxima fase (exibição) — aqui o objetivo é
 * "plugar" a consulta e mostrar o dado do rep, escopado pelo backend.
 */
export function PortalReportPage() {
  const { key } = useParams<{ key: string }>();
  const report = usePortalReport(key);

  const rows = report.data?.rows ?? [];
  const columns = report.data?.columns ?? [];
  const pager = usePagination(rows, 25);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {report.data?.title ?? 'Relatório'}
          </h1>
          {report.data?.description && (
            <p className="text-sm text-muted-foreground">
              {report.data.description}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={rows.length === 0}
          onClick={() =>
            exportToCsv(
              `${key}-${new Date().toISOString().slice(0, 10)}`,
              columns.map((c) => ({
                header: prettyLabel(c.name),
                value: (row: Record<string, unknown>) => {
                  const v = row[c.name];
                  // Identificador inteiro (NF, código) não leva separador de
                  // milhar — senão não casa na reconciliação com o Linx.
                  return typeof v === 'number' && Number.isInteger(v)
                    ? String(v)
                    : v;
                },
              })),
              rows,
            )
          }
        >
          <Download className="size-4" />
          Exportar CSV
        </Button>
      </div>

      {report.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : report.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar este relatório.
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum registro para o seu acesso.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {pager.total} registro{pager.total === 1 ? '' : 's'}
              {report.data?.capped && ' (exibindo o teto — refine depois)'}
            </span>
            <span>
              Página {pager.page} de {pager.totalPages}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((c) => (
                    <TableHead key={c.name} className="whitespace-nowrap">
                      {prettyLabel(c.name)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pager.pageRows.map((row, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.name} className="whitespace-nowrap">
                        {formatCell(row[c.name])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pager.totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pager.page <= 1}
                onClick={() => pager.setPage(pager.page - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pager.page >= pager.totalPages}
                onClick={() => pager.setPage(pager.page + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Rótulo provisório: NOME_CLIFOR → "Nome clifor". Labels finais na fase de exibição. */
function prettyLabel(name: string): string {
  const s = name.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;

function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') {
    // Inteiro = identificador/contagem → sem separador de milhar (evita
    // "1.050.000" num nº de nota). Só valores fracionários levam formatação.
    return Number.isInteger(v)
      ? String(v)
      : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof v === 'string' && ISO_DATE.test(v)) {
    return new Date(v).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }
  return String(v);
}
