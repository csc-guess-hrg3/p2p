import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useBranches, usePaymentConditions } from '@/lib/integration';
import {
  useRequisition,
  useCreateRequisition,
  useUpdateRequisition,
  type RequisitionInput,
  type RequisitionItemForm,
} from '@/lib/requisitions';
import { useCreateFiscalItemRequest } from '@/lib/fiscal';
import { formatCurrency, formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ItemDialog } from './ItemDialog';
import { SupplierCombobox } from './SupplierCombobox';

const schema = z
  .object({
    branchErpCode: z.string().min(1, 'Selecione a filial'),
    supplierErpCode: z.string().min(1, 'Selecione o fornecedor'),
    title: z.string().min(1, 'Informe o título'),
    tipoNotaFiscal: z.enum(['NF_EXISTENTE', 'NF_FUTURA', 'SEM_NF']),
    paymentConditionCode: z
      .string()
      .min(1, 'Selecione a condição de pagamento'),
    recurring: z.boolean(),
    recurrenceMonths: z.string().optional(),
    contractRef: z.string().optional(),
    justification: z
      .string()
      .min(15, 'A justificativa deve ter ao menos 15 caracteres'),
  })
  .refine(
    (d) => !d.recurring || Number(d.recurrenceMonths) >= 1,
    {
      message: 'Informe os meses de recorrência',
      path: ['recurrenceMonths'],
    },
  );
type FormValues = z.infer<typeof schema>;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-destructive">{msg}</p>;
}

