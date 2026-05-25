import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Server,
} from 'lucide-react';
import {
  useAdApply,
  useAdPreview,
  type AdTeamSuggestion,
} from '@/lib/ad-sync';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';

/**
 * Sincronização com Active Directory: lê todos os usuários ATIVOS do AD
 * agrupados pela OU pai, e permite ao admin selecionar quais equipes
 * (com seus usuários) devem ser criadas/atualizadas no P2P.
 *
 * Equipes sem usuários ativos não aparecem aqui (o backend já filtra).
 * Usuários sem empresa identificável (OU top-level não mapeada para
 * GUESS/HRG3) aparecem mas o admin precisa escolher a empresa.
 */
export function AdSyncPage() {
  const { toast } = useToast();
  const [started, setStarted] = useState(false);
  const preview = useAdPreview(started);
  const apply = useAdApply();

  // Seleção: por equipe (nome + empresa) e por usuário.
  const [selected, setSelected] = useState<
    Record<string, { teamName: string; userLogins: Set<string> }>
  >({});

  // Quando o preview carrega, marca tudo por padrão.
  useEffect(() => {
    if (!preview.data) return;
    const init: typeof selected = {};
    for (const t of preview.data) {
      const key = `${t.companyCode ?? '?'}::${t.ouName}`;
      init[key] = {
        teamName: t.ouName,
        userLogins: new Set(t.users.map((u) => u.login)),
      };
    }
    setSelected(init);
  }, [preview.data]);

  const summary = useMemo(() => {
    let teams = 0;
    let users = 0;
    for (const t of preview.data ?? []) {
      const key = `${t.companyCode ?? '?'}::${t.ouName}`;
      const sel = selected[key];
      if (!sel || sel.userLogins.size === 0) continue;
      teams++;
      users += sel.userLogins.size;
    }
    return { teams, users };
  }, [preview.data, selected]);

  function keyOf(t: AdTeamSuggestion) {
    return `${t.companyCode ?? '?'}::${t.ouName}`;
  }

  function toggleTeam(t: AdTeamSuggestion, checked: boolean) {
    const key = keyOf(t);
    setSelected((prev) => ({
      ...prev,
      [key]: {
        teamName: prev[key]?.teamName ?? t.ouName,
        userLogins: checked
          ? new Set(t.users.map((u) => u.login))
          : new Set(),
      },
    }));
  }

  /** Marca/desmarca todas as equipes (e usuários) de uma só vez. */
  function toggleAll(checked: boolean) {
    if (!preview.data) return;
    setSelected(() => {
      const next: typeof selected = {};
      for (const t of preview.data ?? []) {
        const key = `${t.companyCode ?? '?'}::${t.ouName}`;
        next[key] = {
          teamName: t.ouName,
          userLogins: checked ? new Set(t.users.map((u) => u.login)) : new Set(),
        };
      }
      return next;
    });
  }

  const allTeamsChecked = useMemo(() => {
    if (!preview.data || preview.data.length === 0) return false;
    return preview.data.every((t) => {
      const sel = selected[`${t.companyCode ?? '?'}::${t.ouName}`];
      return !!sel && sel.userLogins.size === t.users.length;
    });
  }, [preview.data, selected]);

  const anyChecked = summary.users > 0;

  function toggleUser(t: AdTeamSuggestion, login: string, checked: boolean) {
    const key = keyOf(t);
    setSelected((prev) => {
      const cur = prev[key]?.userLogins ?? new Set<string>();
      const next = new Set(cur);
      if (checked) next.add(login);
      else next.delete(login);
      return {
        ...prev,
        [key]: { teamName: prev[key]?.teamName ?? t.ouName, userLogins: next },
      };
    });
  }

  function renameTeam(t: AdTeamSuggestion, value: string) {
    const key = keyOf(t);
    setSelected((prev) => ({
      ...prev,
      [key]: {
        teamName: value,
        userLogins: prev[key]?.userLogins ?? new Set(),
      },
    }));
  }

  async function handleApply() {
    if (!preview.data) return;
    const payload = (preview.data ?? [])
      .map((t) => {
        const sel = selected[keyOf(t)];
        if (!sel || sel.userLogins.size === 0 || !t.companyCode) return null;
        return {
          ouName: t.ouName,
          companyCode: t.companyCode,
          teamName: sel.teamName.trim() || t.ouName,
          userLogins: Array.from(sel.userLogins),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (payload.length === 0) {
      toast({
        title: 'Nada selecionado',
        description: 'Marque pelo menos uma equipe com usuários.',
        variant: 'destructive',
      });
      return;
    }
    try {
      const r = await apply.mutateAsync({ selections: payload });
      toast({
        title: 'Sincronização concluída',
        description: `${r.teamsCreated} times criados, ${r.usersCreated} usuários criados, ${r.usersLinked} vínculos com empresa.`,
        variant: 'success',
      });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao aplicar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
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
        {started && preview.data && (
          <Button
            onClick={handleApply}
            disabled={
              apply.isPending ||
              summary.teams === 0 ||
              summary.users === 0
            }
          >
            <CheckCircle2 className="size-4" />
            {apply.isPending
              ? 'Aplicando…'
              : `Aplicar (${summary.teams} times · ${summary.users} usuários)`}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5" />
            Sincronizar com Active Directory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Lê todos os usuários <strong>ativos</strong> do AD (excluindo
            os bloqueados/desabilitados) e agrupa por OU pai. Você marca
            o que quer trazer pra dentro do P2P — equipes e usuários
            inexistentes serão criados; vínculos com empresa serão
            atualizados; nada é apagado.
          </p>
          {!started ? (
            <Button onClick={() => setStarted(true)}>
              <RefreshCw className="size-4" />
              Buscar usuários do AD
            </Button>
          ) : preview.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Consultando o AD… (pode levar alguns segundos)
            </p>
          ) : preview.error ? (
            <p className="text-sm text-destructive">
              {(preview.error as Error).message ||
                'Erro ao consultar o AD.'}
            </p>
          ) : (preview.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma equipe sugerida.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm font-medium">
                <Checkbox
                  checked={
                    allTeamsChecked
                      ? true
                      : anyChecked
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
                Selecionar todos
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {(preview.data ?? []).length} equipe(s) ·{' '}
                  {(preview.data ?? []).reduce(
                    (acc, t) => acc + t.users.length,
                    0,
                  )}{' '}
                  usuário(s)
                </span>
              </label>
              {(preview.data ?? []).map((t) => {
                const key = keyOf(t);
                const sel = selected[key];
                const allChecked =
                  !!sel && sel.userLogins.size === t.users.length;
                return (
                  <div key={key} className="rounded-lg border">
                    <div className="flex items-center gap-3 border-b px-3 py-2">
                      <label className="flex items-center gap-2 text-xs font-medium">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(v) => toggleTeam(t, v === true)}
                        />
                        Selecionar equipe
                      </label>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {t.companyCode ?? 'sem empresa'}
                      </span>
                      <Input
                        className="h-8 max-w-xs"
                        value={sel?.teamName ?? t.ouName}
                        onChange={(e) => renameTeam(t, e.target.value)}
                      />
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t.users.length} usuário(s) no AD
                      </span>
                    </div>
                    <ul className="divide-y">
                      {t.users.map((u) => (
                        <li
                          key={u.login}
                          className="flex items-center gap-3 px-3 py-1.5 text-sm"
                        >
                          <Checkbox
                            checked={!!sel?.userLogins.has(u.login)}
                            onCheckedChange={(v) =>
                              toggleUser(t, u.login, v === true)
                            }
                          />
                          <span className="font-medium">{u.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {u.login}
                          </span>
                          {u.email && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {u.email}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
