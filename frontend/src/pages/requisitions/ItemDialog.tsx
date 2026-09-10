import { useEffect, useMemo, useState } from 'react';
import { PencilLine, Sparkles } from 'lucide-react';
import {
  useSupplierItems,
  useItems,
  useBranchRateios,
  useCcRateios,
  type ErpItem,
} from '@/lib/integration';
import type { RequisitionItemForm } from '@/lib/requisitions';
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

interface ItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company?: string;
  supplierCode?: string;
  initial?: RequisitionItemForm | null;
  onConfirm: (item: RequisitionItemForm) => void;
}

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
  const branchRateios = useBranchRateios(company);
  const ccRateios = useCcRateios(company);

  // Descrição livre: o item não está no catálogo. Sai sem código e sem
  // conta — a equipe fiscal cadastra/classifica depois.
  const [describe, setDescribe] = useState(false);
  const [itemErpCode, setItemErpCode] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  // Conta contábil não é campo do solicitante: herda do item (catálogo) ou
  // fica vazia (fiscal define). Mantida em estado só para trafegar no payload.
  const [accountingAccount, setAccountingAccount] = useState('');
  const [branchRateioCode, setBranchRateioCode] = useState('');
  const [costCenterRateioCode, setCostCenterRateioCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Popula o formulário ao abrir.
  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setDescribe(initial.fiscalMode === 'NEW' || !initial.itemErpCode);
      setItemErpCode(initial.itemErpCode ?? '');
      setItemDescription(initial.itemDescription);
      setUnit(initial.unit);
      setQuantity(String(initial.quantity));
      setEstimatedPrice(initial.estimatedPrice);
      setAccountingAccount(initial.accountingAccount);
      setBranchRateioCode(initial.branchRateioCode);
      setCostCenterRateioCode(initial.costCenterRateioCode);
    } else {
      setDescribe(false);
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

  // Pré-seleciona o CC principal da equipe quando o campo está vazio (item
  // novo sem padrão próprio). Não sobrescreve edição nem o padrão vindo do
  // item do catálogo — o usuário pode trocar (ex.: TI lançando no CC de Loja).
  useEffect(() => {
    if (!open || costCenterRateioCode) return;
    const primary = (ccRateios.data ?? []).find((r) => r.isPrimary);
    if (primary) setCostCenterRateioCode(primary.codigo);
  }, [open, costCenterRateioCode, ccRateios.data]);

  // Itens vinculados ao fornecedor (não geram pendência de vínculo).
  const linkedCodes = useMemo(
    () => new Set((supplierItems.data ?? []).map((i) => i.codigo)),
    [supplierItems.data],
  );

  /** Ao escolher um item do catálogo, preenche descrição, unidade e padrões. */
  function applyItem(it: ErpItem | undefined) {
    if (!it) return;
    setItemErpCode(it.codigo);
    setItemDescription(it.descricao);
    setUnit(it.unidade ?? '');
    setAccountingAccount(it.contaContabilPadrao ?? '');
    if (it.rateioFilialPadrao) setBranchRateioCode(it.rateioFilialPadrao);
    if (it.rateioCcPadrao) setCostCenterRateioCode(it.rateioCcPadrao);
  }

  /** Alterna entre escolher do catálogo e descrever manualmente. */
  function toggleDescribe(next: boolean) {
    setDescribe(next);
    setItemErpCode('');
    setAccountingAccount('');
    if (next) {
      // Vindo do catálogo, limpa a descrição herdada pra a pessoa escrever.
      setItemDescription('');
      setUnit('');
    }
  }

  function handleConfirm() {
    const qty = Number(quantity);
    const price = estimatedPrice;
    if (!describe && !itemErpCode) {
      return setError('Selecione o item ou marque "descrever manualmente".');
    }
    if (!itemDescription.trim()) return setError('Informe a descrição.');
    if (!unit.trim()) return setError('Informe a unidade.');
    if (!(qty > 0)) return setError('Quantidade inválida.');
    if (!(price >= 0)) return setError('Preço inválido.');
    if (!branchRateioCode) return setError('Selecione o rateio de filial.');
    if (!costCenterRateioCode) {
      return setError('Selecione o rateio de centro de custo.');
    }
    // Conta contábil não é exigida do solicitante: item do catálogo herda a
    // dele; item livre vai sem conta e a equipe fiscal classifica.
    const fiscalMode = describe
      ? 'NEW'
      : linkedCodes.has(itemErpCode)
        ? 'NONE'
        : 'LINK';
    onConfirm({
      fiscalMode,
      itemErpCode: describe ? null : itemErpCode,
      itemDescription: itemDescription.trim(),
      unit: unit.trim(),
      quantity: qty,
      estimatedPrice: price,
      accountingAccount: describe ? '' : accountingAccount,
      branchRateioCode,
      costCenterRateioCode,
    });
    onOpenChange(false);
  }

  const linkPending = !describe && !!itemErpCode && !linkedCodes.has(itemErpCode);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar item' : 'Adicionar item'}</DialogTitle>
          <DialogDescription>
            Escolha o item no catálogo do Linx. Não encontrou? Descreva à mão —
            a equipe fiscal cuida do cadastro e da classificação contábil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item — catálogo ou descrição livre */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>{describe ? 'Descrição do item' : 'Item'}</Label>
              <button
                type="button"
                onClick={() => toggleDescribe(!describe)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {describe ? (
                  <>
                    <Sparkles className="size-3.5" /> Buscar no catálogo
                  </>
                ) : (
                  <>
                    <PencilLine className="size-3.5" /> Não encontrei — descrever
                    manualmente
                  </>
                )}
              </button>
            </div>

            {describe ? (
              <Input
                placeholder="Ex.: Manutenção do ar-condicionado da sala 3"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
              />
            ) : (
              <ItemCombobox
                items={catalog.data ?? []}
                value={itemErpCode}
                loading={catalog.isLoading || supplierItems.isLoading}
                linkedCodes={linkedCodes}
                placeholder={
                  linkedCodes.size > 0
                    ? 'Itens do fornecedor (ou busque no catálogo)'
                    : 'Buscar item no catálogo'
                }
                onSelect={applyItem}
              />
            )}

            {linkPending && (
              <p className="text-xs text-muted-foreground">
                Item ainda não vinculado a este fornecedor — a equipe fiscal fará
                o vínculo automaticamente.
              </p>
            )}
          </div>

          {/* Quantidade / unidade / preço */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                step={1}
                min={1}
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input
                value={unit}
                placeholder="UN"
                disabled={!describe}
                onChange={(e) => setUnit(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preço estimado</Label>
              <CurrencyInput value={estimatedPrice} onChange={setEstimatedPrice} />
            </div>
          </div>

          {/* Rateio — decisão do solicitante (pra quais filiais / CC vai) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
