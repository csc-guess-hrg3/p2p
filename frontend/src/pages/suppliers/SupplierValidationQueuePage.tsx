import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, Check, Undo2 } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useSupplierValidations,
  useApproveSupplier,
  useReturnSupplier,
  type SupplierValidation,
} from '@/lib/supplier-validation';
import { formatCurrency, formatDate } from '@/lib/format';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';

const TABS = [
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovados' },
  { value: 'RETURNED', label: 'Devolvidos' },
];

function maskCnpj(v: string | null): string {
  if (!v) return '—';
  const d = v.replace(/\D/g, '').padStart(14, '0');
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function SupplierValidationQueuePage() {
  const { toast } = useToast();
  const { companies } = useCompany();
  const [companyId, setCompanyId] = useState<string>('ALL');
  const [status, setStatus] = useState('PENDING');
  const [approveTarget, setApproveTarget] = useState<SupplierValidation | null>(
    null,
  );
  const [returnTarget, setReturnTarget] = useState<SupplierValidation | null>(
    null,
  );

  const { data, isLoading } = useSupplierValidations({
    status,
    companyId: companyId === 'ALL' ? undefined : companyId,
  });
  const approveMut = useApproveSupplier();
  const returnMut = useReturnSupplier();

  const rows = data?.data ?? [];
  const isReviewer = data?.isReviewer ?? false;

  async function approve(sv: SupplierValidation) {
    try {
      await approveMut.mutateAsync(sv.requisitionId);
      toast({
        title: 'Fornecedor validado',
        description: `${sv.requisition.supplierName ?? 'Fornecedor'} cadastrado no ERP. A requisição ${sv.requisition.number} seguiu para aprovação.`,
        variant: 'success',
      });
      setApproveTarget(null);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao validar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/fornecedores">
          <ArrowLeft className="size-4" />
          Fornecedores
        </Link>
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Validação de fornecedores</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Fornecedores novos (não cadastrados no ERP) que entraram numa
              requisição. Ao aprovar, o cadastro é criado no Linx e a requisição
              segue para aprovação do gestor.
            </p>
          </div>
          {companies.length > 1 && (
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas as empresas</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requisição</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>UF</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>{status === 'PENDING' ? 'Recebido' : 'Decidido'}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nenhum fornecedor {status === 'PENDING' ? 'aguardando validação' : 'nesta situação'}.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((sv) => (
                <TableRow key={sv.id}>
                  <TableCell>
                    <Link
                      to={`/requisicoes/${sv.requisitionId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {sv.requisition.number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sv.requisition.requester?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {sv.requisition.supplierName ?? '—'}
                    </div>
                    {sv.requisition.supplierFantasia && (
                      <div className="text-xs text-muted-foreground">
                        {sv.requisition.supplierFantasia}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {maskCnpj(sv.supplierCnpj || sv.requisition.supplierCnpj)}
                  </TableCell>
                  <TableCell>{sv.requisition.supplierUf ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(sv.requisition.totalAmount))}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(status === 'PENDING' ? sv.createdAt : sv.decidedAt ?? sv.createdAt)}
                  </TableCell>
                  <TableCell>
                    {sv.status === 'PENDING' && isReviewer ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReturnTarget(sv)}
                        >
                          <Undo2 className="size-4" />
                          Devolver
                        </Button>
                        <Button size="sm" onClick={() => setApproveTarget(sv)}>
                          <Check className="size-4" />
                          Aprovar
                        </Button>
                      </div>
                    ) : sv.status === 'RETURNED' && sv.justification ? (
                      <span className="text-xs text-muted-foreground" title={sv.justification}>
                        Devolvido: {sv.justification.slice(0, 40)}
                        {sv.justification.length > 40 ? '…' : ''}
                      </span>
                    ) : sv.status === 'APPROVED' ? (
                      <span className="text-xs text-emerald-600">
                        Cadastrado {sv.supplierErpCode ? `(${sv.supplierErpCode})` : ''}
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {!isReviewer && (
            <p className="text-xs text-muted-foreground">
              Você vê aqui os fornecedores das suas próprias requisições. A
              validação é feita pela equipe Fiscal/Revisor.
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(o) => !o && setApproveTarget(null)}
        title="Validar e cadastrar fornecedor"
        description={
          approveTarget
            ? `Cadastrar "${approveTarget.requisition.supplierName ?? 'fornecedor'}" (CNPJ ${maskCnpj(approveTarget.supplierCnpj)}) no ERP e liberar a requisição ${approveTarget.requisition.number} para aprovação?`
            : undefined
        }
        confirmLabel="Aprovar e cadastrar"
        onConfirm={async () => {
          if (approveTarget) await approve(approveTarget);
        }}
      />

      <ReturnDialog
        target={returnTarget}
        onOpenChange={(o) => !o && setReturnTarget(null)}
        onSubmit={async (justification) => {
          if (!returnTarget) return;
          try {
            await returnMut.mutateAsync({
              requisitionId: returnTarget.requisitionId,
              justification,
            });
            toast({
              title: 'Fornecedor devolvido',
              description: `A requisição ${returnTarget.requisition.number} voltou para o solicitante.`,
              variant: 'success',
            });
            setReturnTarget(null);
          } catch (err) {
            const msg = isAxiosError(err)
              ? (err.response?.data as { message?: string })?.message
              : null;
            toast({
              title: 'Falha ao devolver',
              description: msg || 'Tente novamente.',
              variant: 'destructive',
            });
          }
        }}
        pending={returnMut.isPending}
      />
    </div>
  );
}

function ReturnDialog({
  target,
  onOpenChange,
  onSubmit,
  pending,
}: {
  target: SupplierValidation | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (justification: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Devolver fornecedor</DialogTitle>
          <DialogDescription>
            A requisição {target?.requisition.number} volta para o solicitante
            ajustar os dados do fornecedor. Explique o motivo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Motivo da devolução</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: CNPJ divergente do informado na nota; razão social incompleta…"
            rows={4}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={pending || reason.trim().length < 3}
            onClick={() => onSubmit(reason.trim())}
          >
            {pending ? 'Devolvendo…' : 'Devolver'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
