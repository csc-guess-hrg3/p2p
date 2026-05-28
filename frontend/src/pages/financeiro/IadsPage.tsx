import { useState } from 'react';
import { Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useIads,
  useFinancialBranches,
  useFinancialCostCenters,
} from '@/lib/financial';
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
  AdvancedFilters,
  type AdvancedFilterValues,
} from './AdvancedFilters';
import { DetailDialog, type DetailSection } from './DetailDialog';
import type { IadRow } from '@/lib/financial';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'A_VENCER', label: 'A vencer' },
  { value: 'VENCIDO', label: 'Vencidos' },
] as const;

/**
 * Adiantamentos (IAD) — "Inclusão de Aviso de Débito do Terceiro".
 * São os adiantamentos pagos via banco aguardando contrapartida
 * (NF, guia de imposto, folha, recibo). Lê W_CTB_AVISO_LANCAMENTO +
 * saldo (filtro: saldo <> 0).
 */
export function IadsPage() {
  const { activeCompany } = useCompany();
  const [status, setStatus] = useState<string>('A_VENCER');
  const [search, setSearch] = useState('');
  const [svFilter, setSvFilter] = useState<string>('ALL');
  const [advanced, setAdvanced] = useState<AdvancedFilterValues>({});
  const { data: branches } = useFinancialBranches(activeCompany?.id);
  const { data: costCenters } = useFinancialCostCenters(activeCompany?.id);
  const [selected, setSelected] = useState<IadRow | null>(null);

  const detailSections: DetailSection[] = [
    {
      title: 'Identificação',
      fields: [
        { label: 'Lançamento', value: (r) => String(r.lancamento) },
        { label: 'Item', value: (r) => String(r.item) },
        { label: 'Tipo', value: (r) => r.tipoLancamento as string },
        {
          label: 'SV de origem',
          value: (r) =>
            r.solicitacaoVerba
              ? `SV ${r.solicitacaoVerba} / item ${r.solicitacaoVerbaItem}`
              : '—',
          cols: 2,
        },
        { label: 'Pedido', value: (r) => r.pedidoOrigem as string },
        { label: 'Posição', value: (r) => r.posicao as string },
        {
          label: 'Descrição',
          value: (r) => r.descAviso as string,
          cols: 3,
        },
      ],
    },
    {
      title: 'Terceiro',
      fields: [
        { label: 'Código', value: (r) => r.codClifor as string },
        { label: 'Nome', value: (r) => r.nomeClifor as string, cols: 2 },
        { label: 'CNPJ/CPF', value: (r) => r.cnpjCpf as string },
        { label: 'Razão social', value: (r) => r.razaoSocial as string, cols: 2 },
      ],
    },
    {
      title: 'Datas e valores',
      fields: [
        { label: 'Emissão', value: (r) => r.emissao as string, kind: 'date' },
        { label: 'Vencimento', value: (r) => r.vencimento as string, kind: 'date' },
        {
          label: 'Vencimento real',
          value: (r) => r.vencimentoReal as string,
          kind: 'date',
        },
        {
          label: 'Valor original',
          value: (r) => r.valorOriginal as number,
          kind: 'currency',
        },
        {
          label: 'Valor aviso',
          value: (r) => r.valorAviso as number,
          kind: 'currency',
        },
        {
          label: 'Valor pago',
          value: (r) => r.valorPago as number,
          kind: 'currency',
        },
        {
          label: 'Saldo aberto',
          value: (r) => r.saldoAberto as number,
          kind: 'currency',
        },
      ],
    },
    {
      title: 'Contábil',
      fields: [
        {
          label: 'Conta contábil',
          value: (r) =>
            `${r.contaContabil ?? ''} ${r.descConta ?? ''}`.trim(),
          cols: 2,
        },
        { label: 'Filial (rateio)', value: (r) => r.rateioFilial as string },
        {
          label: 'Centro de custo',
          value: (r) => r.rateioCentroCusto as string,
        },
        {
          label: 'Status aprovação',
          value: (r) => r.statusAprovacao as string,
        },
      ],
    },
  ];

  const { data, isLoading } = useIads({
    companyId: activeCompany?.id,
    status: status === 'TODOS' ? undefined : (status as 'A_VENCER'),
    search: search || undefined,
    fornecedor: advanced.fornecedor,
    semSv: svFilter === 'SEM_SV',
    comSv: svFilter === 'COM_SV',
    emissaoFrom: advanced.emissaoFrom,
    emissaoTo: advanced.emissaoTo,
    vencimentoFrom: advanced.vencimentoFrom,
    vencimentoTo: advanced.vencimentoTo,
    valorMin: advanced.valorMin,
    valorMax: advanced.valorMax,
    filial: advanced.filial,
    centroCusto: advanced.centroCusto,
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
            placeholder="Lançamento, fornecedor, CNPJ ou descrição…"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
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
        <Select value={svFilter} onValueChange={setSvFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos (SV ou sem)</SelectItem>
            <SelectItem value="COM_SV">Vindos de SV</SelectItem>
            <SelectItem value="SEM_SV">Sem SV de origem</SelectItem>
          </SelectContent>
        </Select>
        <p className="ml-auto text-sm text-muted-foreground">
          {isLoading ? 'Carregando…' : `${rows.length} adiantamento(s)`}
        </p>
      </div>

      <AdvancedFilters
        value={advanced}
        onChange={setAdvanced}
        branches={branches}
        costCenters={costCenters}
        companyId={activeCompany?.id}
      />

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lançamento</TableHead>
              <TableHead>Terceiro</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor original</TableHead>
              <TableHead className="text-right">Saldo aberto</TableHead>
              <TableHead>Posição</TableHead>
              <TableHead>SV origem</TableHead>
              <TableHead>Pedido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center text-sm text-muted-foreground"
                >
                  Nenhum adiantamento em aberto.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={`${r.lancamento}-${r.item}`}
                onClick={() => setSelected(r)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell
                  className="font-mono text-xs"
                  title={`Item ${r.item}`}
                >
                  {String(r.lancamento)}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.nomeClifor ?? r.razaoSocial}</div>
                  <div className="text-xs text-muted-foreground">{r.cnpjCpf}</div>
                </TableCell>
                <TableCell className="max-w-[260px] truncate" title={r.descAviso ?? ''}>
                  {r.descAviso}
                </TableCell>
                <TableCell>{formatDate(r.emissao)}</TableCell>
                <TableCell>{formatDate(r.vencimentoReal)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.valorOriginal)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {formatCurrency(r.saldoAberto)}
                </TableCell>
                <TableCell>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {r.posicao ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.solicitacaoVerba ? (
                    <span
                      className="rounded bg-primary/10 px-1.5 py-0.5 text-primary"
                      title={`SV ${r.solicitacaoVerba} / item ${r.solicitacaoVerbaItem}`}
                    >
                      SV {r.solicitacaoVerba}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.pedidoOrigem ?? '—'}
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
          selected ? `Adiantamento ${selected.lancamento}/${selected.item}` : ''
        }
        subtitle={selected?.nomeClifor ?? ''}
        record={selected as unknown as Record<string, unknown>}
        sections={detailSections}
      />
    </div>
  );
}
