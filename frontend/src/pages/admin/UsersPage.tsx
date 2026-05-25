import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, Building2, Search, UserX } from 'lucide-react';
import { UserCompaniesDialog } from './UserCompaniesDialog';
import {
  useUsers,
  useUpdateUser,
  useDeactivateUser,
  type AdminUser,
} from '@/lib/users';
import { useTeams } from '@/lib/teams';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
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

const PROFILES = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'MANAGER', label: 'Gestor' },
  { value: 'OPERATOR', label: 'Operador' },
  { value: 'REVIEWER', label: 'Revisor / Fiscal' },
];
const STATUSES = [
  { value: 'ALL', label: 'Todos os status' },
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'PENDING_SETUP', label: 'Pendente de configuração' },
  { value: 'INACTIVE', label: 'Inativo' },
];
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo',
  PENDING_SETUP: 'Pendente',
  INACTIVE: 'Inativo',
};

export function UsersPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [companiesFor, setCompaniesFor] = useState<AdminUser | null>(null);

  const { data, isLoading } = useUsers({
    status: status === 'ALL' ? undefined : status,
    search: search || undefined,
  });
  const { data: teams = [] } = useTeams();
  const updateMut = useUpdateUser();
  const deactivateMut = useDeactivateUser();

  const rows = data?.data ?? [];

  async function patchUser(id: string, patch: Parameters<typeof updateMut.mutateAsync>[0]['patch']) {
    try {
      await updateMut.mutateAsync({ id, patch });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao atualizar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  async function deactivate(u: AdminUser) {
    if (!confirm(`Desativar ${u.name}? O acesso será revogado.`)) return;
    try {
      await deactivateMut.mutateAsync(u.id);
      toast({
        title: 'Usuário desativado',
        description: u.name,
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Falha ao desativar',
        description: u.name,
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin">
          <ArrowLeft className="size-4" />
          Administração
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar por nome ou login…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Equipe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead title="Habilita o seletor PROD/HML na topbar para usuários não-Admin">
                  HML
                </TableHead>
                <TableHead>Criado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Nenhum usuário.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.adUsername}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.profile}
                      onValueChange={(v) => patchUser(u.id, { profile: v })}
                    >
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROFILES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.teamId ?? 'NONE'}
                      onValueChange={(v) =>
                        patchUser(u.id, { teamId: v === 'NONE' ? null : v })
                      }
                    >
                      <SelectTrigger className="h-9 w-56">
                        <SelectValue placeholder="Sem equipe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">— Sem equipe —</SelectItem>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={u.status}
                      onValueChange={(v) => patchUser(u.id, { status: v })}
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_LABEL).map(([k, l]) => (
                          <SelectItem key={k} value={k}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.profile === 'ADMIN' ? (
                      <span className="text-xs text-muted-foreground">
                        sempre
                      </span>
                    ) : (
                      <Switch
                        checked={u.canSwitchEnv}
                        onCheckedChange={(v) =>
                          patchUser(u.id, { canSwitchEnv: v })
                        }
                        aria-label="Liberar PROD↔HML"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCompaniesFor(u)}
                        title="Empresas que o usuário pode acessar"
                      >
                        <Building2 className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deactivate(u)}
                        title="Desativar"
                      >
                        <UserX className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <p className="text-xs text-muted-foreground">
            Edições de perfil, status e equipe salvam automaticamente. Criação
            de novos usuários acontece no primeiro login pelo AD.
          </p>
        </CardContent>
      </Card>

      {companiesFor && (
        <UserCompaniesDialog
          user={companiesFor}
          open={!!companiesFor}
          onOpenChange={(v) => !v && setCompaniesFor(null)}
        />
      )}
    </div>
  );
}
