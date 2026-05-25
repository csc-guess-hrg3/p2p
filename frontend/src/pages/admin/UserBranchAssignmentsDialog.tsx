import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useCompany } from '@/lib/company';
import { useBranches } from '@/lib/integration';
import {
  useSetBranchAssignments,
  useUser,
  type AdminUser,
} from '@/lib/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useToast } from '@/components/ui/use-toast';

interface Props {
  user: AdminUser;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Define as filiais que um usuário cobre. Usado pela cadeia de aprovação
 * dinâmica: quando um nível tem aprovador por cargo + filtragem por filial,
 * o engine resolve quem aprova consultando esta tabela.
 *
 * UI: seletor de empresa + busca por código/nome de filial + lista com
 * checkboxes. "Salvar" substitui o conjunto inteiro daquela empresa,
 * preservando o que está em outras empresas.
 */
export function UserBranchAssignmentsDialog({
  user,
  open,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const { companies } = useCompany();
  const { data: detailed } = useUser(open ? user.id : undefined);
  const mut = useSetBranchAssignments();

  const [companyId, setCompanyId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || companies.length === 0) return;
    if (!companyId) setCompanyId(companies[0].id);
  }, [open, companies, companyId]);

  const companyCode = useMemo(
    () => companies.find((c) => c.id === companyId)?.code,
    [companies, companyId],
  );
  const branchesQuery = useBranches(companyCode);

  // Sincroniza seleção com as assignments atuais quando o user/empresa muda.
  useEffect(() => {
    if (!detailed || !companyId) {
      setSelected(new Set());
      return;
    }
    setSelected(
      new Set(
        (detailed.branchAssignments ?? [])
          .filter((b) => b.companyId === companyId)
          .map((b) => b.branchErpCode),
      ),
    );
  }, [detailed, companyId]);

  useEffect(() => {
    if (open) setSearch('');
  }, [open, companyId]);

  const filtered = useMemo(() => {
    const branches = branchesQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) =>
        b.codigo.toLowerCase().includes(q) ||
        b.nome.toLowerCase().includes(q),
    );
  }, [branchesQuery.data, search]);

  function toggle(code: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
  }
  function selectAllFiltered(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const b of filtered) {
        if (checked) next.add(b.codigo);
        else next.delete(b.codigo);
      }
      return next;
    });
  }

  async function save() {
    if (!detailed || !companyId) return;
    // Preserva entradas de outras empresas.
    const others = (detailed.branchAssignments ?? []).filter(
      (b) => b.companyId !== companyId,
    );
    const thisCompany = Array.from(selected).map((code) => ({
      companyId,
      branchErpCode: code,
    }));
    try {
      await mut.mutateAsync({
        id: user.id,
        assignments: [...others, ...thisCompany],
      });
      toast({ title: 'Filiais atualizadas', variant: 'success' });
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

  const allChecked =
    filtered.length > 0 && filtered.every((b) => selected.has(b.codigo));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Filiais — {user.name}</DialogTitle>
          <DialogDescription>
            Defina as filiais que este usuário cobre. Combinado com o cargo
            dele, a cadeia de aprovação dinâmica usa esta lista para
            resolver quem aprova requisições de cada filial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="h-9 sm:w-60">
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
            <Input
              className="h-9 flex-1"
              placeholder="Filtrar por código ou nome…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="flex shrink-0 items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) => selectAllFiltered(e.target.checked)}
              />
              Marcar todos
            </label>
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {branchesQuery.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Carregando…
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma filial encontrada.
              </p>
            ) : (
              <ul className="divide-y">
                {filtered.map((b) => (
                  <li key={b.codigo}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={selected.has(b.codigo)}
                        onChange={(e) => toggle(b.codigo, e.target.checked)}
                      />
                      <span className="w-16 font-mono text-xs text-muted-foreground">
                        {b.codigo}
                      </span>
                      <span className="flex-1 truncate">{b.nome}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {selected.size} marcadas nesta empresa.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Fechar
          </Button>
          <Button onClick={save} disabled={mut.isPending || !companyId}>
            {mut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
