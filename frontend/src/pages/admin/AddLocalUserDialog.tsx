import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useCompany } from '@/lib/company';
import { usePositions } from '@/lib/positions';
import { useCreateLocalUser } from '@/lib/users';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const PROFILES = [
  { value: 'MANAGER', label: 'Gestor' },
  { value: 'OPERATOR', label: 'Operador' },
  { value: 'REVIEWER', label: 'Revisor / Fiscal' },
];

/**
 * Cadastra um usuário LOCAL (fora do AD). O backend envia automaticamente
 * o e-mail com o link de definição de senha; o usuário define a senha
 * e fica ATIVO. Admin pode reenviar o link depois pela própria lista.
 */
export function AddLocalUserDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { companies } = useCompany();
  const { data: positions = [] } = usePositions();
  const mut = useCreateLocalUser();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [profile, setProfile] = useState('MANAGER');
  const [positionId, setPositionId] = useState<string>('');
  const [companyIds, setCompanyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      // Limpa ao fechar.
      setName('');
      setEmail('');
      setUsername('');
      setProfile('MANAGER');
      setPositionId('');
      setCompanyIds(new Set());
    }
  }, [open]);

  function toggleCompany(id: string, checked: boolean) {
    setCompanyIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || !email.trim() || !username.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe nome, e-mail e username.',
        variant: 'destructive',
      });
      return;
    }
    if (!/^[a-z0-9._-]{3,60}$/i.test(username.trim())) {
      toast({
        title: 'Username inválido',
        description: '3-60 caracteres alfanuméricos, ponto, hífen ou underscore.',
        variant: 'destructive',
      });
      return;
    }
    if (companyIds.size === 0) {
      toast({
        title: 'Empresas',
        description: 'Selecione ao menos uma empresa.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await mut.mutateAsync({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        username: username.trim().toLowerCase(),
        profile,
        positionId: positionId || null,
        companyIds: Array.from(companyIds),
      });
      toast({
        title: 'Usuário criado',
        description: `Username: ${username.trim().toLowerCase()}. Um e-mail foi enviado para ${email} com o link de definição de senha (válido por 24h).`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      toast({
        title: 'Falha ao criar',
        description: Array.isArray(msg)
          ? msg.join(' ')
          : msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar usuário local</DialogTitle>
          <DialogDescription>
            Para pessoas que <strong>não estão no AD</strong> (ex.:
            supervisor de filial). Ao salvar, o sistema envia um e-mail com
            o link de definição de senha — válido por 24 horas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail corporativo</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@hrg3.com.br"
            />
            <p className="text-[11px] text-muted-foreground">
              Aceitos: @hrg3.com.br, @guessbrasil.com.br ou @guess-br.com.br.
              Usado pra entrega do link de definição de senha.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Username (login)</Label>
            <Input
              value={username}
              onChange={(e) =>
                setUsername(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9._-]/g, ''),
                )
              }
              placeholder="ex.: maria.silva"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Identificador usado no login. 3-60 caracteres, alfanumérico,
              ponto, hífen ou underscore.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <Select value={profile} onValueChange={setProfile}>
                <SelectTrigger className="h-9">
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
            </div>
            <div className="space-y-1.5">
              <Label>Cargo (opcional)</Label>
              <Select
                value={positionId || '__NONE__'}
                onValueChange={(v) => setPositionId(v === '__NONE__' ? '' : v)}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">— Nenhum —</SelectItem>
                  {positions
                    .filter((p) => p.active)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Empresas com acesso</Label>
            <ul className="space-y-1.5">
              {companies.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={companyIds.has(c.id)}
                      onChange={(e) => toggleCompany(c.id, e.target.checked)}
                    />
                    <span>{c.name}</span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {c.code}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={mut.isPending}>
            {mut.isPending ? 'Criando…' : 'Criar e enviar e-mail'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
