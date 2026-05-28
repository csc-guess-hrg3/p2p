import { useState, type ReactNode } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CodeName } from '@/lib/financial';
import { SupplierCombobox } from './SupplierCombobox';

/**
 * Estado dos filtros avançados compartilhados pelas 4 telas
 * financeiras. Campos não aplicáveis são omitidos pela tela (não há
 * uma estrutura por endpoint — usamos a interseção e a tela decide
 * quais grupos renderizar).
 */
export interface AdvancedFilterValues {
  emissaoFrom?: string;
  emissaoTo?: string;
  recebimentoFrom?: string;
  recebimentoTo?: string;
  vencimentoFrom?: string;
  vencimentoTo?: string;
  valorMin?: string;
  valorMax?: string;
  filial?: string;
  centroCusto?: string;
  /** Filtro dedicado de fornecedor (CNPJ ou nome). Separado da search
      geral pra permitir combinar com filtros de data, valor, etc. */
  fornecedor?: string;
  statusAprovacao?: string;
}

interface Props {
  value: AdvancedFilterValues;
  onChange: (next: AdvancedFilterValues) => void;
  /** Habilita o grupo de range de emissão (label customizável). */
  showEmissao?: boolean;
  emissaoLabel?: string;
  /** Para DDAs onde a "emissão" é o recebimento. */
  showRecebimento?: boolean;
  /** Habilita range de vencimento. */
  showVencimento?: boolean;
  /** Habilita range de valor. */
  showValor?: boolean;
  /** Habilita selects de filial/centro de custo. */
  showFilialCC?: boolean;
  /** Mostra campo de fornecedor (CNPJ ou nome). */
  showFornecedor?: boolean;
  /** Opções de filial/CC vindas do Linx — quando omitidas, cai em Input texto. */
  branches?: CodeName[];
  costCenters?: CodeName[];
  /** ID da empresa ativa (necessário pro combobox de fornecedor buscar). */
  companyId?: string;
  /** Slot pra filtros adicionais específicos da tela. */
  extra?: ReactNode;
}

const ANY = '__ANY__';

/**
 * Painel colapsável de filtros avançados — fica acima da tabela.
 * Mostra contador de filtros ativos no botão, abre/fecha com chevron.
 * O botão "Limpar" zera só os campos visíveis (preserva os ocultos).
 */
