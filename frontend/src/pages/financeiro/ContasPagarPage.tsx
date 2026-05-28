import { useState } from 'react';
import { useCompany } from '@/lib/company';
import {
  useContasPagar,
  useContasPagarDocumentos,
  useContasPagarItens,
  useContasPagarParcelas,
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
import { Search } from 'lucide-react';
import {
  AdvancedFilters,
  type AdvancedFilterValues,
} from './AdvancedFilters';
import { DetailDialog, type DetailSection } from './DetailDialog';
import type {
  ContaPagarRow,
  ContaPagarDocumentoRow,
} from '@/lib/financial';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Todos' },
  { value: 'A_VENCER', label: 'A vencer' },
  { value: 'VENCIDO', label: 'Vencidos' },
  { value: 'PAGO', label: 'Pagos' },
] as const;

/** Contas a Pagar — lê W_CTB_A_PAGAR_PARCELA do Linx. */
export function ContasPagarPage() {
  const { activeCompany } = useCompany();
  const [viewMode, setViewMode] = useState<'title' | 'document'>('title');
  const [status, setStatus] = useState<string>('A_VENCER');
  const [search, setSearch] = useState('');
  const [advanced, setAdvanced] = useState<AdvancedFilterValues>({});
  const { data: branches } = useFinancialBranches(activeCompany?.id);
  const { data: costCenters } = useFinancialCostCenters(activeCompany?.id);
  const [selected, setSelected] = useState<ContaPagarRow | null>(null);
  const [selectedDoc, setSelectedDoc] =
    useState<ContaPagarDocumentoRow | null>(null);

  // Parcelas — modo título
  const { data: parcelas, isLoading: parcelasLoading } = useContasPagarParcelas(
    {
      companyId: activeCompany?.id,
      lancamento: selected ? Number(selected.lancamento) : undefined,
      item: selected ? Number(selected.item) : undefined,
    },
  );

  // Itens — modo documento (drill-down)
  const { data: itens, isLoading: itensLoading } = useContasPagarItens({
    companyId: activeCompany?.id,
    lancamento: selectedDoc ? Number(selectedDoc.lancamento) : undefined,
  });

  // Listagem (uma das duas roda por vez via `enabled`)
  const docsQ = useContasPagarDocumentos({
    companyId: activeCompany?.id,
    status: status === 'ALL' ? undefined : (status as 'A_VENCER'),
    search: search || undefined,
    fornecedor: advanced.fornecedor,
    emissaoFrom: advanced.emissaoFrom,
    emissaoTo: advanced.emissaoTo,
    vencimentoFrom: advanced.vencimentoFrom,
    vencimentoTo: advanced.vencimentoTo,
    valorMin: advanced.valorMin,
    valorMax: advanced.valorMax,
    filial: advanced.filial,
    centroCusto: advanced.centroCusto,
    limit: 200,
    enabled: viewMode === 'document',
  });

  const detailSections: DetailSection[] = [
    {
      title: 'Identificação',
      fields: [
        { label: 'Lançamento', value: (r) => String(r.lancamento) },
        { label: 'Item', value: (r) => String(r.item) },
        {
          label: 'Qtd. parcelas',
          value: (r) => String(r.qtdParcelas ?? 1),
        },
        { label: 'Tipo', value: (r) => r.tipoLancamento as string },
        { label: 'Fatura', value: (r) => r.fatura as string },
        { label: 'Posição', value: (r) => r.posicao as string },
      ],
    },
    {
      title: 'Fornecedor',
      fields: [
        { label: 'Código', value: (r) => r.codClifor as string },
        { label: 'Nome', value: (r) => r.nomeClifor as string, cols: 2 },
        { label: 'Razão social', value: (r) => r.razaoSocial as string, cols: 2 },
        { label: 'CNPJ/CPF', value: (r) => r.cnpjCpf as string },
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
          label: 'Valor a pagar',
          value: (r) => r.valorAPagar as number,
          kind: 'currency',
        },
        {
          label: 'Saldo devido',
          value: (r) => r.saldoDevido as number,
          kind: 'currency',
        },
        {
          label: 'Total pago',
          value: (r) => r.totalPago as number,
          kind: 'currency',
        },
      ],
    },
    {
      title: 'Contábil',
      fields: [
        { label: 'Conta contábil', value: (r) => r.contaContabil as string },
        {
          label: 'Filial',
          value: (r) => `${r.codFilial ?? ''} ${r.razaoFilial ?? ''}`.trim(),
          cols: 2,
        },
        {
          label: 'Status conciliação',
          value: (r) =>
            r.descStatusConciliacao
              ? `${r.statusConciliacao} · ${r.descStatusConciliacao}`
              : (r.statusConciliacao as string),
          cols: 2,
        },
        { label: 'Conciliado DDA', value: (r) => r.conciliadoDda as string },
      ],
    },
  ];

  const titleQ = useContasPagar({
    companyId: viewMode === 'title' ? activeCompany?.id : undefined,
    status: status === 'ALL' ? undefined : (status as 'A_VENCER'),
    search: search || undefined,
    fornecedor: advanced.fornecedor,
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

  const isLoading = viewMode === 'title' ? titleQ.isLoading : docsQ.isLoading;
  const rows = viewMode === 'title' ? (titleQ.data?.items ?? []) : [];
  const docRows = viewMode === 'document' ? (docsQ.data?.items ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lançamento, fornecedor, CNPJ ou fatura…"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-2 inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('title')}
            className={
              'rounded px-3 py-1 ' +
              (viewMode === 'title'
                ? 'bg-background font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
          >
            Por título
          </button>
          <button
            type="button"
            onClick={() => setViewMode('document')}
            className={
              'rounded px-3 py-1 ' +
              (viewMode === 'document'
                ? 'bg-background font-semibold shadow-sm'
                : 'text-muted-foreground hover:text-foreground')
            }
            title="Agrupa por LANCAMENTO mostrando a NF inteira (principal + retenções)"
          >
            Por documento
          </button>
        </div>
        <p className="ml-auto text-sm text-muted-foreground">
          {isLoading
            ? 'Carregando…'
            : viewMode === 'title'
              ? `${rows.length} título(s)`
              : `${docRows.length} documento(s)`}
        </p>
      </div>

      <AdvancedFilters
        value={advanced}
        onChange={setAdvanced}
        branches={branches}
        costCenters={costCenters}
        companyId={activeCompany?.id}
      />

      {viewMode === 'document' && (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lançamento</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Fatura</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor bruto</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Posição</TableHead>
                <TableHead className="text-right">Items</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docRows.length === 0 && !isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Nenhum documento encontrado.
                  </TableCell>
                </TableRow>
              )}
              {docRows.map((r) => (
                <TableRow
                  key={String(r.lancamento)}
                  onClick={() => setSelectedDoc(r)}
                  className="cursor-pointer hover:bg-muted/50"
                >
                  <TableCell
                    className="font-mono text-xs"
                    title={`${r.qtdItens} item(s) · ${r.qtdParcelas} parcela(s)`}
                  >
                    {String(r.lancamento)}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {r.nomeClifor ?? r.razaoSocial}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.cnpjCpf}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.fatura}
                  </TableCell>
                  <TableCell>{formatDate(r.emissao)}</TableCell>
                  <TableCell>{formatDate(r.vencimentoReal)}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(r.valorOriginal)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(r.saldoDevido)}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {r.posicao ?? '—'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.qtdItens}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {viewMode === 'title' && (
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lançamento</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Fatura</TableHead>
              <TableHead>Emissão</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead className="text-right">Valor original</TableHead>
              <TableHead className="text-right">Saldo devido</TableHead>
              <TableHead>Posição</TableHead>
              <TableHead>Tipo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && !isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                  Nenhum título encontrado.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow
                key={`${r.lancamento}-${r.item}-${r.idParcela ?? 'all'}`}
                onClick={() => setSelected(r)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell
                  className="font-mono text-xs"
                  title={`Item ${r.item} · ${r.qtdParcelas} parcela(s)`}
                >
                  {String(r.lancamento)}
                  {r.qtdParcelas && r.qtdParcelas > 1 && (
                    <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {r.qtdParcelas}×
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.nomeClifor ?? r.razaoSocial}</div>
                  <div className="text-xs text-muted-foreground">{r.cnpjCpf}</div>
                </TableCell>
                <TableCell>{r.fatura}</TableCell>
                <TableCell>{formatDate(r.emissao)}</TableCell>
                <TableCell>{formatDate(r.vencimentoReal)}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.valorOriginal)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(r.saldoDevido)}
                </TableCell>
                <TableCell>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {r.posicao ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {r.tipoLancamento}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      )}

      <DetailDialog
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected
            ? `Lançamento ${selected.lancamento} · Item ${selected.item}`
            : ''
        }
        subtitle={selected?.nomeClifor ?? selected?.razaoSocial ?? ''}
        record={selected as unknown as Record<string, unknown>}
        sections={detailSections}
        footer={
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Parcelas
            </h3>
            {parcelasLoading && (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            )}
            {parcelas && parcelas.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Pago</TableHead>
                      <TableHead>Posição</TableHead>
                      <TableHead>Banco</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parcelas.map((p) => (
                      <TableRow key={p.idParcela}>
                        <TableCell className="font-mono text-xs">
                          {p.idParcela}
                        </TableCell>
                        <TableCell>{formatDate(p.vencimentoReal)}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.valorOriginal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.saldoDevido)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(p.totalPago)}
                        </TableCell>
                        <TableCell>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                            {p.posicao ?? '—'}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {p.banco
                            ? `${p.banco}${p.numeroBancario ? ' · ' + p.numeroBancario : ''}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        }
      />

      <DetailDialog
        open={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
        title={
          selectedDoc ? `Documento — Lançamento ${selectedDoc.lancamento}` : ''
        }
        subtitle={selectedDoc?.nomeClifor ?? selectedDoc?.razaoSocial ?? ''}
        record={selectedDoc as unknown as Record<string, unknown>}
        sections={[
          {
            title: 'Documento',
            fields: [
              { label: 'Lançamento', value: (r) => String(r.lancamento) },
              { label: 'Fatura', value: (r) => r.fatura as string },
              { label: 'Posição', value: (r) => r.posicao as string },
              {
                label: 'Itens contábeis',
                value: (r) => String(r.qtdItens),
              },
              {
                label: 'Parcelas (total)',
                value: (r) => String(r.qtdParcelas),
              },
              { label: 'Emissão', value: (r) => r.emissao as string, kind: 'date' },
            ],
          },
          {
            title: 'Fornecedor',
            fields: [
              { label: 'Código', value: (r) => r.codClifor as string },
              { label: 'Nome', value: (r) => r.nomeClifor as string, cols: 2 },
              {
                label: 'Razão social',
                value: (r) => r.razaoSocial as string,
                cols: 2,
              },
              { label: 'CNPJ/CPF', value: (r) => r.cnpjCpf as string },
            ],
          },
          {
            title: 'Valores',
            fields: [
              {
                label: 'Valor bruto da NF',
                value: (r) => r.valorOriginal as number,
                kind: 'currency',
              },
              {
                label: 'Saldo a pagar',
                value: (r) => r.saldoDevido as number,
                kind: 'currency',
              },
              {
                label: 'Total pago',
                value: (r) => r.totalPago as number,
                kind: 'currency',
              },
            ],
          },
        ]}
        footer={
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Decomposição contábil (principal + retenções)
            </h3>
            {itensLoading && (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            )}
            {itens && itens.length > 0 && (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Fatura</TableHead>
                      <TableHead>Conta contábil</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Parcelas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((it) => (
                      <TableRow key={String(it.item)}>
                        <TableCell className="font-mono text-xs">
                          {String(it.item)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {it.fatura}
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">
                            {it.contaContabil}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {it.descConta}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {it.nomeClifor}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(it.valorOriginal)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(it.saldoDevido)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {it.qtdParcelas}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        }
      />
    </div>
  );
}
