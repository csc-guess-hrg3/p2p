import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useUsers } from '@/lib/users';
import { extractApiMessage } from '@/lib/api-errors';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';

const PAPEL: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  REVIEWER: 'Revisor',
};

/** Seletor "Simular login" (admin) — busca um usuário e assume a visão dele. */
export function SimularLoginDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const users = useUsers({
    search: search.trim() || undefined,
    status: 'ACTIVE',
    take: 30,
  });

  const onPick = async (id: string) => {
    setBusy(id);
    try {
      const me = await impersonate(id);
      onOpenChange(false);
      navigate(me.realm === 'EXTERNAL' ? '/externo' : '/', { replace: true });
    } catch (e) {
      toast({
        title: 'Não foi possível simular',
        description: extractApiMessage(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const list = users.data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Simular login</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Veja o sistema como outro usuário. Toda ação continua registrada como
          feita por você.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-8"
            placeholder="Buscar por nome ou e-mail…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="-mx-1 max-h-80 space-y-1 overflow-y-auto px-1">
          {users.isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">Carregando…</p>
          ) : list.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Nenhum usuário encontrado.
            </p>
          ) : (
            list.map((u) => (
              <button
                key={u.id}
                type="button"
                disabled={!!busy}
                onClick={() => void onPick(u.id)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition hover:border-primary hover:bg-accent disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{u.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {u.email}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  {busy === u.id
                    ? 'Entrando…'
                    : (PAPEL[u.profile] ?? u.profile)}
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
