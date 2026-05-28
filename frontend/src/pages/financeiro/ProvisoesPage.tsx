import { useState } from 'react';
import { Search } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useProvisoes,
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
import type { ProvisaoRow } from '@/lib/financial';

// TIPOs reais validados via SELECT DISTINCT:
//   SV     = Solicitação de Verba (provisão do tipo "adiantamento")
//   PEDCOM = Pedido de Compra provisionado (entrada de NF pendente)
const TIPOS = [
  { value: 'SV', label: 'Solicitação de Verba' },
  { value: 'PEDCOM', label: 'Pedido de Compra' },
];

/** Prefixo amigável do número conforme o tipo. */
function tipoLabel(tipo: string): string {
  if (tipo === 'SV') return 'SV';
  if (tipo === 'PEDCOM') return 'Pedido';
  return tipo;
}

// LX_VERBA_STATUS no Linx — validado via SELECT DISTINCT na base
// real (10.229 'A' / 3.960 'N' em GUESS). Itens com 'N' têm valor
// zerado e descrições tipo "teste"/"rascunho" — são SVs em digitação
// ainda não finalizadas pra realização.
const STATUS_APROV = [
  { value: 'ALL', label: 'Todos' },
  { value: 'A', label: 'Aprovados' },
  { value: 'N', label: 'Em digitação' },
];

const STATUS_LABEL: Record<string, string> = {
  A: 'Aprovada',
  N: 'Em digitação',
};

/**
 * Provisões / Adiantamentos — W_HRG3_CONTAS_PAGAR_PROVISAO.
 */
export function ProvisoesPage() {
  const { activeCompany } = useCompany();
  const [tipo, setTipo] = useState('SV');
  const [search, setSearch] = useState('');
  const [statusAprov, setStatusAprov] = useState('ALL');
  const [advanced, setAdvanced] = useState<AdvancedFilterValues>({});
  const { data: branches } = useFinancialBranches(activeCompany?.id);
  const { data: costCenters } = useFinancialCostCenters(activeCompany?.id);
  const [selected, setSelected] = useState<ProvisaoRow | null>(null);

  const detailSections: DetailSection[] = [
    {
      title: 'Identificação',
      fields: [
        {
          label: 'Tipo',
          value: (r) =>
            r.tipo === 'SV' ? 'Solicitação de Verba' : 'Pedido de Compra',
        },
        { label: 'Número', value: (r) => String(r.id) },
        { label: 'Parcela', value: (r) => String(r.idParcela ?? '—') },
        { label: 'Emitente', value: (r) => r.emitente as string, cols: 2 },
        { label: 'Status', value: (r) => r.statusAprovacao as string },
        {
          label: 'Descrição',
          value: (r) => r.descItem as string,
          cols: 3,
        },
        { label: 'Observação', value: (r) => r.obs as string, cols: 3 },
      ],
    },
    {
      title: 'Beneficiário',
      fields: [
        { label: 'Código', value: (r) => r.codClifor as string },
        { label: 'Nome', value: (r) => r.nomeClifor as string, cols: 2 },
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
          label: 'Valor a entregar',
          value: (r) => r.valorEntregar as number,
          kind: 'currency',
        },
        { label: 'Moeda', value: (r) => r.moeda as string },
      ],
    },
    {
      title: 'Contábil',
      fields: [
        {
          label: 'Conta contábil',
          value: (r) => r.contaContabil as string,
          cols: 2,
        },
        { label: 'Filial', value: (r) => r.ctbFilial as string },
        { label: 'Centro de custo', value: (r) => r.ctbCentroCusto as string },
      ],
    },
  ];

  const { data, isLoading } = useProvisoes({
    companyId: activeCompany?.id,
    tipo,
    search: search || undefined,
    fornecedor: advanced.fornecedor,
    statusAprovacao: statusAprov === 'ALL' ? undefined : statusAprov,
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
            placeholder="Emitente, beneficiário, descrição, ID…"
            className="pl-8"
          />
        </div>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIPOS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusAprov} onValueChange={setStatusAprov}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_APROV.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="ml-auto text-sm text-muted-foreground">
          {isLoading ? 'Carregando…' : `${rows.length} provisão(ões)`}
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
              <TableHead>Número</TableHead>
              <TableHead>Emitente</TableHead>
              <TableHead>Beneficiário</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Filial / CC</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor original</TableHead>
              <TableHead className="text-right">A entregar</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground">
                  Nenhuma provisão.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={`${r.tipo}-${r.id}-${r.idParcela ?? 0}`}
                onClick={() => setSelected(r)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-mono text-xs">
                  {tipoLabel(r.tipo)} {String(r.id)}
                </TableCell>
                <TableCell>{r.emitente}</TableCell>
                <TableCell>
                  <div className="font-medium">{r.nomeClifor}</div>
                  <div className="text-xs text-muted-foreground">{r.codClifor}</div>
                </TableCell>
                <TableCell className="max-w-[220px] truncate" title={r.descItem ?? ''}>
                  {r.descItem}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.ctbFilial} / {r.ctbCentroCusto}
                </TableCell>
                <TableCell>{formatDate(r.emissao)}</TableCell>
                <TableCell>{formatDate(r.vencimentoReal)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.valorOriginal)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.valorEntregar)}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      'rounded-full px-2 py-0.5 text-xs ' +
                      (r.statusAprovacao === 'A'
                        ? 'bg-success/15 text-success'
                        : r.statusAprovacao === 'N'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-muted')
                    }
                    title={r.statusAprovacao ?? ''}
                  >
                    {r.statusAprovacao
                      ? (STATUS_LABEL[r.statusAprovacao] ?? r.statusAprovacao)
                      : '—'}
                  </span>
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
          selected
            ? `${selected.tipo === 'SV' ? 'Solicitação de Verba' : 'Pedido de Compra'} ${selected.id}`
            : ''
        }
        subtitle={selected?.nomeClifor ?? ''}
        record={selected as unknown as Record<string, unknown>}
        sections={detailSections}
      />
    </div>
  );
}
