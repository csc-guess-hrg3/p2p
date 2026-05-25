import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useCompany } from '@/lib/company';
import { useSetUserCompanies, type AdminUser } from '@/lib/users';
import { Button } from '@/components/ui/button';
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
  user: AdminUser;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Define a quais empresas o usuário tem acesso. O JIT (primeiro login AD)
 * vincula a uma empresa quando a OU top-level bate em GUESS/HRG3; nos
 * outros casos, ou quando se quer dar acesso a múltiplas empresas, o
 * Admin usa este diálogo.
 */
export function UserCompaniesDialog({ user, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { companies } = useCompany();
  const mut = useSetUserCompanies();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSelected(
      new Set(
        (user.companies ?? []).map((c) => c.companyId).filter(Boolean) as string[],
      ),
    );
  }, [open, user.companies]);

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    try {
      await mut.mutateAsync({ id: user.id, companyIds: Array.from(selected) });
      toast({ title: 'Empresas atualizadas', variant: 'success' });
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empresas — {user.name}</DialogTitle>
          <DialogDescription>
            Marque as empresas em que o usuário pode operar. Sem nenhuma
            marcada, ele fica restrito ao próprio cadastro.
          </DialogDescription>
        </DialogHeader>

        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma empresa cadastrada.
          </p>
        ) : (
          <ul className="space-y-2">
            {companies.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                  />
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-auto font-mono text-xs text-muted-foreground">
                    {c.code}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={save} disabled={mut.isPending}>
            {mut.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
