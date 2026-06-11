import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, MapPin, Mail, Eye } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useBranchAdmin,
  useSetBranchEmail,
  useSetBranchOverride,
} from '@/lib/branches';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

/**
 * Cadastro completo da filial.
 *
 * - Dados de identificação e endereço vêm do ERP (`v_p2p_branches`,
 *   read-only). Para corrigir CNPJ, razão social etc., a alteração
 *   precisa ser feita no ERP — o P2P só reflete.
 * - Os campos editáveis (hoje, só o e-mail) ficam em `branch_extensions`
 *   e são usados para recuperação de senha do vendedor e notificações.
 */
export function BranchDetailPage() {
  const { code } = useParams<{ code: string }>();
  const [searchParams] = useSearchParams();
  const { companies, activeCompany } = useCompany();
  const { toast } = useToast();
  const setEmailMut = useSetBranchEmail();
  const setOverrideMut = useSetBranchOverride();

  const initialCompanyId =
    searchParams.get('companyId') ?? activeCompany?.id ?? '';
  const [companyId, setCompanyId] = useState<string>(initialCompanyId);

  const { data: branch, isLoading } = useBranchAdmin(companyId, code);

  const [email, setEmail] = useState('');
  useEffect(() => {
    setEmail(branch?.email ?? '');
  }, [branch?.email]);

  const [alias, setAlias] = useState('');
  useEffect(() => {
    setAlias(branch?.aliasName ?? '');
  }, [branch?.aliasName]);

  async function saveAlias() {
    if (!companyId || !code) return;
    const next = alias.trim() || null;
    if (next === (branch?.aliasName ?? null)) return;
    try {
      await setOverrideMut.mutateAsync({ companyId, code, aliasName: next });
      toast({
        title: next ? 'Apelido salvo' : 'Apelido removido',
        description: `${code} aparece como "${next ?? branch?.nome ?? ''}".`,
        variant: 'success',
      });
    } catch {
      toast({ title: 'Falha ao salvar o apelido', variant: 'destructive' });
    }
  }

  async function toggleHidden(next: boolean) {
    if (!companyId || !code) return;
    try {
      await setOverrideMut.mutateAsync({ companyId, code, hidden: next });
      toast({
        title: next ? 'Filial ocultada' : 'Filial reexibida',
        description: next
          ? 'Não aparece mais nas telas e seletores do P2P.'
          : 'Voltou a aparecer nas telas e seletores.',
        variant: 'success',
      });
    } catch {
      toast({ title: 'Falha ao alterar a visibilidade', variant: 'destructive' });
    }
  }

  async function saveEmail() {
    if (!companyId || !code) return;
    const next = email.trim().toLowerCase() || null;
    if (next === (branch?.email ?? null)) return;
    try {
      await setEmailMut.mutateAsync({ companyId, code, email: next });
      toast({
        title: 'E-mail salvo',
        description: `${code} — ${branch?.nome ?? ''}`,
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Falha ao salvar',
        description: 'Verifique o formato do e-mail e tente novamente.',
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin/filiais">
          <ArrowLeft className="size-4" />
          Filiais
        </Link>
      </Button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {isLoading
              ? 'Carregando…'
              : branch
                ? `${branch.codigo} — ${branch.nomeExibicao}`
                : 'Filial não encontrada'}
          </h1>
          <div className="mt-1 flex items-center gap-2">
            {branch?.aliasName && (
              <span className="text-xs text-muted-foreground">
                apelido de “{branch.nome}”
              </span>
            )}
            {branch?.hidden && (
              <Badge variant="neutral" className="text-[10px]">
                Oculta
              </Badge>
            )}
            {branch?.inativo && (
              <span className="inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
                Inativa
              </span>
            )}
          </div>
        </div>
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
      </div>

      {!isLoading && !branch && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma filial com o código <span className="font-mono">{code}</span>{' '}
            foi encontrada nesta empresa.
          </CardContent>
        </Card>
      )}

      {branch && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Identificação (ERP, read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" />
                Identificação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ReadOnly label="Código" value={branch.codigo} mono />
              <ReadOnly label="Nome fantasia" value={branch.nome} />
              <ReadOnly
                label="Razão social"
                value={branch.razaoSocial}
              />
              <div className="grid grid-cols-2 gap-3">
                <ReadOnly label="CNPJ" value={branch.cnpj} mono />
                <ReadOnly label="Inscrição estadual" value={branch.ie} mono />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ReadOnly label="Tipo" value={branch.tipo} />
                <ReadOnly
                  label="Status"
                  value={branch.inativo ? 'Inativa' : 'Ativa'}
                />
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Identificação vinda do cadastro central da empresa. Para
                personalizar como a filial aparece no portal, use “Exibição no
                portal” abaixo.
              </p>
            </CardContent>
          </Card>

          {/* Endereço (ERP, read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MapPin className="size-4 text-muted-foreground" />
                Endereço
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[1fr,140px] gap-3">
                <ReadOnly label="Logradouro" value={branch.logradouro} />
                <ReadOnly label="Número" value={branch.numero} />
              </div>
              <ReadOnly label="Bairro" value={branch.bairro} />
              <div className="grid grid-cols-[1fr,80px,140px] gap-3">
                <ReadOnly label="Cidade" value={branch.cidade} />
                <ReadOnly label="UF" value={branch.uf} />
                <ReadOnly label="CEP" value={branch.cep} mono />
              </div>
            </CardContent>
          </Card>

          {/* De-Para: exibição no portal (F-01 ocultar, F-02 apelido) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="size-4 text-muted-foreground" />
                Exibição no portal (De-Para)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="branch-alias">Apelido (nome amigável)</Label>
                <div className="flex gap-2">
                  <Input
                    id="branch-alias"
                    placeholder={branch.nome}
                    value={alias}
                    maxLength={200}
                    onChange={(e) => setAlias(e.target.value)}
                  />
                  <Button
                    onClick={saveAlias}
                    disabled={
                      setOverrideMut.isPending ||
                      alias.trim() === (branch.aliasName ?? '')
                    }
                  >
                    {setOverrideMut.isPending ? 'Salvando…' : 'Salvar'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Substitui o nome do ERP nas telas e seletores do P2P. Vazio =
                  usa o nome do ERP (<span className="italic">{branch.nome}</span>
                  ). O código <span className="font-mono">{branch.codigo}</span>{' '}
                  continua sendo o que vai pro ERP.
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="branch-hidden" className="cursor-pointer">
                    Ocultar filial
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Esconde esta filial das telas e seletores (ex.: filiais que
                    não usam o P2P). O histórico é preservado.
                  </p>
                </div>
                <Switch
                  id="branch-hidden"
                  checked={branch.hidden}
                  disabled={setOverrideMut.isPending}
                  onCheckedChange={toggleHidden}
                />
              </div>
            </CardContent>
          </Card>

          {/* Campos editáveis P2P-side */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="size-4 text-muted-foreground" />
                Contato P2P
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="branch-email">E-mail da filial</Label>
                <div className="flex gap-2">
                  <Input
                    id="branch-email"
                    type="email"
                    placeholder="email@filial.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Button
                    onClick={saveEmail}
                    disabled={
                      setEmailMut.isPending ||
                      email.trim().toLowerCase() === (branch.email ?? '')
                    }
                  >
                    {setEmailMut.isPending ? 'Salvando…' : 'Salvar'}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Usado para recuperação de senha do vendedor da loja e
                  notificações de operações desta filial.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReadOnly({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`min-h-[1.25rem] text-sm ${mono ? 'font-mono' : ''} ${
          value ? '' : 'italic text-muted-foreground'
        }`}
      >
        {value || '—'}
      </div>
    </div>
  );
}
