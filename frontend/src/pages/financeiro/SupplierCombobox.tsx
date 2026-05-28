import { useEffect, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFinancialSuppliers } from '@/lib/financial';

/**
 * Combobox de fornecedor com busca server-side e debounce.
 *
 * Valor `value` é o CNPJ ou nome textual que vira filtro no backend
 * (que aceita ambos no campo `fornecedor`). Quando o usuário seleciona
 * um fornecedor do dropdown, gravamos `NOME_CLIFOR` no value — fica
 * legível na UI e o backend resolve via LIKE.
 *
 * Por que não gravar o CLIFOR (código)? O endpoint atual busca em
 * NOME_CLIFOR/RAZAO/CGC. Usar o nome resolve sem mudar o contrato
 * de filtros do backend.
 */
interface Props {
  companyId?: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 300;

export function SupplierCombobox({
  companyId,
  value,
  onChange,
  placeholder = 'Selecione fornecedor…',
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setDebouncedSearch(typed),
      DEBOUNCE_MS,
    );
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [typed]);

  const { data: items = [], isLoading } = useFinancialSuppliers({
    companyId,
    search: debouncedSearch || undefined,
  });

  // Mantém o input em sync com o valor externo quando fechado, mas
  // permite o usuário digitar livremente quando aberto.
  useEffect(() => {
    if (!open) setTyped(value ?? '');
  }, [open, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
        >
          <span className="truncate text-left">
            {value || (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value && (
              <X
                className="size-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
              />
            )}
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <div className="relative border-b">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Buscar por nome ou CNPJ…"
            className="h-9 rounded-none border-0 pl-8 shadow-none focus-visible:ring-0"
            autoFocus
          />
        </div>
        <div
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          className="max-h-72 overflow-y-auto overscroll-contain"
        >
          {isLoading && (
            <p className="p-3 text-xs text-muted-foreground">Carregando…</p>
          )}
          {!isLoading && items.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              {debouncedSearch
                ? 'Nenhum fornecedor encontrado.'
                : 'Digite pra buscar…'}
            </p>
          )}
          {items.map((s) => {
            const selected = value === s.name;
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => {
                  onChange(s.name);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent',
                  selected && 'bg-accent',
                )}
              >
                <Check
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.code}
                    {s.cnpj ? ` · ${s.cnpj}` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
