import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useUpdateUser, type AdminUser } from '@/lib/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  user: AdminUser | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Edita os dados de identidade do usuário — nome e e-mail. O e-mail é onde o
 * usuário recebe o link de acesso/recuperação, então é o campo que mais muda
 * (corrigir digitação, trocar o e-mail do representante). Login (AD/código) é
 * imutável e não aparece aqui.
 */
export function EditUserDialog({ user, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const update = useUpdateUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name ?? '');
      setEmail(user.email ?? '');
    }
  }, [user]);

  if (!user) return null;

  const emailChanged = email.trim().toLowerCase() !== (user.email ?? '').toLowerCase();
  const isAd = user.loginType === 'AD';

  async function submit() {
    if (!user) return;
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) {
      toast({ title: 'Informe o nome.', variant: 'destructive' });
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast({ title: 'E-mail inválido.', variant: 'destructive' });
      return;
    }
    const patch: { name?: string; email?: string } = {};
    if (trimmedName !== user.name) patch.name = trimmedName;
    if (trimmedEmail !== (user.email ?? '').toLowerCase()) patch.email = trimmedEmail;
    if (!patch.name && !patch.email) {
      onOpenChange(false);
      return;
    }
    try {
      await update.mutateAsync({ id: user.id, patch });
      toast({ title: 'Usuário atualizado', description: trimmedName, variant: 'success' });
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      toast({
        title: 'Falha ao salvar',
        description: Array.isArray(msg) ? msg.join(' ') : msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>
            Login: <span className="font-mono">{user.adUsername}</span> (não pode
            ser alterado).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
            {isAd ? (
              <p className="text-[11px] text-amber-600">
                Usuário do AD: o e-mail pode ser sobrescrito na próxima
                sincronização com o Active Directory.
              </p>
            ) : (
              emailChanged && (
                <p className="text-[11px] text-muted-foreground">
                  É onde ele recebe o link de acesso e recuperação de senha.
                </p>
              )
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
