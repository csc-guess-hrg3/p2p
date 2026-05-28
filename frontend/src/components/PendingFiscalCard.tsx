import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import type { Requisition } from '@/lib/requisitions';

/**
 * Cartão de visibilidade das pendências fiscais que afetam esta
 * requisição — sem expor o módulo Fiscal pro solicitante. O time fiscal
 * tem a fila separada em /fiscal/pendencias-fiscais com botões de ação;
 * aqui o solicitante só vê o STATUS (item por item) sem acesso a aprovar.
 *
 * Quando todas as pendências da req estão APPROVED, o card NÃO renderiza
 * — já cumpriu o papel; o stepper acima mostra que a fase passou.
 */
interface Props {
  items: Requisition['pendingFiscalItems'];
}

export function PendingFiscalCard({ items }: Props) {
  const list = items ?? [];
  // Só mostra se algo está pendente/rejeitado — APPROVED puro não polui.
  const relevant = list.filter((f) => f.status !== 'APPROVED');
  if (relevant.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-warning" />
          Pendências fiscais nesta requisição
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Estes itens precisam ser vinculados ao fornecedor no Linx antes
          do pedido virar oficial. O time fiscal recebe e resolve — você
          acompanha o status aqui, sem ações.
        </p>
        <ul className="space-y-2">
          {relevant.map((f) => {
            const isRejected = f.status === 'REJECTED';
            return (
              <li
                key={f.id}
                className="flex items-start gap-2 rounded-md border p-2 text-sm"
              >
                {isRejected ? (
                  <XCircle className="mt-0.5 size-4 text-destructive" />
                ) : f.status === 'APPROVED' ? (
                  <CheckCircle2 className="mt-0.5 size-4 text-success" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 text-warning" />
                )}
                <div className="flex-1">
                  <div className="font-medium">{f.itemDescription}</div>
                  <div className="text-xs text-muted-foreground">
                    Aberta em {formatDate(f.createdAt)}
                    {f.resolvedAt && ` · Resolvida em ${formatDate(f.resolvedAt)}`}
                    {f.itemErpCode && ` · Cód. Linx: ${f.itemErpCode}`}
                  </div>
                  {isRejected && f.rejectionReason && (
                    <div className="mt-1 text-xs text-destructive">
                      Motivo da recusa: {f.rejectionReason}
                    </div>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    isRejected
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-warning/15 text-warning'
                  }`}
                >
                  {isRejected ? 'Recusada' : 'Pendente'}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
