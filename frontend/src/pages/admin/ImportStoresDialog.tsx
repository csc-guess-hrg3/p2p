import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { useCompany } from '@/lib/company';
import {
  useImportProvisionStores,
  type StoreProvisionResult,
} from '@/lib/stores';
import { useTeams } from '@/lib/teams';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  /** Código da empresa (GUESS/HRG3) já selecionada na tela de Filiais. */
  defaultEmpresa?: string;
  /** Equipe pré-selecionada (default do toolbar de Filiais). */
  defaultTeamId?: string;
}

interface ParsedItem {
  branchErpCode: string;
  email: string;
}

/** Cada linha: "código<sep>email" — separador ; , ou tab. Ignora linhas vazias/incompletas. */
function parseLines(text: string): ParsedItem[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const parts = l.split(/[;,\t]+/).map((p) => p.trim());
      return {
        branchErpCode: parts[0] ?? '',
        email: (parts[1] ?? '').toLowerCase(),
      };
    })
    .filter((it) => it.branchErpCode && it.email);
}

/**
 * Importa e-mails e provisiona lojas em massa: cola "código;email", grava o
 * e-mail em cada filial, cria o login e envia o link de senha — num passo só,
 * pulando as lojas que já têm acesso.
 */
export function ImportStoresDialog({
  open,
  onOpenChange,
  defaultEmpresa,
  defaultTeamId,
}: Props) {
  const { toast } = useToast();
  const { companies } = useCompany();
  const importMut = useImportProvisionStores();
  const { data: teams = [] } = useTeams();

  const [empresa, setEmpresa] = useState(defaultEmpresa ?? '');
  const [teamId, setTeamId] = useState<string>(defaultTeamId || SEM_EQUIPE);
  const [text, setText] = useState('');
  const [results, setResults] = useState<StoreProvisionResult[] | null>(null);

  useEffect(() => {
    if (open) {
      setEmpresa(defaultEmpresa ?? '');
      setTeamId(defaultTeamId || SEM_EQUIPE);
      setText('');
      setResults(null);
    }
  }, [open, defaultEmpresa, defaultTeamId]);

  const parsed = useMemo(() => parseLines(text), [text]);
  const problems = (results ?? []).filter(
    (r) => r.status === 'ERROR' || r.status === 'SKIPPED_NO_EMAIL',
  );

  async function run() {
    if (!empresa) {
      toast({ title: 'Selecione a empresa.', variant: 'destructive' });
      return;
    }
    if (parsed.length === 0) {
      toast({
        title: 'Cole ao menos uma linha "código;email".',
        variant: 'destructive',
      });
      return;
    }
    try {
      const res = await importMut.mutateAsync({
        empresa,
        itens: parsed,
        teamId: teamId === SEM_EQUIPE ? undefined : teamId,
      });
      setResults(res);
      const by = (s: string) => res.filter((r) => r.status === s).length;
      toast({
        title: 'Importação concluída',
        description: `${by('PROVISIONED')} criadas · ${by('ALREADY')} já existiam · ${
          by('ERROR') + by('SKIPPED_NO_EMAIL')
        } para revisar`,
        variant: 'success',
      });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      toast({
        title: 'Falha na importação',
        description: Array.isArray(msg)
          ? msg.join(' ')
          : msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar e-mails e provisionar lojas</DialogTitle>
          <DialogDescription>
            Cole uma linha por loja no formato <code>código;email</code> (aceita
            também vírgula ou tab, ex.: colado de uma planilha). Grava o e-mail
            em cada filial, cria o login e envia o link de senha — pulando as
            lojas que já têm acesso.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select value={empresa} onValueChange={setEmpresa}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipe (alçada) — opcional</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Definir depois" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_EQUIPE}>Definir depois</SelectItem>
                {teams
                  .filter((t) => t.active !== false)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.company ? ` · ${t.company.code}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Aplica a mesma equipe a todas as lojas deste lote.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Lojas (código;email)</Label>
            <Textarea
              rows={8}
              className="font-mono text-xs"
              placeholder={
                '0102;loja.morumbi@guess.com.br\n0103;loja.iguatemi@guess.com.br'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {parsed.length} linha(s) reconhecida(s).
            </p>
          </div>

          {results && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Resultado</p>
              <p className="text-muted-foreground">
                {results.filter((r) => r.status === 'PROVISIONED').length}{' '}
                criadas ·{' '}
                {results.filter((r) => r.status === 'ALREADY').length} já
                existiam · {problems.length} para revisar
              </p>
              {problems.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {problems.map((p) => (
                    <li key={p.branchErpCode} className="text-xs">
                      <span className="font-mono">{p.branchErpCode}</span> —{' '}
                      {p.detail}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importMut.isPending}
          >
            {results ? 'Fechar' : 'Cancelar'}
          </Button>
          <Button
            onClick={run}
            disabled={importMut.isPending || parsed.length === 0}
          >
            {importMut.isPending
              ? 'Provisionando…'
              : `Importar e provisionar (${parsed.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
