import { Download } from 'lucide-react';
import { usePagination } from '@/lib/use-pagination';
import { exportToCsv } from '@/lib/csv';
import { formatCell, type ColumnMeta } from '@/lib/portal';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DataGridProps {
  columns: ColumnMeta[];
  rows: Record<string, unknown>[];
  /** Coluna(s) que identificam a linha (p/ key + destaque de seleção). */
  rowKey?: (row: Record<string, unknown>, i: number) => string;
  onRowClick?: (row: Record<string, unknown>) => void;
  selectedKey?: string;
  emptyText?: string;
  csvName?: string;
  pageSize?: number;
}

/** Grade genérica das telas da Consulta de Clientes. */
export function DataGrid({
  columns,
  rows,
  rowKey,
  onRowClick,
  selectedKey,
  emptyText = 'Nenhum registro.',
  csvName,
  pageSize = 25,
}: DataGridProps) {
  const pager = usePagination(rows, pageSize);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {pager.total} registro{pager.total === 1 ? '' : 's'}
        </span>
        <div className="flex items-center gap-3">
          <span>
            Página {pager.page} de {pager.totalPages}
          </span>
          {csvName && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                exportToCsv(
                  `${csvName}-${new Date().toISOString().slice(0, 10)}`,
                  columns.map((c) => ({
                    header: c.label,
                    value: (row: Record<string, unknown>) => {
                      const v = row[c.name];
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
              CSV
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.name} className="whitespace-nowrap">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pager.pageRows.map((row, i) => {
              const key = rowKey ? rowKey(row, i) : String(i);
              return (
                <TableRow
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={
                    (onRowClick ? 'cursor-pointer ' : '') +
                    (selectedKey && key === selectedKey ? 'bg-primary/10' : '')
                  }
                >
                  {columns.map((c) => (
                    <TableCell key={c.name} className="whitespace-nowrap">
                      {formatCell(row[c.name])}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
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
    </div>
  );
}
