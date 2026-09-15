import { useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { Search, UserPlus, X } from 'lucide-react';
import { useUsers, useUpdateUser, type AdminUser } from '@/lib/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  teamId: string;
  teamName: string;
}

/**
 * Gerencia os PARTICIPANTES de uma equipe direto na tela de Equipes — sem ir de
 * usuário em usuário na tela de Usuários. Cada usuário pertence a UMA equipe
 * (User.teamId), então adicionar aqui move o usuário para esta equipe. Reaproveita
 * o update de usuário (mesmo endpoint da tela de Usuários).
 */
export function TeamMembersDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: usersPage } = useUsers({ status: 'ACTIVE', take: 1000 });
  const updateUser = useUpdateUser();
  const [search, setSearch] = useState('');

  const all = usersPage?.data ?? [];
  const members = useMemo(
    () =>
      all
        .filter((u) => u.teamId === teamId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [all, teamId],
  );
  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter(
        (u) => u.teamId !== teamId && (u.realm ?? 'INTERNAL') !== 'EXTERNAL',
      )
      .filter(
        (u) =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          (u.email ?? '').toLowerCase().includes(q) ||
          (u.adUsername ?? '').toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [all, teamId, search]);

  async function setTeam(u: AdminUser, next: string | null) {
    try {
      await updateUser.mutateAsync({ id: u.id, patch: { teamId: next } });
      // Atualiza a contagem de membros na listagem de equipes.
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast({
        title: next ? 'Adicionado à equipe' : 'Removido da equipe',
        description: u.name,
        variant: 'success',
      });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao atualizar',
        description: msg || 'Tente de novo.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Membros — {teamName}</DialogTitle>
          <DialogDescription>
            Cada usuário pertence a UMA equipe. Adicionar aqui move o usuário para
            esta equipe (sai da anterior, se tiver). Só usuários internos aparecem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Adicionar participante</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por nome, e-mail ou login…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {available.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  Nenhum usuário disponível.
                </div>
              )}
              {available.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  disabled={updateUser.isPending}
                  onClick={() => setTeam(u, teamId)}
                  className="flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent disabled:opacity-50"
                >
                  <span className="truncate">
                    <span className="font-medium">{u.name}</span>
                    {u.team?.name ? (
                      <span className="text-xs text-muted-foreground">
                        {' '}
                        · {u.team.name}
                      </span>
                    ) : null}
                  </span>
                  <UserPlus className="size-4 shrink-0 text-primary" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Participantes ({members.length})</p>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {members.length === 0 && (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  Nenhum participante ainda.
                </div>
              )}
              {members.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-2 border-b px-3 py-2 text-sm last:border-0"
                >
                  <span className="truncate">
                    <span className="font-medium">{u.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">
                      {u.email}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={updateUser.isPending}
                    title="Remover da equipe"
                    onClick={() => setTeam(u, null)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
