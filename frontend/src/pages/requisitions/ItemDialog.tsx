import { useEffect, useState } from 'react';
import {
  useSupplierItems,
  useItems,
  useAccounts,
  useBranchRateios,
  useCcRateios,
  type ErpItem,
} from '@/lib/integration';
import type { RequisitionItemForm } from '@/lib/requisitions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { ItemCombobox } from './ItemCombobox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type ItemMode = 'SUPPLIER' | 'CATALOG';

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: string;
  supplierCode?: string;
  initial?: RequisitionItemForm | null;
  onConfirm: (item: RequisitionItemForm) => void;
}

const MODES: { value: ItemMode; label: string }[] = [
  { value: 'SUPPLIER', label: 'Item do fornecedor' },
  { value: 'CATALOG', label: 'Itens não vinculados ao fornecedor' },
];

export function ItemDialog({
  open,
  onOpenChange,
  company,
  supplierCode,
  initial,
  onConfirm,
}: ItemDialogProps) {
  const supplierItems = useSupplierItems(company, supplierCode);
  const catalog = useItems(company);
  const accounts = useAccounts(company);
  const branchRateios = useBranchRateios(company);
  const ccRateios = useCcRateios(company);

  const [mode, setMode] = useState<ItemMode>('SUPPLIER');
  const [itemErpCode, setItemErpCode] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [accountingAccount, setAccountingAccount] = useState('');
  const [branchRateioCode, setBranchRateioCode] = useState('');
  const [costCenterRateioCode, setCostCenterRateioCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Popula o formulário ao abrir.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setMode(initial.fiscalMode === 'LINK' ? 'CATALOG' : 'SUPPLIER');
      setItemErpCode(initial.itemErpCode ?? '');
      setItemDescription(initial.itemDescription);
      setUnit(initial.unit);
      setQuantity(String(initial.quantity));
      setEstimatedPrice(initial.estimatedPrice);
      setAccountingAccount(initial.accountingAccount);
      setBranchRateioCode(initial.branchRateioCode);
      setCostCenterRateioCode(initial.costCenterRateioCode);
    } else {
      setMode('SUPPLIER');
      setItemErpCode('');
      setItemDescription('');
      setUnit('');
      setQuantity('');
      setEstimatedPrice(0);
      setAccountingAccount('');
      setBranchRateioCode('');
      setCostCenterRateioCode('');
    }
  }, [open, initial]);

  // Fornecedor sem itens vinculados.
  const noSupplierItems =
    !supplierItems.isLoading && (supplierItems.data ?? []).length === 0;

  // Sem itens vinculados: direciona o usuário ao catálogo.
  useEffect(() => {
    if (open && noSupplierItems && mode === 'SUPPLIER') {
      setMode('CATALOG');
    }
  }, [open, noSupplierItems, mode]);

  /** Ao escolher um item do ERP, preenche descrição, unidade e padrões. */
  function applyItem(it: ErpItem | undefined) {
    if (!it) return;
    setItemErpCode(it.codigo);
    setItemDescription(it.descricao);
    setUnit(it.unidade ?? '');
    setAccountingAccount(it.contaContabilPadrao ?? '');
    setBranchRateioCode(it.rateioFilialPadrao ?? '');
    setCostCenterRateioCode(it.rateioCcPadrao ?? '');
  }

  function changeMode(m: ItemMode) {
    setMode(m);
    setItemErpCode('');
  }

  function handleConfirm() {
    const qty = Number(quantity);
    const price = estimatedPrice;
    if (!itemErpCode) {
      return setError('Selecione o item.');
    }
    if (!itemDescription.trim()) return setError('Informe a descrição.');
    if (!unit.trim()) return setError('Informe a unidade.');
    if (!(qty > 0)) return setError('Quantidade inválida.');
    if (!(price >= 0)) return setError('Preço inválido.');
    if (!accountingAccount) return setError('Selecione a conta contábil.');
    if (!branchRateioCode) return setError('Selecione o rateio de filial.');
    if (!costCenterRateioCode) {
      return setError('Selecione o rateio de centro de custo.');
    }
    onConfirm({
      fiscalMode: mode === 'CATALOG' ? 'LINK' : 'NONE',
      itemErpCode,
      itemDescription: itemDescription.trim(),
      unit: unit.trim(),
      quantity: qty,
      estimatedPrice: price,
      accountingAccount,
      branchRateioCode,
      costCenterRateioCode,
    });
    onOpenChange(false);
  }

  const supplierList = supplierItems.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar item' : 'Adicionar item'}</DialogTitle>
          <DialogDescription>
            Itens vêm do catálogo do Linx. Sem vínculo com o fornecedor, abre-se
            uma pendência para a equipe Fiscal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Modo de escolha do item */}
          <div className="flex gap-1 rounded-md bg-muted p-1">
            {MODES.map((m) => {
              const disabled = m.value === 'SUPPLIER' && noSupplierItems;
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => changeMode(m.value)}
                  className={cn(
                    'flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                    mode === m.value
                      ? 'bg-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                    disabled && 'cursor-not-allowed opacity-40',
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {noSupplierItems && (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
              Nenhum item vinculado ao fornecedor — selecione um item do
              catálogo abaixo.
            </p>
          )}

          {mode === 'SUPPLIER' && (
            <div className="space-y-1.5">
              <Label>Item vinculado ao fornecedor</Label>
              <ItemCombobox
                items={supplierList}
                value={itemErpCode}
                loading={supplierItems.isLoading}
                placeholder="Selecione o item"
                emptyText="Nenhum item vinculado a este fornecedor"
                onSelect={applyItem}
              />
            </div>
          )}

          {mode === 'CATALOG' && (
            <div className="space-y-1.5">
              <Label>Item do catálogo (será vinculado ao fornecedor)</Label>
              <ItemCombobox
                items={catalog.data ?? []}
                value={itemErpCode}
                loading={catalog.isLoading}
                placeholder="Selecione o item do catálogo"
                onSelect={applyItem}
              />
              <p className="text-xs text-warning">
                Abrirá uma pendência fiscal para vincular este item ao
                fornecedor.
              </p>
            </div>
          )}

          {/* Quantidade / preço */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                step={1}
                min={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) =>
                  // só aceita inteiro: descarta tudo que não for dígito.
                  setQuantity(e.target.value.replace(/\D/g, ''))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input value={unit} placeholder="UN" disabled />
            </div>
            <div className="space-y-1.5">
              <Label>Preço estimado</Label>
              <CurrencyInput
                value={estimatedPrice}
                onChange={setEstimatedPrice}
              />
            </div>
          </div>

          {/* Conta e rateios — preenchidos com o padrão do item, editáveis */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Conta contábil</Label>
              <Select
                value={accountingAccount}
                onValueChange={setAccountingAccount}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts.data ?? []).map((a) => (
                    <SelectItem key={a.codigo} value={a.codigo}>
                      {a.codigo} — {a.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rateio de filial</Label>
              <Select
                value={branchRateioCode}
                onValueChange={setBranchRateioCode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o rateio de filial" />
                </SelectTrigger>
                <SelectContent>
                  {(branchRateios.data ?? []).map((r) => (
                    <SelectItem key={r.codigo} value={r.codigo}>
                      {r.codigo} — {r.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rateio de centro de custo</Label>
              <Select
                value={costCenterRateioCode}
                onValueChange={setCostCenterRateioCode}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o rateio de CC" />
                </SelectTrigger>
                <SelectContent>
                  {(ccRateios.data ?? []).map((r) => (
                    <SelectItem key={r.codigo} value={r.codigo}>
                      {r.codigo} — {r.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm}>
            {initial ? 'Salvar item' : 'Adicionar item'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
