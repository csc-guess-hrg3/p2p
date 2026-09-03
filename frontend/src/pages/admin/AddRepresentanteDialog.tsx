import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { Check, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useRepresentantesErp,
  useProvisionRepresentante,
  type RepresentanteErp,
} from '@/lib/representantes';
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

/**
 * Cadastra o acesso externo de um REPRESENTANTE. Valida o código no Linx,
 * cria o usuário com tipo REPRESENTANTE (login = código) e envia o e-mail com
 * o link de definição de senha. É o "definir o tipo" pela tela.
 */
export function AddRepresentanteDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { companies } = useCompany();
  const provision = useProvisionRepresentante();

  const [empresa, setEmpresa] = useState('');
  const [repSearch, setRepSearch] = useState('');
  const [selected, setSelected] = useState<RepresentanteErp | null>(null);
  const [email, setEmail] = useState('');

  const { data: reps = [], isLoading: repsLoading } =
    useRepresentantesErp(empresa || undefined);

  useEffect(() => {
    if (!open) {
      setEmpresa('');
      setRepSearch('');
      setSelected(null);
      setEmail('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = repSearch.trim().toLowerCase();
    const list = q
      ? reps.filter(
          (r) =>
            r.cod_representante.toLowerCase().includes(q) ||
            r.nome.toLowerCase().includes(q),
        )
      : reps;
    return list.slice(0, 50);
  }, [reps, repSearch]);

  async function submit() {
    if (!empresa) {
      toast({ title: 'Selecione a empresa.', variant: 'destructive' });
      return;
    }
    if (!selected) {
      toast({ title: 'Selecione o representante.', variant: 'destructive' });
      return;
    }
    if (!email.trim()) {
      toast({
        title: 'Informe o e-mail do representante.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await provision.mutateAsync({
        empresa,
        codRepresentante: selected.cod_representante,
        email: email.trim().toLowerCase(),
      });
      toast({
        title: 'Representante cadastrado',
        description: `Login: ${selected.cod_representante}. Enviamos um e-mail para ${email.trim().toLowerCase()} com o link de definição de senha (válido por 24h).`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      toast({
        title: 'Falha ao cadastrar',
        description: Array.isArray(msg) ? msg.join(' ') : msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar representante</DialogTitle>
          <DialogDescription>
            Cria o acesso ao <strong>Portal do Representante</strong>. O login é
            o código do rep; ao salvar, enviamos o e-mail com o link de senha
            (válido por 24h).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Select
              value={empresa}
              onValueChange={(v) => {
                setEmpresa(v);
                setSelected(null);
                setRepSearch('');
              }}
            >
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
            <Label>Representante</Label>
            {selected ? (
              <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {selected.cod_representante}
                  </span>{' '}
                  — <span className="font-medium">{selected.nome}</span>
                </span>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setSelected(null)}
                >
                  Trocar
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder={
                      empresa
                        ? 'Buscar por código ou nome…'
                        : 'Selecione a empresa primeiro'
                    }
                    value={repSearch}
                    onChange={(e) => setRepSearch(e.target.value)}
                    disabled={!empresa}
                  />
                </div>
                <div className="max-h-52 overflow-y-auto rounded-md border">
                  {repsLoading && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      Carregando representantes…
                    </div>
                  )}
                  {!repsLoading && empresa && filtered.length === 0 && (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      Nenhum representante encontrado.
                    </div>
                  )}
                  {filtered.map((r) => (
                    <button
                      key={`${r.empresa}-${r.cod_representante}`}
                      type="button"
                      onClick={() => setSelected(r)}
                      className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-accent"
                    >
                      <Check className="size-3.5 opacity-0" />
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.cod_representante}
                      </span>
                      <span className="truncate">{r.nome}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>E-mail do representante</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
            <p className="text-[11px] text-muted-foreground">
              Pode ser pessoal (Gmail etc.). É onde ele recebe o link de acesso.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={provision.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={submit} disabled={provision.isPending}>
            {provision.isPending ? 'Cadastrando…' : 'Cadastrar e enviar e-mail'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
