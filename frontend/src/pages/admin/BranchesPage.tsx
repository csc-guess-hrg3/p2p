import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Eye, EyeOff, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useBranchesAdmin, useSetBranchOverride } from '@/lib/branches';
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

  useEffect(() => {
    if (!companyId && activeCompany) setCompanyId(activeCompany.id);
  }, [companyId, activeCompany]);

  const { data: rows = [], isLoading } = useBranchesAdmin(companyId);
  const { toast } = useToast();
  const setOverrideMut = useSetBranchOverride();

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
                  <TableHead className="w-20 text-center">Visível</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={7}
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
    </div>
  );
}
