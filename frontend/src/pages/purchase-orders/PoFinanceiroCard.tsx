import { Banknote, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import {
  usePurchaseOrderFinanceiroErp,
  type FinanceiroErp,
} from '@/lib/purchase-orders';
import { formatCurrency, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * "Mão de volta" do pagamento (PRD §11): mostra, lido do Linx em tempo
 * real, se o pedido foi faturado (entrou NF) e se o(s) título(s) foram
 * pagos. Somente leitura — não persiste nada no P2P.
 *
 * Wrapper para pedido do P2P (busca pelo id da PO).
 */
export function PoFinanceiroCard({
  purchaseOrderId,
}: {
  purchaseOrderId: string;
}) {
  const { data, isLoading, isFetching, refetch } = usePurchaseOrderFinanceiroErp(
    purchaseOrderId,
    true,
  );
  return (
    <FinanceiroErpCard
      data={data}
      isLoading={isLoading}
      isFetching={isFetching}
      onRefresh={() => refetch()}
    />
  );
}

/**
 * Card genérico — recebe os dados já carregados. Reusado pelo pedido do
 * P2P e pelo pedido externo (legacy/Linx). Mesmo tratamento pra todos.
 */
export function FinanceiroErpCard({
  data,
  isLoading,
  isFetching,
  onRefresh,
}: {
  data: FinanceiroErp | undefined;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const status = !data
    ? null
    : data.pago
      ? { label: 'Pago', cls: 'bg-emerald-500/10 text-emerald-600', icon: CheckCircle2 }
      : data.faturado
        ? { label: 'Faturado · aguardando pagamento', cls: 'bg-blue-500/10 text-blue-600', icon: Banknote }
        : { label: 'Aguardando faturamento', cls: 'bg-muted text-muted-foreground', icon: Clock };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Banknote className="size-5" />
          Financeiro (Linx)
        </CardTitle>
        <div className="flex items-center gap-2">
          {status && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${status.cls}`}
            >
              <status.icon className="size-3.5" />
              {status.label}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            title="Reconsultar o estado financeiro no Linx"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Consultando o Linx…</p>
        ) : !data || data.titulos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma nota fiscal lançada contra este pedido no Linx ainda.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {data.faturado && data.primeiraEntradaEm
                ? `Faturado desde ${formatDate(data.primeiraEntradaEm)}. `
                : ''}
              {data.pago
                ? 'Título(s) liquidado(s) — saldo zerado.'
                : `Saldo em aberto: ${formatCurrency(data.totalSaldo)}.`}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NF</TableHead>
                  <TableHead>Lançamento</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.titulos.map((t, i) => (
                  <TableRow key={`${t.lancamento ?? t.nf ?? i}`}>
                    <TableCell className="font-medium">
                      {t.nf ?? '—'}
                      {t.serie ? `/${t.serie}` : ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.lancamento ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.vencimento ? formatDate(t.vencimento) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(t.saldo)}
                    </TableCell>
                    <TableCell>
                      {t.parcelas === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          sem título
                        </span>
                      ) : t.pago ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="size-3.5" /> Pago
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-blue-600">
                          Em aberto
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
