import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useImportProvisionStores } from '@/lib/stores';
import { useTeams } from '@/lib/teams';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

/** Radix Select não aceita value="" — sentinela para "sem equipe". */
const SEM_EQUIPE = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Código da empresa (GUESS/HRG3). */
  empresa: string;
  /** Filial-alvo (código do ERP + nome + e-mail já cadastrado, se houver). */
  branch: { codigo: string; nome: string; email: string | null } | null;
  /** Equipe pré-selecionada (default do toolbar). */
  defaultTeamId?: string;
}

/**
 * Provisiona UMA loja num passo só: grava o e-mail na filial, cria o login,
 * define a equipe (alçada de aprovação) e envia o link de senha. Se a loja já
 * existir, só atualiza a equipe escolhida — sem precisar abrir a tela de usuário.
 */
export function ProvisionStoreDialog({
  open,
  onOpenChange,
  empresa,
  branch,
  defaultTeamId,
}: Props) {
  const { toast } = useToast();
  const provisionMut = useImportProvisionStores();
  const { data: teams = [] } = useTeams();

  const [email, setEmail] = useState('');
  const [teamId, setTeamId] = useState<string>(SEM_EQUIPE);

  useEffect(() => {
    if (open && branch) {
      setEmail(branch.email ?? '');
      setTeamId(defaultTeamId || SEM_EQUIPE);
    }
  }, [open, branch, defaultTeamId]);

  const teamOptions = useMemo(
    () => teams.filter((t) => t.active !== false),
    [teams],
  );

  async function run() {
    if (!branch) return;
    const mail = email.trim().toLowerCase();
    if (!mail) {
      toast({ title: 'Informe o e-mail da loja.', variant: 'destructive' });
      return;
    }
    try {
      const [res] = await provisionMut.mutateAsync({
        empresa,
        itens: [{ branchErpCode: branch.codigo, email: mail }],
        teamId: teamId === SEM_EQUIPE ? undefined : teamId,
      });
      if (res.status === 'PROVISIONED') {
        toast({
          title: 'Loja provisionada',
          description: `${branch.codigo} — link de senha enviado a ${mail}.`,
          variant: 'success',
        });
        onOpenChange(false);
      } else if (res.status === 'ALREADY') {
        toast({
          title: 'Loja já tinha acesso',
          description: res.detail, // "equipe atualizada" quando escolheu uma
          variant: 'success',
        });
        onOpenChange(false);
      } else {
        toast({
          title: 'Não foi possível provisionar',
          description: res.detail ?? 'Revise o e-mail e tente de novo.',
          variant: 'destructive',
        });
      }
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      toast({
        title: 'Falha ao provisionar',
        description: Array.isArray(msg) ? msg.join(' ') : msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Provisionar loja</DialogTitle>
          <DialogDescription>
            {branch ? (
              <>
                Filial <span className="font-mono">{branch.codigo}</span> —{' '}
                {branch.nome}. Grava o e-mail, cria o login, define a equipe e
                envia o link de senha.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>E-mail da loja</Label>
            <Input
              type="email"
              placeholder="loja.exemplo@guess.com.br"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Equipe (alçada de aprovação)</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Definir depois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_EQUIPE}>Definir depois</SelectItem>
                {teamOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                    {t.company ? ` · ${t.company.code}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Define por qual cadeia de aprovação as compras desta loja passam.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={provisionMut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={run} disabled={provisionMut.isPending || !email.trim()}>
            {provisionMut.isPending ? 'Provisionando…' : 'Provisionar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
