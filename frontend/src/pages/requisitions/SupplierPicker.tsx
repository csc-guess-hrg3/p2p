import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  Building2,
  CheckCircle2,
  ChevronsUpDown,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ErpSupplier } from '@/lib/integration';
import {
  lookupCnpjPublic,
  maskCnpj,
  type PublicCnpjData,
} from '@/lib/quotations';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface SupplierPickerValue {
  /** Cadastrado: ERP code preenchido. Externo: vazio. */
  supplierErpCode: string;
  /** CNPJ — sempre presente (do ERP ou digitado). */
  supplierCnpj: string;
  /** Razão social — vem do ERP, da BrasilAPI ou digitada. */
  supplierName: string;
  /** True quando o fornecedor não está no ERP (vai ser criado ao aprovar). */
  isExternal: boolean;
  /** Condição de pagamento sugerida (auto pelo ERP/Receita). */
  suggestedPaymentCondition?: string | null;
}

interface Props {
  company?: string;
  value: SupplierPickerValue;
  onChange: (next: SupplierPickerValue) => void;
}

const EMPTY: SupplierPickerValue = {
  supplierErpCode: '',
  supplierCnpj: '',
  supplierName: '',
  isExternal: false,
  suggestedPaymentCondition: null,
};

/**
 * Seletor de fornecedor — UM campo só. Você digita nome OU CNPJ e o dropdown
 * resolve tudo:
 *  - acha no ERP e ativo   → seleciona;
 *  - acha no ERP e inativo → mostra bloqueado (reative no Linx antes);
 *  - é um CNPJ que não está no ERP → oferece "cadastrar novo" (dados da
 *    Receita quando houver) → vai pra fila de Validação de Fornecedor ao
 *    aprovar a requisição;
 *  - não achou → confira o CNPJ / informe o nome.
 */
export function SupplierPicker({ company, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [manualName, setManualName] = useState('');

  const digits = search.replace(/\D/g, '');
  const isFullCnpj = digits.length === 14;
  const term = search.trim();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['supplier-search', company, term],
    queryFn: async () =>
      (
        await api.get<ErpSupplier[]>(`/integration/${company}/suppliers`, {
          // Inclui inativos — aparecem bloqueados em vez de sumir.
          params: { search: term, includeInactive: 'true' },
        })
      ).data,
    enabled: !!company && open && term.length >= 2,
  });

  const active = useMemo(() => results.filter((s) => !s.inativo), [results]);
  const inactive = useMemo(() => results.filter((s) => s.inativo), [results]);

  // Fallback Receita: só quando é um CNPJ completo, NÃO está no ERP (nem ativo
  // nem inativo) e a busca já respondeu. Se existe inativo com esse CNPJ, a
  // gente NÃO oferece cadastro novo — manda reativar.
  const notInErp = isFullCnpj && !isFetching && results.length === 0;
  const [publicMatch, setPublicMatch] = useState<PublicCnpjData | null>(null);
  const [receitaLoading, setReceitaLoading] = useState(false);
  useEffect(() => {
    if (!open || !notInErp || !company) {
      setPublicMatch(null);
      setReceitaLoading(false);
      return;
    }
    let cancelled = false;
    setReceitaLoading(true);
    const t = setTimeout(async () => {
      const pub = await lookupCnpjPublic(company, digits);
      if (cancelled) return;
      setPublicMatch(pub);
      setManualName(pub?.razaoSocial ?? '');
      setReceitaLoading(false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notInErp, digits, company, open]);

  const hasSelection =
    !!value.supplierErpCode || (value.isExternal && !!value.supplierName);

  function selectErp(s: ErpSupplier) {
    onChange({
      supplierErpCode: s.codigo,
      supplierCnpj: (s.cnpjCpf ?? '').replace(/\D/g, ''),
      supplierName: s.nome,
      isExternal: false,
      suggestedPaymentCondition: s.condicaoPgto ?? null,
    });
    setSearch('');
    setOpen(false);
  }

  function selectExternal(name: string) {
    const nm = name.trim();
    if (!nm) return;
    onChange({
      supplierErpCode: '',
      supplierCnpj: digits,
      supplierName: nm,
      isExternal: true,
      suggestedPaymentCondition: null,
    });
    setSearch('');
    setOpen(false);
  }

  function clearSelection() {
    onChange({ ...EMPTY });
    setSearch('');
    setManualName('');
    setPublicMatch(null);
  }

  const showEmptyHint = term.length >= 2 && !isFetching && results.length === 0;

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring',
            hasSelection ? 'pr-16' : 'pr-3',
          )}
        >
          <span
            className={cn(
              'flex items-center gap-2 truncate',
              !hasSelection && 'text-muted-foreground',
            )}
          >
            {hasSelection ? (
              <>
                {value.isExternal ? (
                  <UserPlus className="size-4 shrink-0 text-info" />
                ) : (
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">
                  {value.supplierName}
                  {value.isExternal && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (novo — pra cadastro)
                    </span>
                  )}
                </span>
              </>
            ) : (
              'Selecione o fornecedor (nome ou CNPJ)'
            )}
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
            className="max-h-72 overflow-y-auto overflow-x-hidden p-1 overscroll-contain"
          >
            {term.length < 2 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Digite o nome ou o CNPJ do fornecedor.
              </p>
            )}
            {term.length >= 2 && isFetching && (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                Buscando…
              </p>
            )}

            {/* Ativos — selecionáveis */}
            {active.map((s) => (
              <button
                key={s.codigo}
                type="button"
                onClick={() => selectErp(s)}
                className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="font-medium">{s.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {s.codigo}
                  {s.cnpjCpf ? ` · ${s.cnpjCpf}` : ''}
                </span>
              </button>
            ))}

            {/* Inativos — bloqueados */}
            {inactive.map((s) => (
              <div
                key={s.codigo}
                className="flex w-full cursor-not-allowed flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm opacity-70"
              >
                <span className="flex items-center gap-2 font-medium">
                  {s.nome}
                  <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning">
                    inativo
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.codigo}
                  {s.cnpjCpf ? ` · ${s.cnpjCpf}` : ''} · reative no Linx para
                  poder usar
                </span>
              </div>
            ))}

            {/* Fallback: CNPJ completo que não está no ERP */}
            {notInErp && (
              <div className="border-t p-2">
                {receitaLoading ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">
                    Consultando a Receita Federal…
                  </p>
                ) : publicMatch ? (
                  <div className="space-y-2 rounded-md border border-info/40 bg-info/5 p-2 text-xs">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-info" />
                      <div>
                        <p className="font-medium text-info">
                          {publicMatch.razaoSocial}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {maskCnpj(digits)} — não está no ERP. Será
                          encaminhado para cadastro (a equipe fiscal cria no
                          Linx ao aprovar).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectExternal(publicMatch.razaoSocial)}
                      className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      Cadastrar novo fornecedor
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                      <p className="text-[11px] text-muted-foreground">
                        CNPJ não encontrado no ERP nem na Receita. Confira o
                        número, ou informe o nome para cadastrar mesmo assim.
                      </p>
                    </div>
                    <Input
                      className="h-8 text-xs"
                      placeholder="Nome do fornecedor"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={!manualName.trim()}
                      onClick={() => selectExternal(manualName)}
                      className="w-full rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      Cadastrar novo fornecedor
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Nome digitado, sem CNPJ completo, e sem resultado no ERP */}
            {showEmptyHint && !isFullCnpj && (
              <div className="flex items-start gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Ban className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Nenhum fornecedor encontrado. Para cadastrar um novo, digite o
                  CNPJ completo.
                </span>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {hasSelection && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            clearSelection();
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
