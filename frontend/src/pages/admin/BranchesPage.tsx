import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Search,
  UserPlus,
} from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useBranchesAdmin, useSetBranchOverride } from '@/lib/branches';
import { useProvisionAllStores } from '@/lib/stores';
import { useTeams } from '@/lib/teams';
import { ImportStoresDialog } from './ImportStoresDialog';
import { ProvisionStoreDialog } from './ProvisionStoreDialog';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Badge } from '@/components/ui/badge';
import { usePagination } from '@/lib/use-pagination';

/** Radix Select não aceita value="" — sentinela para "sem equipe". */
const SEM_EQUIPE = '__none__';

/**
 * Lista de filiais — dados base vêm do ERP (`v_p2p_branches`, read-only).
 * Clique numa linha abre o cadastro completo, onde editamos os campos
 * P2P-side (hoje, o e-mail usado pra recuperação de senha do vendedor
 * e notificações de operações da loja).
 */
export function BranchesPage() {
  const navigate = useNavigate();
  const { companies, activeCompany } = useCompany();
  const [companyId, setCompanyId] = useState<string>(activeCompany?.id ?? '');
  const [search, setSearch] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [bulkTeamId, setBulkTeamId] = useState<string>(SEM_EQUIPE);
  const [provBranch, setProvBranch] = useState<{
    codigo: string;
    nome: string;
    email: string | null;
  } | null>(null);

  useEffect(() => {
    if (!companyId && activeCompany) setCompanyId(activeCompany.id);
  }, [companyId, activeCompany]);

  const { data: rows = [], isLoading } = useBranchesAdmin(companyId);
  const { toast } = useToast();
  const setOverrideMut = useSetBranchOverride();
  const provisionAllMut = useProvisionAllStores();
  const { data: teams = [] } = useTeams();
  const empresaCode = companies.find((c) => c.id === companyId)?.code ?? '';

  async function provisionAll() {
    if (!empresaCode) return;
    try {
      const results = await provisionAllMut.mutateAsync({
        empresa: empresaCode,
        teamId: bulkTeamId === SEM_EQUIPE ? undefined : bulkTeamId,
      });
      const by = (s: string) => results.filter((r) => r.status === s).length;
      toast({
        title: 'Provisionamento das lojas concluído',
        description: `${by('PROVISIONED')} criadas · ${by('ALREADY')} já existiam · ${by('SKIPPED_NO_EMAIL')} sem e-mail · ${by('ERROR')} com erro`,
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Falha no provisionamento das lojas',
        variant: 'destructive',
      });
    }
  }

  async function toggleHidden(
    e: React.MouseEvent,
    b: { codigo: string; nomeExibicao: string; hidden: boolean },
  ) {
    e.stopPropagation(); // não navega pro detalhe
    try {
      await setOverrideMut.mutateAsync({
        companyId,
        code: b.codigo,
        hidden: !b.hidden,
      });
      toast({
        title: b.hidden ? 'Filial reexibida' : 'Filial ocultada',
        description: b.nomeExibicao,
        variant: 'success',
      });
    } catch {
      toast({
        title: 'Falha ao alterar a visibilidade',
        variant: 'destructive',
      });
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (b) =>
        b.codigo.toLowerCase().includes(q) ||
        b.nome.toLowerCase().includes(q) ||
        (b.razaoSocial ?? '').toLowerCase().includes(q) ||
        (b.cnpj ?? '').toLowerCase().includes(q),
    );
  }, [rows, search]);

  const pag = usePagination(filtered);

  function openDetail(code: string) {
    navigate(
      `/admin/filiais/${encodeURIComponent(code)}?companyId=${encodeURIComponent(companyId)}`,
    );
  }

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/admin">
          <ArrowLeft className="size-4" />
          Administração
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Filiais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dados base (código, nome, CNPJ, endereço) vêm do ERP. Clique na
            filial para abrir o cadastro completo: e-mail, <b>apelido</b>{' '}
            (nome amigável no portal) e <b>ocultar</b> filiais que não usam o
            P2P.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
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
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="h-9 pl-8"
                placeholder="Buscar por código, nome, razão social ou CNPJ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={bulkTeamId} onValueChange={setBulkTeamId}>
              <SelectTrigger
                className="h-9 sm:w-56"
                title="Equipe/alçada aplicada ao provisionar em massa e sugerida ao provisionar uma loja."
              >
                <SelectValue placeholder="Equipe (alçada)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_EQUIPE}>
                  Sem equipe (definir depois)
                </SelectItem>
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
            <Button
              className="h-9 whitespace-nowrap"
              disabled={!empresaCode}
              title="Cola código;email (de uma planilha): grava o e-mail em cada filial e provisiona as lojas num passo só."
              onClick={() => setImportOpen(true)}
            >
              Importar e-mails
            </Button>
            <Button
              variant="outline"
              className="h-9 whitespace-nowrap"
              disabled={!empresaCode || provisionAllMut.isPending}
              title="Provisiona as filiais ativas que JÁ têm e-mail cadastrado (sem colar nada). Roda de novo quando cadastrar mais — quem já tem acesso é ignorado."
              onClick={provisionAll}
            >
              {provisionAllMut.isPending ? 'Provisionando…' : 'Provisionar lojas'}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead className="w-24 text-center">Acesso</TableHead>
                  <TableHead className="w-20 text-center">Visível</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhuma filial encontrada.
                    </TableCell>
                  </TableRow>
                )}
                {pag.pageRows.map((b) => (
                  <TableRow
                    key={b.codigo}
                    onClick={() => openDetail(b.codigo)}
                    className={`cursor-pointer hover:bg-accent ${
                      b.hidden ? 'opacity-50' : ''
                    }`}
                  >
                    <TableCell className="font-mono text-xs">
                      {b.codigo}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.nomeExibicao}</span>
                        {b.hidden && (
                          <Badge variant="neutral" className="text-[10px]">
                            Oculta
                          </Badge>
                        )}
                      </div>
                      {b.aliasName ? (
                        <div className="text-xs text-muted-foreground">
                          ERP: {b.nome}
                        </div>
                      ) : (
                        b.razaoSocial &&
                        b.razaoSocial !== b.nome && (
                          <div className="text-xs text-muted-foreground">
                            {b.razaoSocial}
                          </div>
                        )
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.cnpj ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.cidade ? `${b.cidade}/${b.uf ?? ''}` : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.email ?? (
                        <span className="text-xs italic">não cadastrado</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title="Provisionar login da loja (e-mail + equipe)"
                        onClick={(e) => {
                          e.stopPropagation();
                          setProvBranch({
                            codigo: b.codigo,
                            nome: b.nomeExibicao,
                            email: b.email ?? null,
                          });
                        }}
                      >
                        <UserPlus className="size-4" />
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        title={b.hidden ? 'Reexibir filial' : 'Ocultar filial'}
                        disabled={setOverrideMut.isPending}
                        onClick={(e) => toggleHidden(e, b)}
                      >
                        {b.hidden ? (
                          <EyeOff className="size-4 text-muted-foreground" />
                        ) : (
                          <Eye className="size-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            page={pag.page}
            pageSize={pag.pageSize}
            total={pag.total}
            totalPages={pag.totalPages}
            onPageChange={pag.setPage}
            onPageSizeChange={pag.setPageSize}
          />
        </CardContent>
      </Card>

      <ImportStoresDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        defaultEmpresa={empresaCode}
        defaultTeamId={bulkTeamId === SEM_EQUIPE ? undefined : bulkTeamId}
      />

      <ProvisionStoreDialog
        open={!!provBranch}
        onOpenChange={(v) => !v && setProvBranch(null)}
        empresa={empresaCode}
        branch={provBranch}
        defaultTeamId={bulkTeamId === SEM_EQUIPE ? undefined : bulkTeamId}
      />
    </div>
  );
}
