import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useBranchesAdmin } from '@/lib/branches';
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
            Dados base (código, nome, CNPJ, endereço) vêm do ERP. Clique
            na filial para abrir o cadastro completo e editar os campos
            P2P-side (e-mail, etc.).
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
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
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
                    className="cursor-pointer hover:bg-accent"
                  >
                    <TableCell className="font-mono text-xs">
                      {b.codigo}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{b.nome}</div>
                      {b.razaoSocial && b.razaoSocial !== b.nome && (
                        <div className="text-xs text-muted-foreground">
                          {b.razaoSocial}
                        </div>
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
