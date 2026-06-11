import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useSupplierList } from '@/lib/suppliers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
 * Módulo Fornecedores — Fase 1 (leitura). Lista os fornecedores da empresa
 * ativa (Linx, view v_p2p_suppliers) com busca server-side por nome/CNPJ.
 * Clique abre o detalhe (campos do Linx + Receita).
 */
export function SuppliersPage() {
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const code = activeCompany?.code;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Debounce simples — evita uma chamada por tecla.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: rows = [], isLoading } = useSupplierList(code, search);
  const pag = usePagination(rows);

  function openDetail(codigo: string) {
    navigate(`/fornecedores/${encodeURIComponent(codigo)}`);
  }

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Fornecedores</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro de fornecedores da{' '}
          <span className="font-medium">{activeCompany?.code}</span> (vindo do
          Linx). Clique para ver os dados completos + Receita.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar fornecedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="h-9 pl-8"
              placeholder="Buscar por nome, razão social ou CNPJ…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Cond. pgto</TableHead>
                  <TableHead>Contato</TableHead>
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
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {search
                        ? 'Nenhum fornecedor encontrado para a busca.'
                        : 'Digite acima para buscar um fornecedor.'}
                    </TableCell>
                  </TableRow>
                )}
                {pag.pageRows.map((s) => (
                  <TableRow
                    key={s.codigo}
                    onClick={() => openDetail(s.codigo)}
                    className={`cursor-pointer hover:bg-accent ${
                      s.inativo ? 'opacity-50' : ''
                    }`}
                  >
                    <TableCell className="font-mono text-xs">
                      {s.codigo}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.nome}</span>
                        {s.inativo && (
                          <Badge variant="neutral" className="text-[10px]">
                            Inativo
                          </Badge>
                        )}
                      </div>
                      {s.razaoSocial && s.razaoSocial !== s.nome && (
                        <div className="text-xs text-muted-foreground">
                          {s.razaoSocial}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.cnpjCpf ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.condicaoPgto ?? '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.email || s.telefone || '—'}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > 0 && (
            <Pagination
              page={pag.page}
              pageSize={pag.pageSize}
              total={pag.total}
              totalPages={pag.totalPages}
              onPageChange={pag.setPage}
              onPageSizeChange={pag.setPageSize}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
