import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, Plus, X } from 'lucide-react';
import {
  useCancelDelegation,
  useCreateDelegation,
  useDelegations,
  type Delegation,
} from '@/lib/delegations';
import { useUsers } from '@/lib/users';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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

function NewDelegationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const { data: usersPage } = useUsers({ status: 'ACTIVE' });
  const createMut = useCreateDelegation();
  const [delegateId, setDelegateId] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [reason, setReason] = useState('');

  async function handleCreate() {
    if (!delegateId || !startsAt || !endsAt) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe a pessoa, início e fim.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await createMut.mutateAsync({
        delegateId,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim() || undefined,
      });
      toast({ title: 'Delegação criada', variant: 'success' });
      onOpenChange(false);
      setDelegateId('');
      setStartsAt('');
      setEndsAt('');
      setReason('');
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao delegar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delegar alçada</DialogTitle>
          <DialogDescription>
            Durante o período abaixo, a pessoa escolhida vai aprovar no seu
            lugar (férias, ausência, etc.).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Delegar para</Label>
            <Select value={delegateId} onValueChange={setDelegateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a pessoa" />
              </SelectTrigger>
              <SelectContent>
                {(usersPage?.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Início</Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim</Label>
              <Input
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: férias de 15 a 30/01."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={createMut.isPending}>
            {createMut.isPending ? 'Criando…' : 'Delegar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DelegationTable({
  rows,
  loading,
  perspective,
}: {
  rows: Delegation[];
  loading: boolean;
  perspective: 'given' | 'received';
}) {
  const { toast } = useToast();
  const cancelMut = useCancelDelegation();
  const [cancelTarget, setCancelTarget] = useState<Delegation | null>(null);
  async function cancel(d: Delegation) {
    try {
      await cancelMut.mutateAsync(d.id);
      toast({ title: 'Delegação cancelada', variant: 'success' });
    } catch {
      toast({ title: 'Falha ao cancelar', variant: 'destructive' });
    }
  }
  return (
    <>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            {perspective === 'given' ? 'Delegada para' : 'Delegada por'}
          </TableHead>
          <TableHead>Início</TableHead>
          <TableHead>Fim</TableHead>
          <TableHead>Motivo</TableHead>
          <TableHead>Status</TableHead>
          {perspective === 'given' && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading && (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              Carregando…
            </TableCell>
          </TableRow>
        )}
        {!loading && rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
              Nenhuma delegação.
            </TableCell>
          </TableRow>
        )}
        {rows.map((d) => {
          const expired = new Date(d.endsAt) < new Date();
          const cancelled = !!d.cancelledAt;
          const active = !expired && !cancelled;
          const label = cancelled
            ? 'Cancelada'
            : expired
              ? 'Expirada'
              : 'Ativa';
          return (
            <TableRow key={d.id}>
              <TableCell>
                {perspective === 'given'
                  ? d.delegate?.name ?? d.delegateId
                  : d.delegator?.name ?? d.delegatorId}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(d.startsAt)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(d.endsAt)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {d.reason ?? '—'}
              </TableCell>
              <TableCell
                className={
                  active
                    ? 'font-medium text-emerald-600'
                    : 'text-muted-foreground'
                }
              >
                {label}
              </TableCell>
              {perspective === 'given' && (
                <TableCell>
                  {active && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCancelTarget(d)}
                      title="Cancelar"
                    >
                      <X className="size-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    <ConfirmDialog
      open={!!cancelTarget}
      onOpenChange={(open) => !open && setCancelTarget(null)}
      title="Cancelar delegacao"
      description="A delegacao sera encerrada e nao podera mais aprovar em seu nome."
      confirmLabel="Cancelar delegacao"
      variant="destructive"
      onConfirm={async () => {
        if (!cancelTarget) return;
        await cancel(cancelTarget);
        setCancelTarget(null);
      }}
    />
    </>
  );
}

export function DelegationsPage() {
  const [open, setOpen] = useState(false);
  const given = useDelegations('given');
  const received = useDelegations('received');

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin">
            <ArrowLeft className="size-4" />
            Administração
          </Link>
        </Button>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Nova delegação
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Delegações de alçada</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="given">
            <TabsList>
              <TabsTrigger value="given">Concedidas por mim</TabsTrigger>
              <TabsTrigger value="received">Recebidas</TabsTrigger>
            </TabsList>
            <TabsContent value="given">
              <DelegationTable
                rows={given.data ?? []}
                loading={given.isLoading}
                perspective="given"
              />
            </TabsContent>
            <TabsContent value="received">
              <DelegationTable
                rows={received.data ?? []}
                loading={received.isLoading}
                perspective="received"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <NewDelegationDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
