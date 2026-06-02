import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  useCreateQuotation,
  useUpdateQuotation,
  type Quotation,
  type QuotationInput,
} from '@/lib/quotations';
import { usePaymentConditions } from '@/lib/integration';
import { extractApiMessage } from '@/lib/api-errors';
import { useCompany } from '@/lib/company';
import { useDeleteAttachment } from '@/lib/attachments';
import type { Requisition } from '@/lib/requisitions';
import { SupplierPicker, type SupplierPickerValue } from './SupplierPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';

interface FormItem {
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  requisition: Pick<Requisition, 'id' | 'items'>;
  /** Quando preenchida, é edição; senão, novo cadastro. */
  existing?: Quotation | null;
  /** Anexo (PDF) que esta cotação representa. Obrigatório no create. */
  attachmentId?: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Diálogo de cadastro/edição de cotação.
 *
 * Fluxo:
 *  1) Solicitante digita CNPJ → lookup automático no ERP (debounced).
 *  2) Se ENCONTRADO: nome + cond. pagamento auto-preenchidos, badge verde.
 *  3) Se NÃO encontrado: badge amarela "Fornecedor não cadastrado" e
 *     o campo "Nome do fornecedor" vira obrigatório (digitado pelo user).
 *  4) Itens pré-populados com a tabela de itens da requisição (descrição
 *     e unidade copiados). Quantidade e preço unitário ficam em branco
 *     pra o solicitante preencher conforme a proposta do fornecedor.
 *  5) Total recalculado a cada mudança.
 */
