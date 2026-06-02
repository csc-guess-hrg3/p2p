import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  AlertTriangle,
  ArrowLeft,
  GripVertical,
  Plus,
  Save,
  Split,
  Trash2,
  Workflow,
} from 'lucide-react';
import { TeamRateiosDialog } from './TeamRateiosDialog';
import {
  useCreateTeam,
  useDeactivateTeam,
  useSetApprovalLevels,
  useTeam,
  useTeams,
  useSetTeamModules,
  useUpdateTeam,
  type ApprovalLevelInput,
} from '@/lib/teams';
import { useUsers, type AdminUser } from '@/lib/users';
import { usePositions } from '@/lib/positions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { MODULE_LABEL, type Module } from '@/components/layout/nav';
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

  const { data: positions = [] } = usePositions();

  useEffect(() => {
    if (!team?.approvalLevels) return;
    setLevels(
      team.approvalLevels
        .slice()
        .sort((a, b) => a.level - b.level)
        .map((l) => ({
          level: l.level,
          name: l.name,
          approverId: l.approverId ?? null,
          requiredPositionId: l.requiredPositionId ?? null,
          scopeByBranch: l.scopeByBranch ?? false,
          maxAmount: l.maxAmount != null ? Number(l.maxAmount) : null,
        })),
    );
  }, [team?.approvalLevels]);

  function addLevel() {
    const next = levels.length + 1;
    // Default: aprovador fixo (modo clássico). Admin troca pra "por cargo"
    // pelo radio.
    setLevels((p) => [
      ...p,
      {
        level: next,
        name: '',
        approverId: null,
        requiredPositionId: null,
        scopeByBranch: false,
        maxAmount: null,
      },
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
  /** Reordena o array movendo o item de `from` pra posição `to`. */
  function moveLevel(from: number, to: number) {
    setLevels((p) => {
      if (from === to || to < 0 || to >= p.length) return p;
      const arr = p.slice();
      const [removed] = arr.splice(from, 1);
      arr.splice(to, 0, removed);
      // Renumera level pra refletir a ordem visual.
      return arr.map((l, i) => ({ ...l, level: i + 1 }));
    });
  }

  /**
   * Detecta inconsistência de alçada — nível N+1 com alçada menor que
   * N quebra a regra "topo da cadeia cobre mais". A UI marca o problema
   * em vermelho e o save() bloqueia até resolver.
   */
  const levelErrors = useMemo(() => {
    const errors: (string | null)[] = levels.map(() => null);
    for (let i = 1; i < levels.length; i++) {
      const prev = levels[i - 1].maxAmount;
      const curr = levels[i].maxAmount;
      // Anterior sem limite + atual com limite → atual cobre menos. Inválido.
      if (prev === null && curr !== null) {
        errors[i] = 'Alçada menor que o nível anterior (sem limite).';
        continue;
      }
      // Ambos com limite, atual < anterior → inválido.
      if (prev !== null && curr !== null && curr < prev) {
        errors[i] = `Alçada precisa ser ≥ R$ ${prev.toLocaleString('pt-BR')}.`;
      }
    }
    return errors;
  }, [levels]);
  const hasLevelError = levelErrors.some((e) => e !== null);

  // Índice da linha sendo arrastada (HTML5 DnD) — nullable.
  const [dragFrom, setDragFrom] = useState<number | null>(null);

  async function save() {
    // Cada nível precisa de nome + um aprovador (fixo OU por cargo).
    const missing = levels.some((l) => {
      if (!l.name) return true;
      const hasFixed = !!l.approverId;
      const hasPos = !!l.requiredPositionId;
      return hasFixed === hasPos; // nenhum ou os dois → inválido
    });
    if (missing) {
      toast({
        title: 'Campos obrigatórios',
        description:
          'Cada nível precisa de nome + aprovador fixo ou por cargo (não ambos).',
        variant: 'destructive',
      });
      return;
    }
    if (hasLevelError) {
      toast({
        title: 'Alçadas inconsistentes',
        description:
          'A alçada de um nível superior precisa ser ≥ à do nível anterior.',
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
          {levels.map((l, idx) => {
            const err = levelErrors[idx];
            const isDragging = dragFrom === idx;
            return (
              <div
                key={idx}
                onDragOver={(e) => {
                  // Permite o drop
                  if (dragFrom !== null) e.preventDefault();
                }}
                onDrop={() => {
                  if (dragFrom !== null) {
                    moveLevel(dragFrom, idx);
                    setDragFrom(null);
                  }
                }}
                className={`grid grid-cols-12 items-end gap-2 rounded-md border p-2 transition-opacity ${
                  isDragging ? 'opacity-40' : ''
                } ${err ? 'border-destructive/50' : ''}`}
              >
                <div
                  className="col-span-1 flex cursor-grab items-center justify-center gap-1 text-sm font-semibold active:cursor-grabbing"
                  draggable
                  onDragStart={() => setDragFrom(idx)}
                  onDragEnd={() => setDragFrom(null)}
                  title="Arraste pra reordenar"
                >
                  <GripVertical className="size-3.5 text-muted-foreground" />
                  {l.level}
                </div>
                <div className="col-span-3 space-y-1.5">
                  <Label className="text-xs">Cargo</Label>
                  <Input
                    className="h-9"
                    placeholder="ex.: Gestor"
                    value={l.name}
                    onChange={(e) =>
                      patchLevel(idx, { name: e.target.value })
                    }
                  />
                </div>
                <div className="col-span-5 space-y-1.5">
                  <Label className="text-xs">Aprovador</Label>
                  <div className="flex gap-2">
                    <Select
                      value={l.requiredPositionId ? 'POSITION' : 'FIXED'}
                      onValueChange={(v) =>
                        // Troca de modo: limpa o outro campo pra
                        // garantir mutua exclusividade.
                        patchLevel(idx, {
                          approverId: v === 'POSITION' ? null : l.approverId,
                          requiredPositionId:
                            v === 'POSITION' ? l.requiredPositionId : null,
                          scopeByBranch:
                            v === 'POSITION' ? l.scopeByBranch : false,
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-32 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Pessoa</SelectItem>
                        <SelectItem value="POSITION">Por cargo</SelectItem>
                      </SelectContent>
                    </Select>
                    {l.requiredPositionId !== undefined &&
                    l.requiredPositionId !== null ? (
                      <Select
                        value={l.requiredPositionId ?? ''}
                        onValueChange={(v) =>
                          patchLevel(idx, { requiredPositionId: v })
                        }
                      >
                        <SelectTrigger className="h-9 flex-1">
                          <SelectValue placeholder="Selecione o cargo" />
                        </SelectTrigger>
                        <SelectContent>
                          {positions
                            .filter((p) => p.active)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={l.approverId ?? ''}
                        onValueChange={(v) =>
                          patchLevel(idx, { approverId: v })
                        }
                      >
                        <SelectTrigger className="h-9 flex-1">
                          <SelectValue placeholder="Selecione a pessoa" />
                        </SelectTrigger>
                        <SelectContent>
                          {approvers.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {l.requiredPositionId !== undefined &&
                    l.requiredPositionId !== null && (
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={!!l.scopeByBranch}
                          onChange={(e) =>
                            patchLevel(idx, { scopeByBranch: e.target.checked })
                          }
                        />
                        Filtrar pela filial da requisição
                      </label>
                    )}
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Alçada</Label>
                  <CurrencyInput
                    className={`h-9 ${err ? 'border-destructive' : ''}`}
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
                {err && (
                  <p className="col-span-12 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="size-3" />
                    {err}
                  </p>
                )}
              </div>
            );
          })}
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
  const modulesMut = useSetTeamModules();
  const deactivateMut = useDeactivateTeam();
  const [levelsOpenFor, setLevelsOpenFor] = useState<string | null>(null);
  const [rateiosOpenFor, setRateiosOpenFor] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string } | null>(null);

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
  async function deactivate(id: string) {
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
         <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Níveis de aprovação</TableHead>
                <TableHead title="Módulos extras liberados para os membros da equipe">
                  Módulos extras
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && teams.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
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
                  <TableCell>
                    <TeamModulesCell
                      teamId={t.id}
                      current={(t.moduleAccess ?? []).map((m) => m.module)}
                      onSave={(modules) =>
                        modulesMut.mutate({ id: t.id, modules })
                      }
                      busy={modulesMut.isPending}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.active ? 'Ativa' : 'Inativa'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRateiosOpenFor(t.id)}
                        title="Definir os rateios que esta equipe pode usar"
                      >
                        <Split className="size-4" />
                        Rateios
                      </Button>
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
                        onClick={() => setDeactivateTarget({ id: t.id, name: t.name })}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
         </div>
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
      {rateiosOpenFor && (
        <TeamRateiosDialog
          teamId={rateiosOpenFor}
          open={!!rateiosOpenFor}
          onOpenChange={(v) => !v && setRateiosOpenFor(null)}
        />
      )}
      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
        title="Desativar equipe"
        description={
          deactivateTarget
            ? `Desativar a equipe "${deactivateTarget.name}"?`
            : undefined
        }
        confirmLabel="Desativar"
        variant="destructive"
        onConfirm={async () => {
          if (!deactivateTarget) return;
          await deactivate(deactivateTarget.id);
          setDeactivateTarget(null);
        }}
      />
    </div>
  );
}

/**
 * Célula com botão "Selecionar (N)" que abre um popover com checkboxes
 * dos módulos conhecidos. Persiste no `onSave` quando o usuário clica
 * fora ou aperta "Aplicar".
 */
function TeamModulesCell({
  current,
  onSave,
  busy,
}: {
  teamId: string;
  current: string[];
  onSave: (modules: string[]) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(current);
  // Sincroniza quando o usuário abre o popover (poderia ter mudado fora).
  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);
  const KEYS = Object.keys(MODULE_LABEL) as Module[];
  function toggle(m: Module, checked: boolean) {
    setDraft((d) => (checked ? [...d, m] : d.filter((x) => x !== m)));
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 min-w-44 justify-start">
          {current.length === 0 ? (
            <span className="text-muted-foreground">Nenhum</span>
          ) : (
            <span className="truncate">
              {current
                .map((m) => MODULE_LABEL[m as Module] ?? m)
                .join(', ')}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Liberar módulos
        </p>
        <ul className="space-y-1.5">
          {KEYS.map((m) => (
            <li key={m}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.includes(m)}
                  onChange={(e) => toggle(m, e.target.checked)}
                />
                {MODULE_LABEL[m]}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDraft(current);
              setOpen(false);
            }}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
            disabled={busy}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
