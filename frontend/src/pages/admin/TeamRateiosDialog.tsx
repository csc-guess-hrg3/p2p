import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useCompany } from '@/lib/company';
import { useBranchRateios, useCcRateios } from '@/lib/integration';
import {
  useSetTeamBranchRateios,
  useSetTeamCcRateios,
  useTeam,
} from '@/lib/teams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  teamId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Tab = 'BRANCH' | 'CC';

/**
 * Diálogo para o Admin definir quais rateios cada equipe pode usar,
 * por empresa.
 *
 * A lista da esquerda mostra **todos** os rateios do ERP (via `scope=all`).
 * O usuário marca quais estão liberados; "Salvar" persiste com substituição
 * total para aquela empresa. Cada aba (Filial / CC) tem seu próprio botão
 * porque os endpoints são separados — assim quem só mexeu numa aba não
 * precisa enviar a outra.
 */
export function TeamRateiosDialog({ teamId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: team } = useTeam(open ? teamId : undefined);
  const { companies } = useCompany();
  const [tab, setTab] = useState<Tab>('BRANCH');
  const [companyId, setCompanyId] = useState<string>('');

  // Seleciona a primeira empresa ao abrir (ou quando companies chega).
  useEffect(() => {
    if (open && companies.length > 0 && !companyId) {
      setCompanyId(companies[0].id);
    }
  }, [open, companies, companyId]);

  const companyCode = useMemo(
    () => companies.find((c) => c.id === companyId)?.code,
    [companies, companyId],
  );

  const branchQuery = useBranchRateios(companyCode, 'all');
  const ccQuery = useCcRateios(companyCode, 'all');
  const setBranchMut = useSetTeamBranchRateios();
  const setCcMut = useSetTeamCcRateios();

  // Conjuntos atuais — convertidos pro estado local pra marcar/desmarcar.
  const [branchSelected, setBranchSelected] = useState<Set<string>>(new Set());
  const [ccSelected, setCcSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Sincroniza quando o team chega ou a empresa muda.
  useEffect(() => {
    if (!team || !companyId) return;
    setBranchSelected(
      new Set(
        (team.branchRateios ?? [])
          .filter((r) => r.companyId === companyId)
          .map((r) => r.branchRateioCode),
      ),
    );
    setCcSelected(
      new Set(
        (team.costCenterRateios ?? [])
          .filter((r) => r.companyId === companyId)
          .map((r) => r.costCenterRateioCode),
      ),
    );
  }, [team, companyId]);

  // Reseta busca ao trocar de aba.
  useEffect(() => {
    setSearch('');
  }, [tab]);

  const isBranch = tab === 'BRANCH';
  const allItems = (isBranch ? branchQuery.data : ccQuery.data) ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter(
      (r) =>
        r.codigo.toLowerCase().includes(q) ||
        r.descricao.toLowerCase().includes(q),
    );
  }, [allItems, search]);

  const selected = isBranch ? branchSelected : ccSelected;
  const setSelected = isBranch ? setBranchSelected : setCcSelected;

  function toggle(code: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }
  function selectAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((r) => r.codigo)) : new Set());
  }

  async function save() {
    if (!companyId) return;
    // Para a aba ativa, monta a lista final mesclando entradas de OUTRAS
    // empresas (que não mexemos) com a seleção atual (companyId).
    const otherBranch = (team?.branchRateios ?? []).filter(
      (r) => r.companyId !== companyId,
    );
    const otherCc = (team?.costCenterRateios ?? []).filter(
      (r) => r.companyId !== companyId,
    );

    try {
      if (isBranch) {
        const merged = [
          ...otherBranch.map((r) => ({
            companyId: r.companyId,
            code: r.branchRateioCode,
          })),
          ...Array.from(branchSelected).map((code) => ({ companyId, code })),
        ];
        await setBranchMut.mutateAsync({ id: teamId, rateios: merged });
      } else {
        const merged = [
          ...otherCc.map((r) => ({
            companyId: r.companyId,
            code: r.costCenterRateioCode,
          })),
          ...Array.from(ccSelected).map((code) => ({ companyId, code })),
        ];
        await setCcMut.mutateAsync({ id: teamId, rateios: merged });
      }
      toast({ title: 'Rateios atualizados', variant: 'success' });
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

  const pending = isBranch ? setBranchMut.isPending : setCcMut.isPending;
  const allChecked =
    filtered.length > 0 && filtered.every((r) => selected.has(r.codigo));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Rateios da equipe — {team?.name ?? ''}</DialogTitle>
          <DialogDescription>
            Defina quais templates de rateio os membros desta equipe podem
            usar nas requisições. A lista da requisição só mostra o que
            estiver marcado aqui.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-9 w-full sm:w-72">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {(['BRANCH', 'CC'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t === 'BRANCH' ? 'Filial' : 'Centro de custo'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              className="h-8"
              placeholder="Filtrar por código ou descrição…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="flex shrink-0 items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => selectAll(e.target.checked)}
              />
              Marcar todos
            </label>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {(isBranch ? branchQuery.isLoading : ccQuery.isLoading) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum rateio encontrado.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((r) => (
                  <li key={r.codigo}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={selected.has(r.codigo)}
                        onChange={(e) => toggle(r.codigo, e.target.checked)}
                      />
                      <span className="w-24 font-mono text-xs text-muted-foreground">
                        {r.codigo}
                      </span>
                      <span className="flex-1 truncate">{r.descricao}</span>
                      {r.inativo && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          inativo
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.size} de {allItems.length} marcados.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Fechar
          </Button>
          <Button onClick={save} disabled={pending || !companyId}>
            {pending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
