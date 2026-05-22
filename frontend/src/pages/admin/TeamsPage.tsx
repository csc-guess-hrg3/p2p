import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Workflow,
} from 'lucide-react';
import {
  useCreateTeam,
  useDeactivateTeam,
  useSetApprovalLevels,
  useTeam,
  useTeams,
  useUpdateTeam,
  type ApprovalLevelInput,
} from '@/lib/teams';
import { useUsers, type AdminUser } from '@/lib/users';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
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

function NewTeamButton() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const createMut = useCreateTeam();

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await createMut.mutateAsync(name.trim());
      toast({ title: 'Equipe criada', description: name, variant: 'success' });
      setName('');
      setOpen(false);
    } catch {
      toast({ title: 'Falha ao criar', variant: 'destructive' });
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nova equipe
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova equipe</DialogTitle>
            <DialogDescription>
              Equipes agrupam usuários para definir escopo e cadeia de
              aprovação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Nome</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMut.isPending}>
              {createMut.isPending ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ApprovalLevelsDialog({
  teamId,
  open,
  onOpenChange,
  approvers,
}: {
  teamId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  approvers: AdminUser[];
}) {
  const { toast } = useToast();
  const { data: team } = useTeam(open ? teamId : undefined);
  const setLevelsMut = useSetApprovalLevels();
  const [levels, setLevels] = useState<ApprovalLevelInput[]>([]);

  useEffect(() => {
    if (!team?.approvalLevels) return;
    setLevels(
      team.approvalLevels
        .slice()
        .sort((a, b) => a.level - b.level)
        .map((l) => ({
          level: l.level,
          name: l.name,
          approverId: l.approverId,
          maxAmount: l.maxAmount != null ? Number(l.maxAmount) : null,
        })),
    );
  }, [team?.approvalLevels]);

  function addLevel() {
    const next = levels.length + 1;
    setLevels((p) => [
      ...p,
      { level: next, name: `Nível ${next}`, approverId: '', maxAmount: null },
    ]);
  }
  function removeLevel(idx: number) {
    setLevels((p) =>
      p.filter((_, i) => i !== idx).map((l, i) => ({ ...l, level: i + 1 })),
    );
  }
  function patchLevel(idx: number, patch: Partial<ApprovalLevelInput>) {
    setLevels((p) => p.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (levels.some((l) => !l.approverId || !l.name)) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Cada nível precisa de nome e aprovador.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await setLevelsMut.mutateAsync({ id: teamId, levels });
      toast({ title: 'Cadeia salva', variant: 'success' });
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao salvar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cadeia de aprovação — {team?.name ?? ''}</DialogTitle>
          <DialogDescription>
            Define quem aprova cada nível e o valor máximo (alçada). O fluxo
            roda na ordem; nível sem alçada equivale a "sem limite".
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {levels.map((l, idx) => (
            <div
              key={idx}
              className="grid grid-cols-12 items-end gap-2 rounded-md border p-2"
            >
              <div className="col-span-1 text-center text-sm font-semibold">
                {l.level}
              </div>
              <div className="col-span-3 space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input
                  className="h-9"
                  value={l.name}
                  onChange={(e) => patchLevel(idx, { name: e.target.value })}
                />
              </div>
              <div className="col-span-5 space-y-1.5">
                <Label className="text-xs">Aprovador</Label>
                <Select
                  value={l.approverId}
                  onValueChange={(v) => patchLevel(idx, { approverId: v })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvers.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">Alçada</Label>
                <CurrencyInput
                  className="h-9"
                  nullable
                  placeholder="Sem limite"
                  value={l.maxAmount}
                  onChange={(v) => patchLevel(idx, { maxAmount: v })}
                />
              </div>
              <div className="col-span-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeLevel(idx)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addLevel}>
            <Plus className="size-4" />
            Adicionar nível
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={setLevelsMut.isPending}>
            <Save className="size-4" />
            {setLevelsMut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TeamsPage() {
  const { toast } = useToast();
  const { data: teams = [], isLoading } = useTeams();
  const { data: usersPage } = useUsers({ status: 'ACTIVE' });
  const updateMut = useUpdateTeam();
  const deactivateMut = useDeactivateTeam();
  const [levelsOpenFor, setLevelsOpenFor] = useState<string | null>(null);

  const approvers = (usersPage?.data ?? []).filter(
    (u) => u.profile === 'MANAGER' || u.profile === 'ADMIN',
  );

  async function rename(id: string, name: string) {
    try {
      await updateMut.mutateAsync({ id, patch: { name } });
    } catch {
      toast({ title: 'Falha ao renomear', variant: 'destructive' });
    }
  }
  async function deactivate(id: string, name: string) {
    if (!confirm(`Desativar a equipe "${name}"?`)) return;
    try {
      await deactivateMut.mutateAsync(id);
      toast({ title: 'Equipe desativada', variant: 'success' });
    } catch {
      toast({ title: 'Falha ao desativar', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin">
            <ArrowLeft className="size-4" />
            Administração
          </Link>
        </Button>
        <NewTeamButton />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipes e cadeias de aprovação</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Níveis de aprovação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhuma equipe cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {teams.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Input
                      defaultValue={t.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== t.name) rename(t.id, v);
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {(t.approvalLevels?.length ?? 0)} nível(eis)
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.active ? 'Ativa' : 'Inativa'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLevelsOpenFor(t.id)}
                      >
                        <Workflow className="size-4" />
                        Cadeia de aprovação
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivate(t.id, t.name)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {levelsOpenFor && (
        <ApprovalLevelsDialog
          teamId={levelsOpenFor}
          open={!!levelsOpenFor}
          onOpenChange={(v) => !v && setLevelsOpenFor(null)}
          approvers={approvers}
        />
      )}
    </div>
  );
}
