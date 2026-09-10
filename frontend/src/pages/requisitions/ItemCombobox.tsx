import { useState } from 'react';
import { ChevronsUpDown, Search } from 'lucide-react';
import type { ErpItem } from '@/lib/integration';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface ItemComboboxProps {
  items: ErpItem[];
  value: string;
  loading?: boolean;
  placeholder?: string;
  emptyText?: string;
  /** Exibe o código junto da descrição (usado pela equipe Fiscal). */
  showCode?: boolean;
  /**
   * Códigos vinculados ao fornecedor (SS_ITEM_FISCAL_FORNECEDOR). Quando
   * fornecido: sem busca, mostra SÓ os vinculados (os ~2 relevantes de 300);
   * ao buscar, mostra o catálogo todo com os vinculados no topo e os demais
   * marcados como "não vinculado" (geram pendência de vínculo ao salvar).
   */
  linkedCodes?: Set<string>;
  onSelect: (item: ErpItem) => void;
}

/** Seletor de item com busca por descrição ou código. */
export function ItemCombobox({
  items,
  value,
  loading,
  placeholder,
  emptyText,
  showCode,
  linkedCodes,
  onSelect,
}: ItemComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const label = (i: ErpItem) =>
    showCode ? `${i.codigo} — ${i.descricao}` : i.descricao;
  const selected = items.find((i) => i.codigo === value);
  const term = search.trim().toLowerCase();
  const isLinked = (i: ErpItem) => !!linkedCodes && linkedCodes.has(i.codigo);
  // Sem busca + há vínculo → só os vinculados (a lista curta do fornecedor).
  // Com busca → catálogo inteiro, vinculados no topo.
  const base = term
    ? items.filter(
        (i) =>
          i.descricao.toLowerCase().includes(term) ||
          i.codigo.toLowerCase().includes(term),
      )
    : linkedCodes
      ? items.filter(isLinked)
      : items;
  const filtered = (
    linkedCodes
      ? [...base].sort(
          (a, b) => (isLinked(b) ? 1 : 0) - (isLinked(a) ? 1 : 0),
        )
      : base
  ).slice(0, 100);
  const showCatalogHint = !!linkedCodes && !term;

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearch('');
      }}
    >
      <PopoverTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring">
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? label(selected) : placeholder ?? 'Selecione o item'}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)]">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-8"
              placeholder="Buscar por descrição ou código…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div
          // Radix Popover por padrão captura wheel/touch pra evitar
          // body-scroll-lock. Em listas longas internas, isso impede o
          // scroll dentro do dropdown. stopPropagation deixa o div
          // scrollar normal sem afetar o resto.
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="max-h-64 overflow-y-auto overflow-x-hidden p-1 overscroll-contain"
        >
          {loading && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              Carregando…
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {linkedCodes && !term
                ? 'Nenhum item vinculado a este fornecedor. Digite para buscar no catálogo.'
                : (emptyText ?? 'Nenhum item encontrado.')}
            </p>
          )}
          {!loading && showCatalogHint && filtered.length > 0 && (
            <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Itens deste fornecedor
            </p>
          )}
          {filtered.map((i) => {
            const catalogOnly = !!linkedCodes && !isLinked(i);
            return (
              <button
                key={i.codigo}
                type="button"
                onClick={() => {
                  onSelect(i);
                  setOpen(false);
                  setSearch('');
                }}
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="truncate">{label(i)}</span>
                {catalogOnly && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    catálogo
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