export function AdvancedFilters({
  value,
  onChange,
  showEmissao = true,
  emissaoLabel = 'Emissão',
  showRecebimento = false,
  showVencimento = true,
  showValor = true,
  showFilialCC = true,
  showFornecedor = true,
  branches,
  costCenters,
  companyId,
  extra,
}: Props) {
  const [open, setOpen] = useState(false);

  const activeCount = countActive(value, {
    showEmissao,
    showRecebimento,
    showVencimento,
    showValor,
    showFilialCC,
    showFornecedor,
  });

  function set<K extends keyof AdvancedFilterValues>(
    k: K,
    v: AdvancedFilterValues[K],
  ) {
    onChange({ ...value, [k]: v || undefined });
  }

  function clear() {
    const next: AdvancedFilterValues = { ...value };
    if (showEmissao) {
      next.emissaoFrom = undefined;
      next.emissaoTo = undefined;
    }
    if (showRecebimento) {
      next.recebimentoFrom = undefined;
      next.recebimentoTo = undefined;
    }
    if (showVencimento) {
      next.vencimentoFrom = undefined;
      next.vencimentoTo = undefined;
    }
    if (showValor) {
      next.valorMin = undefined;
      next.valorMax = undefined;
    }
    if (showFilialCC) {
      next.filial = undefined;
      next.centroCusto = undefined;
    }
    if (showFornecedor) next.fornecedor = undefined;
    onChange(next);
  }

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm"
      >
        <span className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <span className="font-medium">Filtros avançados</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {activeCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            'size-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 border-t bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
          {showEmissao && (
            <RangeGroup
              label={emissaoLabel}
              from={value.emissaoFrom}
              to={value.emissaoTo}
              type="date"
              onFrom={(v) => set('emissaoFrom', v)}
              onTo={(v) => set('emissaoTo', v)}
            />
          )}
          {showRecebimento && (
            <RangeGroup
              label="Recebimento"
              from={value.recebimentoFrom}
              to={value.recebimentoTo}
              type="date"
              onFrom={(v) => set('recebimentoFrom', v)}
              onTo={(v) => set('recebimentoTo', v)}
            />
          )}
          {showVencimento && (
            <RangeGroup
              label="Vencimento"
              from={value.vencimentoFrom}
              to={value.vencimentoTo}
              type="date"
              onFrom={(v) => set('vencimentoFrom', v)}
              onTo={(v) => set('vencimentoTo', v)}
            />
          )}
          {showValor && (
            <CurrencyRangeGroup
              label="Valor"
              from={value.valorMin}
              to={value.valorMax}
              onFrom={(v) => set('valorMin', v)}
              onTo={(v) => set('valorMax', v)}
            />
          )}
          {showFilialCC && (
            <>
              {branches && branches.length > 0 ? (
                <CodeSelect
                  label="Filial"
                  value={value.filial}
                  items={branches}
                  onChange={(v) => set('filial', v)}
                />
              ) : (
                <SingleGroup
                  label="Filial"
                  value={value.filial}
                  onChange={(v) => set('filial', v)}
                  placeholder="código"
                />
              )}
              {costCenters && costCenters.length > 0 ? (
                <CodeSelect
                  label="Centro de custo"
                  value={value.centroCusto}
                  items={costCenters}
                  onChange={(v) => set('centroCusto', v)}
                />
              ) : (
                <SingleGroup
                  label="Centro de custo"
                  value={value.centroCusto}
                  onChange={(v) => set('centroCusto', v)}
                  placeholder="código"
                />
              )}
            </>
          )}
          {showFornecedor && (
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Fornecedor
              </label>
              <SupplierCombobox
                companyId={companyId}
                value={value.fornecedor}
                onChange={(v) => set('fornecedor', v)}
              />
            </div>
          )}
          {extra}
          {activeCount > 0 && (
            <div className="col-span-full flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clear}
                className="gap-1"
              >
                <X className="size-3.5" />
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RangeGroup({
  label,
  from,
  to,
  type,
  onFrom,
  onTo,
  fromPlaceholder,
  toPlaceholder,
}: {
  label: string;
  from?: string;
  to?: string;
  type: 'date' | 'number';
  onFrom: (v: string | undefined) => void;
  onTo: (v: string | undefined) => void;
  fromPlaceholder?: string;
  toPlaceholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <Input
          type={type}
          value={from ?? ''}
          onChange={(e) => onFrom(e.target.value || undefined)}
          placeholder={fromPlaceholder ?? 'de'}
          className="h-9"
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type={type}
          value={to ?? ''}
          onChange={(e) => onTo(e.target.value || undefined)}
          placeholder={toPlaceholder ?? 'até'}
          className="h-9"
        />
      </div>
    </div>
  );
}

/**
 * Range de valor monetário com formatação BR — usa CurrencyInput nos
 * dois campos. O `from`/`to` saem como string ("1500.50") pra serem
 * mandados como query param ao backend, mas internamente o componente
 * trabalha com number pra exibir formatado.
 */
function CurrencyRangeGroup({
  label,
  from,
  to,
  onFrom,
  onTo,
}: {
  label: string;
  from?: string;
  to?: string;
  onFrom: (v: string | undefined) => void;
  onTo: (v: string | undefined) => void;
}) {
  const toNum = (s?: string) => (s ? Number(s) : null);
  const fromNum = (n: number | null) =>
    n == null ? undefined : String(n);
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1">
        <CurrencyInput
          value={toNum(from)}
          onChange={(n) => onFrom(fromNum(n))}
          nullable
          placeholder="mín"
        />
        <span className="text-muted-foreground">–</span>
        <CurrencyInput
          value={toNum(to)}
          onChange={(n) => onTo(fromNum(n))}
          nullable
          placeholder="máx"
        />
      </div>
    </div>
  );
}

function CodeSelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value?: string;
  items: CodeName[];
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Select
        value={value ?? ANY}
        onValueChange={(v) => onChange(v === ANY ? undefined : v)}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ANY}>Todos</SelectItem>
          {items.map((it) => (
            <SelectItem key={it.code} value={it.code}>
              <span className="font-mono text-xs">{it.code}</span>
              <span className="ml-2">{it.name}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SingleGroup({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <Input
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder={placeholder}
        className="h-9"
      />
    </div>
  );
}

function countActive(
  v: AdvancedFilterValues,
  visible: {
    showEmissao: boolean;
    showRecebimento: boolean;
    showVencimento: boolean;
    showValor: boolean;
    showFilialCC: boolean;
    showFornecedor: boolean;
  },
): number {
  let n = 0;
  if (visible.showEmissao && (v.emissaoFrom || v.emissaoTo)) n++;
  if (visible.showRecebimento && (v.recebimentoFrom || v.recebimentoTo)) n++;
  if (visible.showVencimento && (v.vencimentoFrom || v.vencimentoTo)) n++;
  if (visible.showValor && (v.valorMin || v.valorMax)) n++;
  if (visible.showFilialCC) {
    if (v.filial) n++;
    if (v.centroCusto) n++;
  }
  if (visible.showFornecedor && v.fornecedor) n++;
  if (v.statusAprovacao) n++;
  return n;
}
