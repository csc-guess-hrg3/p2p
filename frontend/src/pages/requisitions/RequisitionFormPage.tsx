import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { Plus, Trash2 } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useBranches,
  useSuppliers,
  useAccounts,
  useBranchRateios,
  useCcRateios,
} from '@/lib/integration';
import {
  useRequisition,
  useCreateRequisition,
  useUpdateRequisition,
  type RequisitionInput,
} from '@/lib/requisitions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const itemSchema = z.object({
  itemDescription: z.string().min(1, 'Informe a descrição'),
  quantity: z.coerce.number().min(0.0001, 'Quantidade inválida'),
  unit: z.string().min(1, 'Informe a unidade'),
  estimatedPrice: z.coerce.number().min(0, 'Preço inválido'),
  accountingAccount: z.string().min(1, 'Selecione a conta'),
  branchRateioCode: z.string().min(1, 'Selecione o rateio'),
  costCenterRateioCode: z.string().min(1, 'Selecione o rateio'),
  notes: z.string().optional(),
});

const schema = z.object({
  branchErpCode: z.string().min(1, 'Selecione a filial'),
  supplierErpCode: z.string().min(1, 'Selecione o fornecedor'),
  title: z.string().min(1, 'Informe o título'),
  tipoNotaFiscal: z.enum(['NF_EXISTENTE', 'NF_FUTURA', 'SEM_NF']),
  neededBy: z.string().optional(),
  justification: z.string().min(50, 'A justificativa deve ter ao menos 50 caracteres'),
  items: z.array(itemSchema).min(1, 'Adicione ao menos um item'),
});

type FormValues = z.input<typeof schema>;

const EMPTY_ITEM = {
  itemDescription: '',
  quantity: '' as unknown as number,
  unit: '',
  estimatedPrice: '' as unknown as number,
  accountingAccount: '',
  branchRateioCode: '',
  costCenterRateioCode: '',
  notes: '',
};

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
  const suppliers = useSuppliers(code);
  const accounts = useAccounts(code);
  const branchRateios = useBranchRateios(code);
  const ccRateios = useCcRateios(code);

  const existing = useRequisition(isEdit ? id : undefined);
  const createMut = useCreateRequisition();
  const updateMut = useUpdateRequisition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      branchErpCode: '',
      supplierErpCode: '',
      title: '',
      tipoNotaFiscal: 'NF_EXISTENTE',
      neededBy: '',
      justification: '',
      items: [{ ...EMPTY_ITEM }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // Em edição: popula o formulário com a requisição carregada.
  useEffect(() => {
    const r = existing.data;
    if (!r) return;
    reset({
      branchErpCode: r.branchErpCode,
      supplierErpCode: r.supplierErpCode,
      title: r.title,
      tipoNotaFiscal: r.tipoNotaFiscal,
      neededBy: r.neededBy ? r.neededBy.slice(0, 10) : '',
      justification: r.justification ?? '',
      items: (r.items ?? []).map((it) => ({
        itemDescription: it.itemDescription,
        quantity: Number(it.quantity),
        unit: it.unit,
        estimatedPrice: Number(it.estimatedPrice),
        accountingAccount: it.accountingAccount,
        branchRateioCode: it.branchRateioCode,
        costCenterRateioCode: it.costCenterRateioCode,
        notes: it.notes ?? '',
      })),
    });
  }, [existing.data, reset]);

  const editableButNotDraft =
    isEdit && existing.data && existing.data.status !== 'DRAFT';

  async function onSubmit(values: FormValues) {
    if (!activeCompany) return;
    const parsed = schema.parse(values);
    const dto: RequisitionInput = {
      companyId: activeCompany.id,
      branchErpCode: parsed.branchErpCode,
      supplierErpCode: parsed.supplierErpCode,
      title: parsed.title,
      justification: parsed.justification,
      tipoNotaFiscal: parsed.tipoNotaFiscal,
      neededBy: parsed.neededBy || undefined,
      items: parsed.items.map((it) => ({
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        unit: it.unit,
        estimatedPrice: it.estimatedPrice,
        accountingAccount: it.accountingAccount,
        branchRateioCode: it.branchRateioCode,
        costCenterRateioCode: it.costCenterRateioCode,
        notes: it.notes || undefined,
      })),
    };
    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: id!, dto });
        navigate(`/requisicoes/${id}`);
      } else {
        const created = await createMut.mutateAsync(dto);
        navigate(`/requisicoes/${created.id}`);
      }
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

  const rateioLabel = (codigo: string, descricao: string) =>
    `${codigo} — ${descricao}`;

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
            <Controller
              control={control}
              name="supplierErpCode"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {(suppliers.data ?? []).map((s) => (
                      <SelectItem key={s.codigo} value={s.codigo}>
                        {s.codigo} — {s.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError msg={errors.supplierErpCode?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" {...register('title')} />
            <FieldError msg={errors.title?.message} />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
              <Label htmlFor="neededBy">Necessária em</Label>
              <Input id="neededBy" type="date" {...register('neededBy')} />
            </div>
          </div>

          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="justification">
              Justificativa{' '}
              <span className="text-muted-foreground">(mín. 50 caracteres)</span>
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

      {/* Itens */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Itens</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append({ ...EMPTY_ITEM })}
          >
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {errors.items?.message && (
            <FieldError msg={errors.items.message} />
          )}
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="space-y-3 rounded-md border p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Item {index + 1}</span>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-4 space-y-1.5">
                  <Label>Descrição</Label>
                  <Input {...register(`items.${index}.itemDescription`)} />
                  <FieldError
                    msg={errors.items?.[index]?.itemDescription?.message}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.quantity`)}
                  />
                  <FieldError
                    msg={errors.items?.[index]?.quantity?.message}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Unidade</Label>
                  <Input
                    placeholder="UN, CX…"
                    {...register(`items.${index}.unit`)}
                  />
                  <FieldError msg={errors.items?.[index]?.unit?.message} />
                </div>
                <div className="space-y-1.5">
                  <Label>Preço estimado</Label>
                  <Input
                    type="number"
                    step="any"
                    {...register(`items.${index}.estimatedPrice`)}
                  />
                  <FieldError
                    msg={errors.items?.[index]?.estimatedPrice?.message}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Conta contábil</Label>
                  <Controller
                    control={control}
                    name={`items.${index}.accountingAccount`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Conta" />
                        </SelectTrigger>
                        <SelectContent>
                          {(accounts.data ?? []).map((a) => (
                            <SelectItem key={a.codigo} value={a.codigo}>
                              {a.codigo} — {a.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError
                    msg={errors.items?.[index]?.accountingAccount?.message}
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label>Rateio de filial</Label>
                  <Controller
                    control={control}
                    name={`items.${index}.branchRateioCode`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Rateio de filial" />
                        </SelectTrigger>
                        <SelectContent>
                          {(branchRateios.data ?? []).map((r) => (
                            <SelectItem key={r.codigo} value={r.codigo}>
                              {rateioLabel(r.codigo, r.descricao)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError
                    msg={errors.items?.[index]?.branchRateioCode?.message}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Rateio de centro de custo</Label>
                  <Controller
                    control={control}
                    name={`items.${index}.costCenterRateioCode`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Rateio de CC" />
                        </SelectTrigger>
                        <SelectContent>
                          {(ccRateios.data ?? []).map((r) => (
                            <SelectItem key={r.codigo} value={r.codigo}>
                              {rateioLabel(r.codigo, r.descricao)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError
                    msg={errors.items?.[index]?.costCenterRateioCode?.message}
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </form>
  );
}