export function RequisitionFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { activeCompany } = useCompany();
  const code = activeCompany?.code;

  const branches = useBranches(code);
  const paymentConditions = usePaymentConditions(code);
  const existing = useRequisition(isEdit ? id : undefined);
  const createMut = useCreateRequisition();
  const updateMut = useUpdateRequisition();
  const fiscalMut = useCreateFiscalItemRequest();

  const [items, setItems] = useState<RequisitionItemForm[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dialogInitial, setDialogInitial] =
    useState<RequisitionItemForm | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      branchErpCode: '',
      supplierErpCode: '',
      title: '',
      tipoNotaFiscal: 'NF_EXISTENTE',
      paymentConditionCode: '',
      recurring: false,
      recurrenceMonths: '',
      contractRef: '',
      justification: '',
    },
  });

  const supplierErpCode = watch('supplierErpCode');
  const recurring = watch('recurring');

  // Edição: popula o formulário.
  useEffect(() => {
    const r = existing.data;
    if (!r) return;
    reset({
      branchErpCode: r.branchErpCode,
      supplierErpCode: r.supplierErpCode,
      title: r.title,
      tipoNotaFiscal: r.tipoNotaFiscal,
      paymentConditionCode: r.paymentConditionCode ?? '',
      recurring: r.recurring,
      recurrenceMonths: r.recurrenceMonths
        ? String(r.recurrenceMonths)
        : '',
      contractRef: r.contractRef ?? '',
      justification: r.justification ?? '',
    });
    setSupplierName(r.supplierName);
    setItems(
      (r.items ?? []).map((it) => ({
        fiscalMode: 'NONE' as const,
        itemErpCode: it.itemErpCode,
        itemDescription: it.itemDescription,
        unit: it.unit,
        quantity: Number(it.quantity),
        estimatedPrice: Number(it.estimatedPrice),
        accountingAccount: it.accountingAccount,
        branchRateioCode: it.branchRateioCode,
        costCenterRateioCode: it.costCenterRateioCode,
      })),
    );
  }, [existing.data, reset]);

  const editableButNotDraft =
    isEdit && existing.data && existing.data.status !== 'DRAFT';

  function openAdd() {
    setEditingIndex(null);
    setDialogInitial(null);
    setDialogOpen(true);
  }
  function openEdit(index: number) {
    setEditingIndex(index);
    setDialogInitial(items[index]);
    setDialogOpen(true);
  }
  function openDuplicate(index: number) {
    setEditingIndex(null);
    setDialogInitial({ ...items[index] });
    setDialogOpen(true);
  }
  function handleItemConfirm(item: RequisitionItemForm) {
    setItemsError(null);
    setItems((prev) => {
      if (editingIndex === null) return [...prev, item];
      const next = [...prev];
      next[editingIndex] = item;
      return next;
    });
  }

  async function onSubmit(values: FormValues) {
    if (!activeCompany) return;
    if (items.length === 0) {
      setItemsError('Adicione ao menos um item.');
      return;
    }
    const dto: RequisitionInput = {
      companyId: activeCompany.id,
      branchErpCode: values.branchErpCode,
      supplierErpCode: values.supplierErpCode,
      title: values.title,
      justification: values.justification,
      tipoNotaFiscal: values.tipoNotaFiscal,
      paymentConditionCode: values.paymentConditionCode,
      recurring: values.recurring,
      recurrenceMonths: values.recurring
        ? Number(values.recurrenceMonths)
        : undefined,
      contractRef: values.contractRef || undefined,
      items: items.map((it) => ({
        itemErpCode: it.itemErpCode ?? undefined,
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        unit: it.unit,
        estimatedPrice: it.estimatedPrice,
        accountingAccount: it.accountingAccount,
        branchRateioCode: it.branchRateioCode,
        costCenterRateioCode: it.costCenterRateioCode,
        notes: it.notes,
      })),
    };
    try {
      const saved = isEdit
        ? await updateMut.mutateAsync({ id: id!, dto })
        : await createMut.mutateAsync(dto);

      // Abre pendências fiscais de vínculo para itens não vinculados.
      const pending = items.filter(
        (it) => it.fiscalMode === 'LINK' && it.itemErpCode,
      );
      const results = await Promise.allSettled(
        pending.map((it) =>
          fiscalMut.mutateAsync({
            companyId: activeCompany.id,
            supplierErpCode: values.supplierErpCode,
            itemErpCode: it.itemErpCode as string,
            itemDescription: it.itemDescription,
            unit: it.unit,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        alert(
          `Requisição salva, mas ${failed} pendência(s) fiscal(is) não pôde(puderam) ser aberta(s).`,
        );
      }
      navigate(`/requisicoes/${saved.id}`);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      alert(
        Array.isArray(msg)
          ? msg.join('\n')
          : msg || 'Não foi possível salvar a requisição.',
      );
    }
  }

  if (editableButNotDraft) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Edição indisponível</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>Apenas requisições em rascunho podem ser editadas.</p>
          <Button onClick={() => navigate(`/requisicoes/${id}`)}>
            Ver requisição
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          {isEdit ? 'Editar requisição' : 'Nova requisição'}
        </h2>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/requisicoes')}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={createMut.isPending || updateMut.isPending}
          >
            {createMut.isPending || updateMut.isPending
              ? 'Salvando…'
              : 'Salvar rascunho'}
          </Button>
        </div>
      </div>

      {/* Cabeçalho */}
      <Card>
        <CardHeader>
          <CardTitle>Dados gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Controller
              control={control}
              name="branchErpCode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a filial" />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches.data ?? []).map((b) => (
                      <SelectItem key={b.codigo} value={b.codigo}>
                        {b.codigo} — {b.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError msg={errors.branchErpCode?.message} />
          </div>

          <div className="space-y-1.5">
            <Label>Fornecedor</Label>
            <SupplierCombobox
              company={code}
              value={supplierErpCode}
              selectedName={supplierName}
              onChange={(codigo, supplier) => {
                setValue('supplierErpCode', codigo, { shouldValidate: true });
                setSupplierName(supplier.nome);
                // Default da condição de pagamento herdado do fornecedor.
                if (supplier.condicaoPgto) {
                  setValue('paymentConditionCode', supplier.condicaoPgto, {
                    shouldValidate: true,
                  });
                }
              }}
            />
            <FieldError msg={errors.supplierErpCode?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" {...register('title')} />
            <FieldError msg={errors.title?.message} />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de nota fiscal</Label>
            <Controller
              control={control}
              name="tipoNotaFiscal"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NF_EXISTENTE">NF já existe</SelectItem>
                    <SelectItem value="NF_FUTURA">
                      NF futura (adiantamento)
                    </SelectItem>
                    <SelectItem value="SEM_NF">Sem NF</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Condição de pagamento</Label>
            <Controller
              control={control}
              name="paymentConditionCode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a condição" />
                  </SelectTrigger>
                  <SelectContent>
                    {(paymentConditions.data ?? []).map((c) => (
                      <SelectItem key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError msg={errors.paymentConditionCode?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contractRef">
              Contrato vinculado{' '}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="contractRef"
              placeholder="Nº ou referência do contrato"
              {...register('contractRef')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Recorrência</Label>
            <div className="flex h-9 items-center gap-3">
              <Controller
                control={control}
                name="recurring"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <span className="text-sm text-muted-foreground">
                Requisição recorrente
              </span>
              {recurring && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    className="w-20"
                    placeholder="meses"
                    {...register('recurrenceMonths')}
                  />
                  <span className="text-sm text-muted-foreground">
                    meses
                  </span>
                </div>
              )}
            </div>
            <FieldError msg={errors.recurrenceMonths?.message} />
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="justification">
              Justificativa{' '}
              <span className="text-muted-foreground">
                (mín. 15 caracteres)
              </span>
            </Label>
            <Textarea
              id="justification"
              rows={3}
              {...register('justification')}
            />
            <FieldError msg={errors.justification?.message} />
          </div>
        </CardContent>
      </Card>

      {/* Itens — lista fechada */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Itens</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!supplierErpCode}
            onClick={openAdd}
          >
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!supplierErpCode && (
            <p className="text-sm text-muted-foreground">
              Selecione o fornecedor para adicionar itens.
            </p>
          )}
          {supplierErpCode && items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum item adicionado.
            </p>
          )}
          {items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qtde</TableHead>
                  <TableHead>Un.</TableHead>
                  <TableHead className="text-right">Preço</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{it.itemDescription}</span>
                        {it.fiscalMode === 'LINK' && (
                          <Badge variant="warning">vínculo fiscal</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {it.itemErpCode ?? 'sem código'} · conta{' '}
                        {it.accountingAccount}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatNumber(it.quantity)}
                    </TableCell>
                    <TableCell>{it.unit}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(it.estimatedPrice)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(it.quantity * it.estimatedPrice)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(index)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openDuplicate(index)}
                        >
                          <Copy className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setItems((prev) =>
                              prev.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <FieldError msg={itemsError ?? undefined} />
        </CardContent>
      </Card>

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={code}
        supplierCode={supplierErpCode}
        initial={dialogInitial}
        onConfirm={handleItemConfirm}
      />
    </form>
  );
}
