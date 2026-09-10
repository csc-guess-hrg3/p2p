import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink } from 'lucide-react';
import { lookupCnpjPublic, maskCnpj } from '@/lib/quotations';
import { formatDate } from '@/lib/format';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Detalhes completos do fornecedor pela consulta pública de CNPJ (Receita
 * Federal via BrasilAPI). Reusado pelo revisor (tela de validação) e pelos
 * aprovadores (detalhe da requisição) — todos veem os mesmos dados oficiais.
 */
export function SupplierDetailDialog({
  open,
  onOpenChange,
  companyCode,
  cnpj,
  fallbackName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyCode?: string;
  cnpj?: string | null;
  /** Nome exibido no cabeçalho enquanto carrega / se a consulta falhar. */
  fallbackName?: string | null;
}) {
  const clean = (cnpj ?? '').replace(/\D/g, '');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cnpj-public', companyCode, clean],
    queryFn: () => lookupCnpjPublic(companyCode as string, clean),
    enabled: open && !!companyCode && clean.length === 14,
  });

  const endereco = data
    ? [
        [data.logradouro, data.numero].filter(Boolean).join(', '),
        data.complemento,
        data.bairro,
        [data.cidade, data.uf].filter(Boolean).join(' - '),
        data.cep ? `CEP ${data.cep}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const situacaoAtiva = (data?.situacao ?? '').toUpperCase().includes('ATIVA');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5 text-muted-foreground" />
            {data?.razaoSocial || fallbackName || 'Detalhes do fornecedor'}
          </DialogTitle>
          <DialogDescription>
            Dados oficiais da Receita Federal (consulta por CNPJ).
          </DialogDescription>
        </DialogHeader>

        {clean.length !== 14 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Fornecedor sem CNPJ válido para consulta.
          </p>
        ) : isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Consultando a Receita Federal…
          </p>
        ) : isError || !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Não foi possível obter os dados na Receita agora. Tente novamente
            em instantes.
          </p>
        ) : (
          <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">CNPJ</dt>
            <dd className="font-medium tabular-nums">{maskCnpj(data.cnpj)}</dd>

            <dt className="text-muted-foreground">Razão social</dt>
            <dd>{data.razaoSocial || '—'}</dd>

            <dt className="text-muted-foreground">Nome fantasia</dt>
            <dd>{data.nomeFantasia || '—'}</dd>

            <dt className="text-muted-foreground">Situação</dt>
            <dd>
              {data.situacao ? (
                <span
                  className={
                    situacaoAtiva
                      ? 'rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success'
                      : 'rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning'
                  }
                >
                  {data.situacao}
                </span>
              ) : (
                '—'
              )}
            </dd>

            <dt className="text-muted-foreground">Atividade (CNAE)</dt>
            <dd>{data.cnaePrincipal || '—'}</dd>

            <dt className="text-muted-foreground">Abertura</dt>
            <dd>{data.dataAbertura ? formatDate(data.dataAbertura) : '—'}</dd>

            <dt className="text-muted-foreground">Endereço</dt>
            <dd>{endereco || '—'}</dd>

            <dt className="text-muted-foreground">Telefone</dt>
            <dd>{data.telefone || '—'}</dd>

            <dt className="text-muted-foreground">E-mail</dt>
            <dd className="break-all">{data.email || '—'}</dd>
          </dl>
        )}

        {clean.length === 14 && (
          <a
            href={`https://cnpj.biz/${clean}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <ExternalLink className="size-3" /> Abrir consulta externa
          </a>
        )}
      </DialogContent>
    </Dialog>
  );
}
