import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, Landmark, FileText } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useSupplierDetail, useSupplierReceita } from '@/lib/suppliers';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Detalhe do fornecedor (Fase 1, leitura). Mostra os campos do Linx
 * (v_p2p_suppliers) + um painel com os dados públicos da Receita Federal
 * (BrasilAPI) pra conferência. Edição/cadastro vêm nas Fases 2/3.
 */
export function SupplierDetailPage() {
  const { codigo } = useParams<{ codigo: string }>();
  const { activeCompany } = useCompany();
  const code = activeCompany?.code;

  const { data: s, isLoading } = useSupplierDetail(code, codigo);
  const { data: receita, isFetching: receitaLoading } = useSupplierReceita(
    code,
    s?.cnpjCpf,
  );

  return (
    <div className="space-y-4 p-6 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/fornecedores">
          <ArrowLeft className="size-4" />
          Fornecedores
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">
          {isLoading
            ? 'Carregando…'
            : s
              ? `${s.codigo} — ${s.nome}`
              : 'Fornecedor não encontrado'}
        </h1>
        {s?.inativo && (
          <span className="mt-1 inline-block rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-destructive">
            Inativo
          </span>
        )}
      </div>

      {!isLoading && !s && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum fornecedor com o código{' '}
            <span className="font-mono">{codigo}</span> nesta empresa.
          </CardContent>
        </Card>
      )}

      {s && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Cadastro (Linx) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" />
                Cadastro (Linx)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Código" value={s.codigo} mono />
              <Field label="Nome" value={s.nome} />
              <Field label="Razão social" value={s.razaoSocial} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="CNPJ/CPF" value={s.cnpjCpf} mono />
                <Field
                  label="Tipo pessoa"
                  value={
                    s.tipoPessoa === 'PJ'
                      ? 'Pessoa Jurídica'
                      : s.tipoPessoa === 'PF'
                        ? 'Pessoa Física'
                        : null
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo" value={s.tipo} />
                <Field label="Condição de pgto" value={s.condicaoPgto} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="E-mail" value={s.email} />
                <Field label="Telefone" value={s.telefone} />
              </div>
            </CardContent>
          </Card>

          {/* Bancário (Linx) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Landmark className="size-4 text-muted-foreground" />
                Dados bancários (Linx)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Banco" value={s.banco} />
                <Field label="Agência" value={s.agencia} mono />
              </div>
              <Field label="Conta" value={s.conta} mono />
              <Field label="Chave PIX" value={s.chavePix} mono />
            </CardContent>
          </Card>

          {/* Receita Federal (BrasilAPI) */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-muted-foreground" />
                Receita Federal
                {receita && (
                  <Badge variant="outline" className="text-[10px]">
                    BrasilAPI
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {receitaLoading && (
                <p className="text-sm text-muted-foreground">
                  Consultando a Receita…
                </p>
              )}
              {!receitaLoading && !receita && (
                <p className="text-sm text-muted-foreground">
                  Sem dados da Receita para este CNPJ (PF, CNPJ inválido ou não
                  encontrado).
                </p>
              )}
              {receita && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Razão social" value={receita.razaoSocial} />
                  <Field label="Nome fantasia" value={receita.nomeFantasia} />
                  <Field label="Situação cadastral" value={receita.situacao} />
                  <Field label="CNAE principal" value={receita.cnaePrincipal} />
                  <Field label="Abertura" value={receita.dataAbertura} />
                  <Field
                    label="Contato Receita"
                    value={receita.email || receita.telefone}
                  />
                  <Field
                    label="Endereço"
                    value={[
                      receita.logradouro,
                      receita.numero,
                      receita.bairro,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  />
                  <Field
                    label="Cidade/UF"
                    value={
                      receita.cidade
                        ? `${receita.cidade}/${receita.uf ?? ''}`
                        : null
                    }
                  />
                  <Field label="CEP" value={receita.cep} mono />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`min-h-[1.25rem] text-sm [overflow-wrap:anywhere] ${mono ? 'font-mono' : ''} ${
          value ? '' : 'italic text-muted-foreground'
        }`}
      >
        {value || '—'}
      </div>
    </div>
  );
}
