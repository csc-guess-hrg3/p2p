import { useEffect, useState } from 'react';
import { CheckCircle2, Plus, Trash2, AlertCircle } from 'lucide-react';
import {
  lookupSupplierByCnpj,
  lookupCnpjPublic,
  maskCnpj,
  useCreateQuotation,
  useUpdateQuotation,
  type PublicCnpjData,
  type Quotation,
  type QuotationInput,
} from '@/lib/quotations';
import { usePaymentConditions } from '@/lib/integration';
import { extractApiMessage } from '@/lib/api-errors';
import { useCompany } from '@/lib/company';
import { useDeleteAttachment } from '@/lib/attachments';
import type { Requisition } from '@/lib/requisitions';
import type { ErpSupplier } from '@/lib/integration';
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

  const [cnpj, setCnpj] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [erpMatch, setErpMatch] = useState<ErpSupplier | null>(null);
  const [publicMatch, setPublicMatch] = useState<PublicCnpjData | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
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
      setCnpj(maskCnpj(existing.supplierCnpj));
      setSupplierName(existing.supplierName);
      setErpMatch(
        existing.supplierErpCode
          ? ({
              codigo: existing.supplierErpCode,
              nome: existing.supplierName,
              cnpjCpf: existing.supplierCnpj,
            } as ErpSupplier)
          : null,
      );
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
      setCnpj('');
      setSupplierName('');
      setErpMatch(null);
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
  }, [open, existing, requisition]);

  // Debounced lookup do CNPJ — cascata: ERP → BrasilAPI → manual.
  useEffect(() => {
    if (!open || !activeCompany) return;
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length < 11) {
      setErpMatch(null);
      setPublicMatch(null);
      setLookingUp(false);
      return;
    }
    let cancelled = false;
    setLookingUp(true);
    const timer = setTimeout(async () => {
      const erp = await lookupSupplierByCnpj(activeCompany.code, digits);
      if (cancelled) return;
      setErpMatch(erp);
      if (erp) {
        setSupplierName(erp.nome);
        if (erp.condicaoPgto && !paymentCode) setPaymentCode(erp.condicaoPgto);
        setPublicMatch(null);
        setLookingUp(false);
        return;
      }
      // Fallback BrasilAPI (só se for CNPJ completo).
      if (digits.length === 14) {
        const pub = await lookupCnpjPublic(activeCompany.code, digits);
        if (cancelled) return;
        setPublicMatch(pub);
        if (pub) {
          setSupplierName(pub.razaoSocial);
        }
      } else {
        setPublicMatch(null);
      }
      setLookingUp(false);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj, open, activeCompany?.code]);

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

  const cnpjDigits = cnpj.replace(/\D/g, '');
  const cnpjValid = cnpjDigits.length === 14 || cnpjDigits.length === 11;
  // Só pede o nome manual se nem o ERP nem a BrasilAPI conseguiram
  // identificar o fornecedor (e o CNPJ está válido).
  const autoIdentified = !!erpMatch || !!publicMatch;
  const needsSupplierName =
    cnpjValid && !lookingUp && !autoIdentified && !supplierName.trim();

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
      supplierNameOverride: erpMatch ? undefined : supplierName.trim(),
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
        description: `${supplierName} — ${formatCurrency(total)}`,
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
          {/* Fornecedor */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ do fornecedor</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplierName">
                Nome do fornecedor
                {needsSupplierName && (
                  <span className="ml-1 text-destructive">*</span>
                )}
              </Label>
              <Input
                id="supplierName"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                disabled={autoIdentified}
                placeholder={
                  autoIdentified
                    ? ''
                    : lookingUp
                      ? 'Consultando…'
                      : 'Razão social do fornecedor'
                }
              />
            </div>
          </div>

          {/* Banner: ERP encontrado (cadastrado) */}
          {cnpjValid && erpMatch && (
            <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              <div className="text-foreground">
                <p className="font-medium text-success">
                  Fornecedor cadastrado no ERP
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-mono">{erpMatch.codigo}</span> —{' '}
                  {erpMatch.nome}
                  {erpMatch.condicaoPgto
                    ? ` · Condição padrão: ${erpMatch.condicaoPgto}`
                    : ''}
                </p>
              </div>
            </div>
          )}

          {/* Banner: ERP não tem mas BrasilAPI achou */}
          {cnpjValid && !erpMatch && publicMatch && (
            <div className="flex items-start gap-2 rounded-md border border-info/40 bg-info/5 p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-info" />
              <div className="flex-1 text-foreground">
                <p className="font-medium text-info">
                  Fornecedor externo — dados da Receita Federal
                </p>
                <p className="text-xs text-muted-foreground">
                  {publicMatch.razaoSocial}
                  {publicMatch.nomeFantasia
                    ? ` (${publicMatch.nomeFantasia})`
                    : ''}
                  {publicMatch.situacao
                    ? ` · Situação: ${publicMatch.situacao}`
                    : ''}
                </p>
                {(publicMatch.logradouro || publicMatch.cidade) && (
                  <p className="text-xs text-muted-foreground">
                    {[
                      publicMatch.logradouro,
                      publicMatch.numero,
                      publicMatch.bairro,
                      publicMatch.cidade && publicMatch.uf
                        ? `${publicMatch.cidade}/${publicMatch.uf}`
                        : publicMatch.cidade,
                      publicMatch.cep,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
                {publicMatch.cnaePrincipal && (
                  <p className="text-xs text-muted-foreground">
                    CNAE: {publicMatch.cnaePrincipal}
                  </p>
                )}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Se esta cotação for selecionada, o fornecedor será
                  cadastrado no ERP automaticamente com esses dados.
                </p>
              </div>
            </div>
          )}

          {/* Banner: nem ERP nem BrasilAPI — usuário digita manual */}
          {cnpjValid && !lookingUp && !erpMatch && !publicMatch && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="text-foreground">
                <p className="font-medium text-warning">
                  Não foi possível identificar o fornecedor pelo CNPJ
                </p>
                <p className="text-xs text-muted-foreground">
                  Não está no ERP nem foi encontrado na Receita Federal.
                  Informe o nome do fornecedor manualmente para continuar.
                </p>
              </div>
            </div>
          )}

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
