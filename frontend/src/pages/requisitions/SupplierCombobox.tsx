import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ErpSupplier } from '@/lib/integration';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface SupplierComboboxProps {
  company?: string;
  value: string;
  selectedName?: string;
  onChange: (codigo: string, supplier: ErpSupplier) => void;
  /** Quando fornecido + value preenchido, mostra um X para limpar a seleção. */
  onClear?: () => void;
}

/** Seletor de fornecedor com busca por nome ou CNPJ (com ou sem máscara). */
export function SupplierCombobox({
  company,
  value,
  selectedName,
  onChange,
  onClear,
}: SupplierComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['supplier-search', company, search],
    queryFn: async () =>
      (
        await api.get<ErpSupplier[]>(`/integration/${company}/suppliers`, {
          params: { search },
        })
      ).data,
    enabled: !!company && open && search.trim().length >= 2,
  });

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
            // Espaço extra à direita pra o X não cobrir o nome.
            value && onClear ? 'pr-16' : 'pr-3',
          )}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value ? selectedName || value : 'Selecione o fornecedor'}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)]">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                autoFocus
                className="pl-8"
                placeholder="Nome ou CNPJ…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            className="max-h-64 overflow-y-auto overflow-x-hidden p-1 overscroll-contain"
          >
            {search.trim().length < 2 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Digite ao menos 2 caracteres para buscar.
              </p>
            )}
            {search.trim().length >= 2 && isFetching && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Buscando…
              </p>
            )}
            {search.trim().length >= 2 && !isFetching && results.length === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Nenhum fornecedor encontrado.
              </p>
            )}
            {results.map((s) => (
              <button
                key={s.codigo}
                type="button"
                onClick={() => {
                  onChange(s.codigo, s);
                  setOpen(false);
                  setSearch('');
                }}
                className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{s.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {s.codigo}
                  {s.cnpjCpf ? ` · ${s.cnpjCpf}` : ''}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Botão X — overlay no canto direito do trigger. Fora do
          PopoverTrigger pra clicar nele NÃO abrir o popover. */}
      {value && onClear && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Limpar seleção"
          aria-label="Limpar seleção"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
