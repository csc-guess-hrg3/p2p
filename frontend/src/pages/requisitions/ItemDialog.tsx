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

type ItemMode = 'SUPPLIER' | 'CATALOG' | 'NEW';

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
  { value: 'NEW', label: 'Item novo' },
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
  const [estimatedPrice, setEstimatedPrice] = useState('');
  const [accountingAccount, setAccountingAccount] = useState('');
  const [branchRateioCode, setBranchRateioCode] = useState('');
  const [costCenterRateioCode, setCostCenterRateioCode] = useState('');
  const [editAlloc, setEditAlloc] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Popula o formulário ao abrir.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      const complete =
        !!initial.accountingAccount &&
        !!initial.branchRateioCode &&
        !!initial.costCenterRateioCode;
      setEditAlloc(!complete || initial.fiscalMode === 'NEW');
      setMode(
        initial.fiscalMode === 'NEW'
          ? 'NEW'
          : initial.fiscalMode === 'LINK'
            ? 'CATALOG'
            : 'SUPPLIER',
      );
      setItemErpCode(initial.itemErpCode ?? '');
      setItemDescription(initial.itemDescription);
      setUnit(initial.unit);
      setQuantity(String(initial.quantity));
      setEstimatedPrice(String(initial.estimatedPrice));
      setAccountingAccount(initial.accountingAccount);
      setBranchRateioCode(initial.branchRateioCode);
      setCostCenterRateioCode(initial.costCenterRateioCode);
    } else {
      setMode('SUPPLIER');
      setItemErpCode('');
      setItemDescription('');
      setUnit('');
      setQuantity('');
      setEstimatedPrice('');
      setAccountingAccount('');
      setBranchRateioCode('');
      setCostCenterRateioCode('');
      setEditAlloc(false);
    }
  }, [open, initial]);

  /** Ao escolher um item do ERP, preenche descrição, unidade e padrões. */
  function applyItem(it: ErpItem | undefined) {
    if (!it) return;
    setItemErpCode(it.codigo);
    setItemDescription(it.descricao);
    setUnit(it.unidade ?? '');
    const conta = it.contaContabilPadrao ?? '';
    const rf = it.rateioFilialPadrao ?? '';
    const rcc = it.rateioCcPadrao ?? '';
    setAccountingAccount(conta);
    setBranchRateioCode(rf);
    setCostCenterRateioCode(rcc);
    // Tem todos os padrões -> mostra fechado; senão abre a edição.
    setEditAlloc(!(conta && rf && rcc));
  }

  function changeMode(m: ItemMode) {
    setMode(m);
    setItemErpCode('');
    if (m === 'NEW') {
      setItemDescription('');
      setEditAlloc(true);
    } else {
      setEditAlloc(false);
    }
  }

  function handleConfirm() {
    const qty = Number(quantity);
    const price = Number(estimatedPrice);
    if (mode !== 'NEW' && !itemErpCode) {
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
      fiscalMode:
        mode === 'SUPPLIER' ? 'NONE' : mode === 'CATALOG' ? 'LINK' : 'NEW',
      itemErpCode: mode === 'NEW' ? null : itemErpCode,
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

  const acc = (accounts.data ?? []).find((a) => a.codigo === accountingAccount);
  const accLabel = acc ? `${acc.codigo} — ${acc.nome}` : null;
  const br = (branchRateios.data ?? []).find(
    (r) => r.codigo === branchRateioCode,
  );
  const branchLabel = br ? `${br.codigo} — ${br.descricao}` : null;
  const cc = (ccRateios.data ?? []).find(
    (r) => r.codigo === costCenterRateioCode,
  );
  const ccLabel = cc ? `${cc.codigo} — ${cc.descricao}` : null;

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
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => changeMode(m.value)}
                className={cn(
                  'flex-1 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                  mode === m.value
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'SUPPLIER' && (
            <div className="space-y-1.5">
              <Label>Item vinculado ao fornecedor</Label>
              <Select
                value={itemErpCode}
                onValueChange={(v) =>
                  applyItem(supplierList.find((i) => i.codigo === v))
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      supplierItems.isLoading
                        ? 'Carregando…'
                        : supplierList.length === 0
                          ? 'Nenhum item vinculado a este fornecedor'
                          : 'Selecione o item'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {supplierList.map((i) => (
                    <SelectItem key={i.codigo} value={i.codigo}>
                      {i.codigo} — {i.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!supplierItems.isLoading && supplierList.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Use “Outro item do catálogo” ou “Item novo”.
                </p>
              )}
            </div>
          )}

          {mode === 'CATALOG' && (
            <div className="space-y-1.5">
              <Label>Item do catálogo (será vinculado ao fornecedor)</Label>
              <Select
                value={itemErpCode}
                onValueChange={(v) =>
                  applyItem((catalog.data ?? []).find((i) => i.codigo === v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o item do catálogo" />
                </SelectTrigger>
                <SelectContent>
                  {(catalog.data ?? []).map((i) => (
                    <SelectItem key={i.codigo} value={i.codigo}>
                      {i.codigo} — {i.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-warning">
                Abrirá uma pendência fiscal para vincular este item ao
                fornecedor.
              </p>
            </div>
          )}

          {mode === 'NEW' && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1.5">
                <Label>Descrição do item novo</Label>
                <Input
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Descreva o item a ser cadastrado"
                />
              </div>
              <p className="col-span-3 text-xs text-warning">
                Abrirá uma pendência para a equipe Fiscal cadastrar o item no
                Linx.
              </p>
            </div>
          )}

          {/* Quantidade / preço */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="UN, CX…"
                disabled={mode !== 'NEW'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preço estimado</Label>
              <Input
                type="number"
                step="any"
                value={estimatedPrice}
                onChange={(e) => setEstimatedPrice(e.target.value)}
              />
            </div>
          </div>

          {/* Conta e rateios — padrão do item, com opção de editar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Conta contábil e rateios</Label>
              {!editAlloc && (
                <button
                  type="button"
                  onClick={() => setEditAlloc(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Editar
                </button>
              )}
            </div>

            {!editAlloc ? (
              <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
                <div>
                  <span className="text-muted-foreground">
                    Conta contábil:{' '}
                  </span>
                  {accLabel ?? '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Rateio de filial:{' '}
                  </span>
                  {branchLabel ?? '—'}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    Rateio de centro de custo:{' '}
                  </span>
                  {ccLabel ?? '—'}
                </div>
              </div>
            ) : (
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
            )}
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
