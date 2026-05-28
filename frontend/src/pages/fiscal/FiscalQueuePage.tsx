import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { extractApiMessage } from '@/lib/api-errors';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertTriangle,
  Download,
  FileText,
  Package,
} from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useItems } from '@/lib/integration';
import {
  useFiscalItemRequests,
  useApproveFiscalItemRequest,
  type FiscalItemRequest,
} from '@/lib/fiscal';
import { useRequisitions } from '@/lib/requisitions';
import { formatCurrency, formatDate } from '@/lib/format';
import { StatusBadge } from '@/components/StatusBadge';
import { ItemCombobox } from '@/pages/requisitions/ItemCombobox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pagination } from '@/components/ui/pagination';
import { usePagination } from '@/lib/use-pagination';
import { exportToCsv } from '@/lib/csv';

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Resolvidas' },
];

/** Diálogo de aprovação — permite vincular um item diferente do solicitado. */
function ApproveDialog({
  request,
  company,
  onClose,
}: {
  request: FiscalItemRequest;
  company?: string;
  onClose: () => void;
}) {
  const catalog = useItems(company);
  const approve = useApproveFiscalItemRequest();
  const { toast } = useToast();
  const [itemCode, setItemCode] = useState(request.itemErpCode ?? '');

  async function handleApprove() {
    try {
      await approve.mutateAsync({
        id: request.id,
        itemErpCode:
          itemCode && itemCode !== request.itemErpCode ? itemCode : undefined,
      });
      toast({
        title: 'Pendência aprovada',
        variant: 'success',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Não foi possível aprovar a pendência',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    }
  }

  const changed = itemCode !== request.itemErpCode;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprovar vínculo de item</DialogTitle>
          <DialogDescription>
            Fornecedor {request.supplierName}. Confirme o item ou selecione o
            item correto — o vínculo será gravado no Linx.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Item solicitado: </span>
            {request.itemErpCode} — {request.itemDescription}
          </div>
          <div className="space-y-1.5">
            <Label>Item a vincular</Label>
            <ItemCombobox
              items={catalog.data ?? []}
              value={itemCode}
              loading={catalog.isLoading}
              showCode
              placeholder="Selecione o item"
              onSelect={(i) => setItemCode(i.codigo)}
            />
            {changed && (
              <p className="text-xs text-warning">
                Item diferente do solicitado — o solicitante será notificado.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleApprove} disabled={approve.isPending}>
            {approve.isPending ? 'Gravando…' : 'Aprovar e vincular'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Aba "Itens" — pendências de vínculo de item (modelo antigo). */
function ItensTab({ companyCode }: { companyCode?: string }) {
  const [status, setStatus] = useState('PENDING');
  const [approving, setApproving] = useState<FiscalItemRequest | null>(null);
  const { data, isLoading } = useFiscalItemRequests({ status });
  const rows = data?.data ?? [];
  const isFiscal = data?.isFiscalUser ?? false;
  const pag = usePagination(rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isFiscal
            ? 'Pendências de vínculo de item — fila da equipe Fiscal.'
            : 'Suas pendências de vínculo de item.'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              exportToCsv(
                `pendencias-itens-fiscal-${new Date().toISOString().slice(0, 10)}`,
                [
                  { header: 'Item', value: (r) => r.itemDescription },
                  { header: 'Código', value: (r) => r.itemErpCode ?? '' },
                  { header: 'Fornecedor', value: (r) => r.supplierName },
                  { header: 'Status', value: (r) => r.status },
                  {
                    header: 'Solicitante',
                    value: (r) => r.requestedBy?.name ?? '',
                  },
                  { header: 'Aberta em', value: (r) => r.createdAt },
                ],
                rows,
              )
            }
            disabled={rows.length === 0}
          >
            <Download className="size-4" />
            Exportar
          </Button>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead>Aberta em</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhuma pendência.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div>{r.itemDescription}</div>
                  <span className="text-xs text-muted-foreground">
                    Código: {r.itemErpCode ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.supplierName}
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.requestedBy?.name ?? '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.createdAt)}
                </TableCell>
                <TableCell>
                  {isFiscal && r.status === 'PENDING' && (
                    <Button size="sm" onClick={() => setApproving(r)}>
                      Aprovar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <Pagination
          page={pag.page}
          pageSize={pag.pageSize}
          total={pag.total}
          totalPages={pag.totalPages}
          onPageChange={pag.setPage}
          onPageSizeChange={pag.setPageSize}
        />
      </div>

      {approving && (
        <ApproveDialog
          request={approving}
          company={companyCode}
          onClose={() => setApproving(null)}
        />
      )}
    </div>
  );
}

/**
 * Aba "Requisições" — requisições APROVADAS que não viram pedido enquanto
 * não tiverem operação contábil + natureza de entrada preenchidas.
 * Pré-requisito da gravação no ERP.
 */
function RequisicoesTab() {
  const { activeCompany } = useCompany();
  const navigate = useNavigate();
  const { data, isLoading } = useRequisitions({
    companyId: activeCompany?.id,
    status: 'APPROVED',
  });
  // Aqui SÓ entram requisições APROVADAS e ainda não classificadas. Por
  // segurança filtramos status no cliente também — qualquer requisição
  // rejeitada/cancelada/em rascunho/convertida sai fora explicitamente.
  const pending = useMemo(() => {
    return (data?.data ?? []).filter(
      (r) =>
        r.status === 'APPROVED' &&
        r.tipoNotaFiscal !== 'SEM_NF' &&
        (r.ctbTipoOperacao == null || !r.naturezaEntrada),
    );
  }, [data?.data]);
  const pag = usePagination(pending);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Requisições aprovadas que ainda não tiveram a classificação fiscal e
        contábil preenchida — pré-requisito para virarem pedido. Clique na
        linha para abrir e preencher.
      </p>

      <div className="rounded-lg border bg-card">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Solicitante</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Aprovada em</TableHead>
              <TableHead>Pendência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && pending.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhuma requisição aguardando classificação.
                </TableCell>
              </TableRow>
            )}
            {pag.pageRows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => navigate(`/requisicoes/${r.id}`)}
              >
                <TableCell className="font-medium">{r.number}</TableCell>
                <TableCell>{r.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.supplierName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.requester?.name ?? '—'}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.totalAmount)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(r.approvedAt)}
                </TableCell>
                <TableCell>
                  <span
                    title="Classificação fiscal pendente — preencher antes de virar pedido"
                    className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning"
                  >
                    <AlertTriangle className="size-3" />
                    Não classificada
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
        <Pagination
          page={pag.page}
          pageSize={pag.pageSize}
          total={pag.total}
          totalPages={pag.totalPages}
          onPageChange={pag.setPage}
          onPageSizeChange={pag.setPageSize}
        />
      </div>
    </div>
  );
}

export function FiscalQueuePage() {
  const { activeCompany } = useCompany();
  const [tab, setTab] = useState<'itens' | 'requisicoes'>('requisicoes');

  // Carrega prévia das requisições para mostrar contagem nas tabs (mesma query
  // que a RequisicoesTab vai usar — React Query reaproveita a cache).
  const reqsQ = useRequisitions({
    companyId: activeCompany?.id,
    status: 'APPROVED',
  });
  const pendingReqsCount = (reqsQ.data?.data ?? []).filter(
    (r) =>
      r.status === 'APPROVED' &&
      r.tipoNotaFiscal !== 'SEM_NF' &&
      (r.ctbTipoOperacao == null || !r.naturezaEntrada),
  ).length;

  const itemsQ = useFiscalItemRequests({ status: 'PENDING' });
  const pendingItemsCount = itemsQ.data?.data?.length ?? 0;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <TabsList>
        <TabsTrigger value="requisicoes" className="gap-2">
          <FileText className="size-4" />
          Requisições a classificar
          {pendingReqsCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning">
              {pendingReqsCount}
            </span>
          )}
        </TabsTrigger>
        <TabsTrigger value="itens" className="gap-2">
          <Package className="size-4" />
          Itens a vincular
          {pendingItemsCount > 0 && (
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning">
              {pendingItemsCount}
            </span>
          )}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="requisicoes">
        <RequisicoesTab />
      </TabsContent>
      <TabsContent value="itens">
        <ItensTab companyCode={activeCompany?.code} />
      </TabsContent>
    </Tabs>
  );
}
