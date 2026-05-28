import { useState } from 'react';
import { Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useDdas } from '@/lib/financial';
import { formatCurrency, formatDate } from '@/lib/format';
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
import {
  AdvancedFilters,
  type AdvancedFilterValues,
} from './AdvancedFilters';
import { DetailDialog, type DetailSection } from './DetailDialog';
import type { DdaRow } from '@/lib/financial';

// LX_STATUS_CONCILIACAO mapeado pra UI:
//   0 → "Pendentes" (INFORMAÇÃO NÃO PROCESSADA — aguarda ação)
//   8 → "Baixados"  (TÍTULO JÁ BAIXADO — DDA finalizado)
const STATUS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDENTE', label: 'Pendentes' },
  { value: 'BAIXADO', label: 'Baixados' },
] as const;

/**
 * DDA — boletos vindos do banco (W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO).
 */
export function DdasPage() {
  const { activeCompany } = useCompany();
  const [status, setStatus] = useState<string>('PENDENTE');
  const [search, setSearch] = useState('');
  // Agrupado por duplicata sempre — mesma decisão do Contas a Pagar
  // (default agrupado, drill-down no modal). Mantemos o estado pra
  // facilitar reativar o toggle no futuro se precisar comparar.
  const grouped = true;
  const [advanced, setAdvanced] = useState<AdvancedFilterValues>({});
  const [selected, setSelected] = useState<DdaRow | null>(null);

  const detailSections: DetailSection[] = [
    {
      title: 'Identificação',
      fields: [
        { label: 'Arquivo', value: (r) => `${r.idArquivo}/${r.itemArquivo}` },
        { label: 'Duplicata', value: (r) => r.duplicata as string },
        {
          label: 'Recebimento',
          value: (r) => r.dataRecebimento as string,
          kind: 'date',
        },
        {
          label: 'Lançamento vinculado',
          value: (r) =>
            r.lancamento ? `${r.lancamento}/${r.item}` : '—',
        },
        { label: 'Nome do arquivo', value: (r) => r.nomeArquivo as string, cols: 3 },
      ],
    },
    {
      title: 'Fornecedor',
      fields: [
        { label: 'Código', value: (r) => r.codClifor as string },
        { label: 'Razão social', value: (r) => r.razaoSocial as string, cols: 2 },
        { label: 'CNPJ', value: (r) => r.cnpj as string },
      ],
    },
    {
      title: 'Datas e valores',
      fields: [
        { label: 'Emissão', value: (r) => r.emissao as string, kind: 'date' },
        {
          label: 'Vencimento',
          value: (r) => r.vencimento as string,
          kind: 'date',
        },
        {
          label: 'Valor',
          value: (r) => r.valorTitulo as number,
          kind: 'currency',
        },
        {
          label: 'Último movimento',
          value: (r) => r.ultMovimento as string,
          kind: 'date',
        },
      ],
    },
    {
      title: 'Conciliação bancária',
      fields: [
        { label: 'Layout', value: (r) => r.descLayout as string, cols: 2 },
        { label: 'Conta corrente', value: (r) => r.contaCorrente as string },
        { label: 'Tipo conciliação', value: (r) => r.tipoConciliacao as string },
        {
          label: 'Status',
          value: (r) =>
            (r.descStatus as string) ?? (r.statusConciliacao as string),
          cols: 2,
        },
        {
          label: 'Código de barras',
          value: (r) => r.codigoBarra as string,
          cols: 3,
        },
      ],
    },
  ];

  const { data, isLoading } = useDdas({
    companyId: activeCompany?.id,
    status: status === 'ALL' ? undefined : (status as 'PENDENTE' | 'BAIXADO'),
    search: search || undefined,
    // DDA usa "recebimento" no lugar de "emissão" — o filtro vem de
    // emissaoFrom/To do componente shared e renomeamos aqui.
    recebimentoFrom: advanced.emissaoFrom,
    recebimentoTo: advanced.emissaoTo,
    vencimentoFrom: advanced.vencimentoFrom,
    vencimentoTo: advanced.vencimentoTo,
    valorMin: advanced.valorMin,
    valorMax: advanced.valorMax,
    groupByDuplicata: grouped,
    limit: 200,
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Razão social, CNPJ, duplicata, código de barras…"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="ml-auto text-sm text-muted-foreground">
          {isLoading ? 'Carregando…' : `${rows.length} duplicata(s)`}
        </p>
      </div>

      <AdvancedFilters
        value={advanced}
        onChange={setAdvanced}
        emissaoLabel="Recebimento"
        showFilialCC={false}
        showFornecedor={false}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recebimento</TableHead>
              <TableHead>Duplicata</TableHead>
              <TableHead
                className="text-right"
                title="Quantos arquivos de retorno do banco atualizaram este título (entrada, alteração, baixa, etc.)"
              >
                Retornos
              </TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Layout</TableHead>
              <TableHead>Status</TableHead>
              {/* Coluna "Lançamento" removida — 100% dos DDAs em ambos
                  bancos têm LANCAMENTO=null nessa view (6535+8022).
                  O vínculo com título contábil acontece em outra fonte
                  do Linx, não aqui. Coluna só ocupava espaço. */}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                  Nenhum DDA.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={`${r.idArquivo}-${r.itemArquivo}`}
                onClick={() => setSelected(r)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell>{formatDate(r.dataRecebimento)}</TableCell>
                <TableCell className="font-mono text-xs">
                  {/* Duplicata vazia/null em DDA é comum: o banco envia
                      um movimento sem número de duplicata (ex.: boleto
                      antigo, conciliação manual). Mostra "—" pra não
                      ficar uma célula vazia confusa. */}
                  {r.duplicata?.trim() || (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono text-xs">
                  {r.qtdMovimentos && r.qtdMovimentos > 1 ? (
                    <span
                      className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary"
                      title={`O banco enviou ${r.qtdMovimentos} arquivos de retorno para este título (entrada, alteração, baixa…)`}
                    >
                      ×{r.qtdMovimentos}
                    </span>
                  ) : (
                    <span
                      className="text-muted-foreground/50"
                      title="1 único retorno do banco"
                    >
                      1
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.razaoSocial}</div>
                  <div className="text-xs text-muted-foreground">{r.cnpj}</div>
                </TableCell>
                <TableCell>{formatDate(r.vencimento)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.valorTitulo)}
                </TableCell>
                {/* descLayout traz texto humano ("RETORNO TITULOS DDA");
                    tipoConciliacao é código interno (sempre 9 hoje) */}
                <TableCell
                  className="text-xs"
                  title={`Layout ${r.layout ?? ''} · tipo ${r.tipoConciliacao ?? ''}`}
                >
                  {r.descLayout ?? r.layout ?? '—'}
                </TableCell>
                <TableCell>
                  {/* Label curto pra não quebrar linha — descrição
                      completa do Linx fica no tooltip. */}
                  {(() => {
                    const cod = String(r.statusConciliacao ?? '').trim();
                    const short =
                      cod === '0'
                        ? 'Pendente'
                        : cod === '8'
                          ? 'Baixado'
                          : cod || '—';
                    const tone =
                      cod === '8'
                        ? 'bg-success/15 text-success'
                        : cod === '0'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-muted';
                    return (
                      <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tone}`}
                        title={r.descStatus ?? ''}
                      >
                        {short}
                      </span>
                    );
                  })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DetailDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected ? `DDA ${selected.idArquivo}/${selected.itemArquivo}` : ''
        }
        subtitle={selected?.razaoSocial ?? ''}
        record={selected as unknown as Record<string, unknown>}
        sections={detailSections}
      />
    </div>
  );
}
