import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useBranchesAdmin,
  useSetBranchEmail,
  type BranchWithExtras,
} from '@/lib/branches';
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
import { useToast } from '@/components/ui/use-toast';

/**
 * Administração de filiais — dados base vêm do ERP (`v_p2p_branches`,
 * read-only) e os campos extras P2P-side (hoje só o e-mail da filial)
 * são editáveis aqui. O e-mail é usado para:
 *   - recuperação de senha do vendedor da loja
 *   - notificações de operações da loja
 */
export function BranchesPage() {
  const { toast } = useToast();
  const { companies, activeCompany } = useCompany();
  const [companyId, setCompanyId] = useState<string>(activeCompany?.id ?? '');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!companyId && activeCompany) setCompanyId(activeCompany.id);
  }, [companyId, activeCompany]);

  const { data: rows = [], isLoading } = useBranchesAdmin(companyId);
  const setEmailMut = useSetBranchEmail();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (b) =>
        b.codigo.toLowerCase().includes(q) ||
        b.nome.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const pag = usePagination(filtered);

  async function saveEmail(branch: BranchWithExtras, raw: string) {
    if (!companyId) return;
    const next = raw.trim().toLowerCase() || null;
    if (next === (branch.email ?? null)) return;
    try {
      await setEmailMut.mutateAsync({
        companyId,
        code: branch.codigo,
        email: next,
      });
      toast({
        title: 'E-mail salvo',
        description: `${branch.codigo} — ${branch.nome}`,
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
            Dados base (código, nome, CNPJ, endereço) vêm do ERP. O
            <strong> e-mail da filial</strong> é definido aqui e usado
            para recuperação de senha do vendedor e notificações.
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
                placeholder="Buscar por código ou nome…"
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
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>E-mail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Carregando…
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      Nenhuma filial encontrada.
                    </TableCell>
                  </TableRow>
                )}
                {pag.pageRows.map((b) => (
                  <TableRow key={b.codigo}>
                    <TableCell className="font-mono text-xs">{b.codigo}</TableCell>
                    <TableCell>{b.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {b.cidade ? `${b.cidade}/${b.uf ?? ''}` : '—'}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="email"
                        defaultValue={b.email ?? ''}
                        placeholder="email@filial.com.br"
                        onBlur={(e) => saveEmail(b, e.target.value)}
                        className="h-8"
                      />
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
