import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useCompany } from '@/lib/company';
import { useItems } from '@/lib/integration';
import {
  useFiscalItemRequests,
  useApproveFiscalItemRequest,
  type FiscalItemRequest,
} from '@/lib/fiscal';
import { formatDate } from '@/lib/format';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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
  const [itemCode, setItemCode] = useState(request.itemErpCode ?? '');

  async function handleApprove() {
    try {
      await approve.mutateAsync({
        id: request.id,
        itemErpCode:
          itemCode && itemCode !== request.itemErpCode ? itemCode : undefined,
      });
      onClose();
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      alert(msg || 'Não foi possível aprovar a pendência.');
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

export function FiscalQueuePage() {
  const { activeCompany } = useCompany();
  const [status, setStatus] = useState('PENDING');
  const [approving, setApproving] = useState<FiscalItemRequest | null>(null);

  const { data, isLoading } = useFiscalItemRequests({ status });
  const rows = data?.data ?? [];
  const isFiscal = data?.isFiscalUser ?? false;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isFiscal
            ? 'Pendências de vínculo de item — fila da equipe Fiscal.'
            : 'Suas pendências de vínculo de item.'}
        </p>
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

      <div className="rounded-lg border bg-card">
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
            {rows.map((r) => (
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

      {approving && (
        <ApproveDialog
          request={approving}
          company={activeCompany?.code}
          onClose={() => setApproving(null)}
        />
      )}
    </div>
  );
}