export function QuotationDialog({
  requisition,
  existing,
  attachmentId,
  open,
  onOpenChange,
}: Props) {
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const createMut = useCreateQuotation(requisition.id);
  const updateMut = useUpdateQuotation(requisition.id);
  const deleteAttachment = useDeleteAttachment('requisition', requisition.id);
  // Marca quando salvou com sucesso pra não apagar o anexo no `onOpenChange`
  // ao fechar (Radix dispara onOpenChange(false) tanto pelo cancel quanto
  // pelo fechar-após-save).
  const [savedOk, setSavedOk] = useState(false);
  const paymentConditions = usePaymentConditions(activeCompany?.code);

  const EMPTY_SUPPLIER: SupplierPickerValue = {
    supplierErpCode: '',
    supplierCnpj: '',
    supplierName: '',
    isExternal: false,
    suggestedPaymentCondition: null,
  };
  const [supplier, setSupplier] = useState<SupplierPickerValue>(EMPTY_SUPPLIER);
  // Bumpado ao final da inicialização do form. Usado como `key` no
  // SupplierPicker pra remontá-lo já com o `value` correto — o picker deriva
  // o modo (ERP × externo) no mount, e sem o remount uma cotação de
  // fornecedor externo abriria no modo ERP errado ao editar.
  const [supplierNonce, setSupplierNonce] = useState(0);
  const [paymentCode, setPaymentCode] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Inicializa o form ao abrir.
  useEffect(() => {
    if (!open) return;
    // Reseta o marker de "salvou" a cada abertura — assim, se a mesma
    // instância do dialog for reaproveitada, o cancel/fechar não pula
    // a limpeza do anexo.
    setSavedOk(false);
    if (existing) {
      setSupplier({
        supplierErpCode: existing.supplierErpCode ?? '',
        supplierCnpj: existing.supplierCnpj ?? '',
        supplierName: existing.supplierName,
        isExternal: !existing.supplierErpCode,
        suggestedPaymentCondition: existing.paymentConditionCode ?? null,
      });
      setPaymentCode(existing.paymentConditionCode ?? '');
      setNotes(existing.notes ?? '');
      setItems(
        existing.items.map((i) => ({
          description: i.description,
          unit: i.unit ?? '',
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      );
    } else {
      setSupplier(EMPTY_SUPPLIER);
      setPaymentCode('');
      setNotes('');
      // Pré-popula com os itens da requisição — descrição/unidade copiadas,
      // quantidade vem do original como sugestão, preço em branco.
      setItems(
        (requisition.items ?? []).map((it) => ({
          description: it.itemDescription,
          unit: it.unit,
          quantity: it.quantity,
          unitPrice: '',
        })),
      );
    }
    // Remonta o SupplierPicker já com o `supplier` setado acima (ver nota
    // em `supplierNonce`).
    setSupplierNonce((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, existing, requisition]);

  function updateItem(idx: number, patch: Partial<FormItem>) {
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      { description: '', unit: '', quantity: '1', unitPrice: '' },
    ]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = items.reduce((sum, it) => {
    const q = Number(it.quantity) || 0;
    const u = Number(it.unitPrice) || 0;
    return sum + q * u;
  }, 0);

  const cnpjDigits = supplier.supplierCnpj.replace(/\D/g, '');
  const cnpjValid = cnpjDigits.length === 14 || cnpjDigits.length === 11;
  // Fornecedor externo (não está no ERP) precisa de razão social — o
  // SupplierPicker já sinaliza isso na UI, mas validamos aqui no save.
  const needsSupplierName =
    supplier.isExternal && cnpjValid && !supplier.supplierName.trim();

  async function handleSave() {
    if (!cnpjValid) {
      toast({
        title: 'CNPJ inválido',
        description: 'Informe um CNPJ com 14 dígitos (ou CPF com 11).',
        variant: 'destructive',
      });
      return;
    }
    if (needsSupplierName) {
      toast({
        title: 'Nome do fornecedor obrigatório',
        description:
          'Como o CNPJ não está cadastrado no ERP, informe o nome do fornecedor.',
        variant: 'destructive',
      });
      return;
    }
    if (items.length === 0) {
      toast({
        title: 'Sem itens',
        description: 'A cotação precisa de ao menos 1 item.',
        variant: 'destructive',
      });
      return;
    }
    for (const it of items) {
      const q = Number(it.quantity);
      const u = Number(it.unitPrice);
      if (!it.description.trim() || !(q > 0) || !(u >= 0)) {
        toast({
          title: 'Item incompleto',
          description: 'Verifique descrição, quantidade e preço de todos os itens.',
          variant: 'destructive',
        });
        return;
      }
    }

    const dto: QuotationInput = {
      attachmentId: existing ? undefined : attachmentId,
      supplierCnpj: cnpjDigits,
      // Quando veio do ERP (não-externo) o backend resolve o nome pelo
      // cadastro; só mandamos override quando é fornecedor externo.
      supplierNameOverride: supplier.isExternal
        ? supplier.supplierName.trim()
        : undefined,
      paymentConditionCode: paymentCode || undefined,
      notes: notes.trim() || undefined,
      items: items.map((it) => ({
        description: it.description.trim(),
        unit: it.unit.trim() || undefined,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unitPrice),
      })),
    };

    setSubmitting(true);
    try {
      if (existing) {
        await updateMut.mutateAsync({ id: existing.id, dto });
      } else {
        await createMut.mutateAsync(dto);
      }
      toast({
        title: existing ? 'Cotação atualizada' : 'Cotação cadastrada',
        description: `${supplier.supplierName} — ${formatCurrency(total)}`,
        variant: 'success',
      });
      setSavedOk(true);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Falha ao salvar',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Fecha o dialog. No fluxo de CRIAÇÃO, se o anexo (PDF) já foi enviado
   * mas a cotação ainda não foi cadastrada (`!savedOk`), apaga o anexo
   * órfão. Garantia: nunca existe um `QUOTATION` na lista de anexos sem
   * cotação correspondente — preserva a regra de que cotação é obrigatória.
   *
   * Em modo edição (`existing != null`), o anexo já tem cotação vinculada,
   * então só fecha sem deletar nada.
   */
  async function handleClose() {
    if (submitting) return; // não fecha durante o save
    if (savedOk || existing || !attachmentId) {
      onOpenChange(false);
      return;
    }
    // Fluxo de criação fechado sem salvar: apaga o anexo órfão
    // silenciosamente (a regra de "cotação completa" continua valendo,
    // mas o aviso interrompia o solicitante de propósito quando ele
    // simplesmente queria cancelar).
    try {
      await deleteAttachment.mutateAsync(attachmentId);
    } catch {
      /* falha silenciosa — anexo eventualmente fica órfão sem cotação. */
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : handleClose())}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {existing ? 'Editar cotação' : 'Cadastrar cotação'}
          </DialogTitle>
          <DialogDescription>
            Identifique o fornecedor pelo CNPJ e informe os itens cotados.
            Se você selecionar esta cotação como vencedora na aprovação,
            estes dados substituem os originais da requisição.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Fornecedor — mesmo seletor da requisição: busca no banco
              (ERP) por nome/CNPJ e, quando não há cadastro, identifica
              por CNPJ caindo na Receita Federal. */}
          <div className="space-y-1.5">
            <Label>
              Fornecedor
              {needsSupplierName && (
                <span className="ml-1 text-destructive">*</span>
              )}
            </Label>
            <SupplierPicker
              key={`supplier-${supplierNonce}`}
              company={activeCompany?.code}
              value={supplier}
              onChange={(next) => {
                setSupplier(next);
                // Auto-sugere a condição de pagamento do fornecedor quando
                // ainda não foi escolhida manualmente.
                if (next.suggestedPaymentCondition && !paymentCode) {
                  setPaymentCode(next.suggestedPaymentCondition);
                }
              }}
            />
          </div>

          {/* Condição de pagamento */}
          <div className="space-y-1.5">
            <Label>Condição de pagamento</Label>
            <Select
              value={paymentCode || '__NONE__'}
              onValueChange={(v) => setPaymentCode(v === '__NONE__' ? '' : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__NONE__">— Não informada —</SelectItem>
                {(paymentConditions.data ?? []).map((c) => (
                  <SelectItem key={c.codigo} value={c.codigo}>
                    {c.codigo} — {c.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Itens */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Itens cotados</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={addItem}
              >
                <Plus className="size-3.5" />
                Adicionar item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_72px_96px_120px_36px] items-end gap-2 rounded-md border p-2"
                >
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Descrição
                    </Label>
                    <Input
                      value={it.description}
                      onChange={(e) =>
                        updateItem(idx, { description: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Unid.
                    </Label>
                    <Input
                      value={it.unit}
                      onChange={(e) =>
                        updateItem(idx, { unit: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Qtde
                    </Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      min={0}
                      value={it.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      Preço unit.
                    </Label>
                    <CurrencyInput
                      value={it.unitPrice === '' ? null : Number(it.unitPrice)}
                      onChange={(n) =>
                        updateItem(idx, {
                          unitPrice: n == null ? '' : String(n),
                        })
                      }
                      nullable
                    />
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeItem(idx)}
                    title="Remover item"
                    className="h-9 w-9"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t pt-2 text-sm">
              <span className="text-muted-foreground">Total da cotação:</span>
              <span className="font-semibold">{formatCurrency(total)}</span>
            </div>
          </div>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Observações <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Prazo de entrega, validade da proposta, etc."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSave} disabled={submitting}>
            {submitting ? 'Salvando…' : existing ? 'Salvar' : 'Cadastrar cotação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
