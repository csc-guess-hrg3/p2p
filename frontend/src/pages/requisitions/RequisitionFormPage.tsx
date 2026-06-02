import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { extractApiMessage } from '@/lib/api-errors';
import { Copy, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useBranches, useComprasTipos, usePaymentConditions } from '@/lib/integration';
import {
  useRequisition,
  useCreateRequisition,
  useUpdateRequisition,
  useSubmitRequisition,
  useClearQuotationWaiver,
  type RequisitionInput,
  type RequisitionItemForm,
} from '@/lib/requisitions';
import { useCreateFiscalItemRequest } from '@/lib/fiscal';
import { formatCurrency, formatNumber } from '@/lib/format';
import { QuotationsWarning } from '@/components/QuotationsWarning';
import { QuotationWaiverDialog } from './QuotationWaiverDialog';
import { useAttachments } from '@/lib/attachments';
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ItemDialog } from './ItemDialog';
import { SupplierPicker, type SupplierPickerValue } from './SupplierPicker';
import { InlineQuotationsAndAttachments } from './InlineQuotationsAndAttachments';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { EditReasonDialog } from '@/components/EditReasonDialog';
import { useToast } from '@/components/ui/use-toast';

const schema = z
  .object({
    branchErpCode: z.string().min(1, 'Selecione a filial'),
    // O fornecedor é gerenciado fora do schema pelo `SupplierPicker`
    // (estado `supplier`). O campo aqui só guarda o erpCode pra compat;
    // a validação real (CNPJ + nome) acontece em `onSubmit`.
    supplierErpCode: z.string().optional(),
    title: z.string().min(1, 'Informe o título'),
    comAdiantamento: z.boolean(),
    paymentConditionCode: z
      .string()
      .min(1, 'Selecione a condição de pagamento'),
    recurring: z.boolean(),
    recurrenceMonths: z.string().optional(),
    contractRef: z.string().optional(),
    // tipoCompra (opcional). Quando o solicitante não escolhe, o backend
    // cai no default da CompanyErpConfig. Mostrar aqui permite que o
    // usuário sinalize "esta compra é de manutenção" sem depender do
    // fiscal renomear depois. O fiscal ainda pode override no
    // FiscalClassifyDialog antes da conversão em PC.
    tipoCompra: z.string().optional(),
    // RN-REQ-02 — cotações são contadas automaticamente a partir dos anexos
    // (kind=QUOTATION) lá no AttachmentsSection da tela de detalhe. Aqui
    // o campo deixou de ser editável; mantido no schema só pra hidratar
    // o default do create (zero), mas a UI não mostra mais o input.
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
  const comprasTipos = useComprasTipos(code);
  const existing = useRequisition(isEdit ? id : undefined);
  const createMut = useCreateRequisition();
  const updateMut = useUpdateRequisition();
  const clearWaiverMut = useClearQuotationWaiver(id);
  const submitMut = useSubmitRequisition();
  const fiscalMut = useCreateFiscalItemRequest();
  // Quando o usuário clica em "Salvar e enviar para aprovação", marcamos
  // esse flag pra que o `persist` chame o submit logo após criar/atualizar
  // — assim o solicitante não precisa sair do form pra submeter.
  const [submitAfterSave, setSubmitAfterSave] = useState(false);
  // Em requisição nova (sem id ainda), o botão "Solicitar dispensa" precisa
  // de id pro POST funcionar — então primeiro salvamos o rascunho e só
  // depois abrimos o diálogo. Esse flag conta pro `persist()` que ele tem
  // que abrir o diálogo de dispensa logo após o save.
  const [openWaiverAfterSave, setOpenWaiverAfterSave] = useState(false);

  const [items, setItems] = useState<RequisitionItemForm[]>([]);
  const [itemsError, setItemsError] = useState<string | null>(null);
  // Dispensa de cotação (RN-REQ-02) — só faz sentido em modo edição
  // (precisa de requisitionId pra salvar). No detail também há esse
  // botão — replicamos no form pra fluxo único.
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [supplier, setSupplier] = useState<SupplierPickerValue>({
    supplierErpCode: '',
    supplierCnpj: '',
    supplierName: '',
    isExternal: false,
    suggestedPaymentCondition: null,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [dialogInitial, setDialogInitial] =
    useState<RequisitionItemForm | null>(null);
  // Em edição, o backend exige motivo (mín. 5 chars). Guardamos o DTO
  // pronto e abrimos um diálogo dedicado pra coletar o motivo.
  const [pendingDto, setPendingDto] = useState<RequisitionInput | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  // Bumpado ao final do reset de edição. Usado como `key` nas selects
  // ligadas a listas do ERP (Filial, Condição de pagamento, Tipo de compra)
  // pra forçar um remount LIMPO depois que o valor já está no form e as
  // options já chegaram. Sem isso, o Radix Select às vezes não pinta o
  // valor no trigger quando value + SelectItem aparecem no mesmo commit
  // — era o bug "some a filial / condição ao editar uma req em revisão".
  const [resetNonce, setResetNonce] = useState(0);
  const { toast } = useToast();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      branchErpCode: '',
      supplierErpCode: '',
      title: '',
      comAdiantamento: false,
      paymentConditionCode: '',
      recurring: false,
      recurrenceMonths: '',
      contractRef: '',
      justification: '',
      tipoCompra: '',
    },
  });

  const supplierErpCode = watch('supplierErpCode');
  // Fornecedor pronto pra adicionar itens: ou está cadastrado no ERP
  // (erpCode preenchido), ou é externo válido (CNPJ + nome via Receita).
  const hasSupplier =
    !!supplier.supplierErpCode ||
    (supplier.isExternal && !!supplier.supplierName.trim());
  const recurring = watch('recurring');
  // Contagem real de cotações: anexos com kind=QUOTATION. Quando estamos
  // criando uma requisição nova (sem id ainda), a contagem é zero por
  // definição — anexos só podem ser carregados depois de salvar o
  // rascunho (a tela de detalhe expõe o upload).
  const { data: attachments = [] } = useAttachments(
    'requisition',
    isEdit ? id : undefined,
  );
  const realQuotationsCount = attachments.filter(
    (a) => a.kind === 'QUOTATION',
  ).length;
  // Total recalculado a cada mudança em `items` — usado pra disparar o aviso
  // de cotações ANTES do submit (RN-REQ-02) e mostrar o subtotal no rodapé.
  const itemsTotal = items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.estimatedPrice) || 0),
    0,
  );

  // Edição: popula o formulário.
  //
  // Importante: além de existing.data, depende de branches.data e
  // paymentConditions.data — sem isso, o Select pode renderizar o
  // valor mas sem o SelectItem correspondente (porque as options ainda
  // não chegaram), e o usuário vê o campo APARENTEMENTE vazio. Reset
  // novamente quando essas listas chegarem garante que o Select casa
  // o value com a option.
  useEffect(() => {
    const r = existing.data;
    if (!r) return;
    // Espera as listas das selects carregarem antes de resetar
    // — evita o cenário "Filial sumiu" que confundia o usuário.
    if (!branches.data || !paymentConditions.data) return;
    reset({
      branchErpCode: r.branchErpCode,
      supplierErpCode: r.supplierErpCode,
      title: r.title,
      comAdiantamento: r.tipoNotaFiscal === 'NF_FUTURA',
      paymentConditionCode: r.paymentConditionCode ?? '',
      recurring: r.recurring,
      recurrenceMonths: r.recurrenceMonths
        ? String(r.recurrenceMonths)
        : '',
      contractRef: r.contractRef ?? '',
      justification: r.justification ?? '',
      tipoCompra: r.tipoCompra ?? '',
    });
    setSupplier({
      supplierErpCode: r.supplierErpCode ?? '',
      supplierCnpj: r.supplierCnpj ?? '',
      supplierName: r.supplierName,
      isExternal: !r.supplierErpCode,
      suggestedPaymentCondition: r.paymentConditionCode ?? null,
    });
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
    // Remonta as selects de ERP já com o value setado e as options presentes
    // (ver comentário em `resetNonce`). Roda DEPOIS do reset acima.
    setResetNonce((n) => n + 1);
  }, [existing.data, reset, branches.data, paymentConditions.data]);

  // Edição liberada em DRAFT (rascunho) e REVISION (devolvida pra ajuste).
  // A tela de detalhe usa o mesmo critério (canEdit = isDraft || isRevision)
  // — manter alinhado evita o cenário em que o detalhe oferece "Editar" mas
  // o form responde "Edição indisponível". Os demais status (submetida,
  // aprovada, convertida, rejeitada) seguem bloqueados.
  const notEditableStatus =
    isEdit &&
    existing.data &&
    existing.data.status !== 'DRAFT' &&
    existing.data.status !== 'REVISION';

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

  /**
   * Auto-save do rascunho. Chamado quando o solicitante clica em
   * "Adicionar anexo" no modo criação — fazemos o create silenciosamente
   * pra ter um `requisitionId` antes do upload. A URL passa pra
   * `/editar/:id` sem reload e a UI continua exatamente onde estava.
   *
   * Retorna o `id` novo (pro AttachmentsSection grudar o anexo nele) ou
   * `null` se a validação do form falhou — nesse caso, os erros aparecem
   * nos campos como sempre.
   */
  async function ensureDraftSaved(): Promise<string | null> {
    if (isEdit && id) return id; // já tem rascunho salvo
    if (!activeCompany) return null;
    // Valida os campos do react-hook-form.
    const valid = await trigger();
    if (!valid) {
      toast({
        title: 'Complete os campos obrigatórios',
        description:
          'Preencha filial, fornecedor, título e justificativa antes de anexar o primeiro arquivo.',
        variant: 'destructive',
      });
      return null;
    }
    // Valida fornecedor (gerenciado fora do RHF).
    if (
      !supplier.supplierErpCode &&
      (!supplier.supplierCnpj || !supplier.supplierName.trim())
    ) {
      toast({
        title: 'Fornecedor obrigatório',
        description:
          'Selecione um fornecedor cadastrado ou informe o CNPJ + nome.',
        variant: 'destructive',
      });
      return null;
    }
    if (items.length === 0) {
      setItemsError('Adicione ao menos um item antes de anexar.');
      return null;
    }
    const values = getValues();
    const dto: RequisitionInput = {
      companyId: activeCompany.id,
      branchErpCode: values.branchErpCode,
      supplierErpCode: supplier.supplierErpCode || undefined,
      supplierCnpj: supplier.isExternal ? supplier.supplierCnpj : undefined,
      supplierNameOverride: supplier.isExternal
        ? supplier.supplierName
        : undefined,
      title: values.title,
      justification: values.justification,
      tipoNotaFiscal: values.comAdiantamento ? 'NF_FUTURA' : 'NF_EXISTENTE',
      paymentConditionCode: values.paymentConditionCode,
      recurring: values.recurring,
      recurrenceMonths: values.recurring
        ? Number(values.recurrenceMonths)
        : undefined,
      contractRef: values.contractRef || undefined,
      tipoCompra: values.tipoCompra || undefined,
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
      const saved = await createMut.mutateAsync(dto);
      // Atualiza a URL pra modo edição sem recarregar (`replace` evita
      // poluir o histórico).
      navigate(`/requisicoes/${saved.id}/editar`, { replace: true });
      toast({
        title: 'Rascunho salvo',
        description: 'A requisição foi salva automaticamente.',
        variant: 'success',
      });
      return saved.id;
    } catch (err) {
      toast({
        title: 'Não foi possível salvar o rascunho',
        description: extractApiMessage(err),
        variant: 'destructive',
      });
      return null;
    }
  }

  async function onSubmit(values: FormValues) {
    if (!activeCompany) return;
    if (items.length === 0) {
      setItemsError('Adicione ao menos um item.');
      return;
    }
    // Validação de fornecedor — ou ERP code ou (CNPJ + nome).
    if (
      !supplier.supplierErpCode &&
      (!supplier.supplierCnpj || !supplier.supplierName.trim())
    ) {
      toast({
        title: 'Fornecedor obrigatório',
        description:
          'Selecione um fornecedor cadastrado no ERP ou informe o CNPJ + nome do fornecedor externo.',
        variant: 'destructive',
      });
      return;
    }
    const dto: RequisitionInput = {
      companyId: activeCompany.id,
      branchErpCode: values.branchErpCode,
      supplierErpCode: supplier.supplierErpCode || undefined,
      supplierCnpj: supplier.isExternal ? supplier.supplierCnpj : undefined,
      supplierNameOverride: supplier.isExternal ? supplier.supplierName : undefined,
      title: values.title,
      justification: values.justification,
      tipoNotaFiscal: values.comAdiantamento ? 'NF_FUTURA' : 'NF_EXISTENTE',
      paymentConditionCode: values.paymentConditionCode,
      recurring: values.recurring,
      recurrenceMonths: values.recurring
        ? Number(values.recurrenceMonths)
        : undefined,
      contractRef: values.contractRef || undefined,
      tipoCompra: values.tipoCompra || undefined,
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
    // Diálogo de "Motivo da edição" só faz sentido quando a requisição
    // JÁ foi submetida pra aprovação e voltou pra revisão — aí mexer no
    // conteúdo deixa rastro pro aprovador. Em DRAFT (rascunho), o usuário
    // está só montando a requisição, não tem o que justificar.
    const needsEditReason = isEdit && existing.data?.status === 'REVISION';
    if (needsEditReason) {
      setPendingDto(dto);
      setReasonOpen(true);
      return;
    }
    await persist(dto, values.supplierErpCode);
  }

  /** Persiste a requisição (cria ou atualiza) — chamada em onSubmit/dialog. */
  async function persist(dto: RequisitionInput, supplierErpCode: string) {
    if (!activeCompany) return;
    try {
      // Em UPDATE, o backend rejeita campos não-whitelisted (companyId
      // e tipoNotaFiscal não estão em UpdateRequisitionDto — são imutáveis
      // após criação). Tira eles do payload pra não estourar 400
      // "property X should not exist" pro usuário.
      const { companyId: _companyId, tipoNotaFiscal: _tipoNF, ...updatable } =
        dto;
      const saved = isEdit
        ? await updateMut.mutateAsync({ id: id!, dto: updatable })
        : await createMut.mutateAsync(dto);

      const pending = items.filter(
        (it) => it.fiscalMode === 'LINK' && it.itemErpCode,
      );
      const results = await Promise.allSettled(
        pending.map((it) =>
          fiscalMut.mutateAsync({
            companyId: activeCompany.id,
            supplierErpCode,
            itemErpCode: it.itemErpCode as string,
            itemDescription: it.itemDescription,
            unit: it.unit,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        toast({
          title: 'Pendências fiscais',
          description: `Requisição salva, mas ${failed} pendência(s) fiscal(is) não pôde(puderam) ser aberta(s).`,
          variant: 'destructive',
        });
      }
      // Se o usuário pediu "Solicitar dispensa" numa req nova, abrimos o
      // diálogo logo após salvar (agora já temos `id` no `saved.id`).
      if (openWaiverAfterSave) {
        setOpenWaiverAfterSave(false);
        navigate(`/requisicoes/${saved.id}/editar`, { replace: !isEdit });
        // Pequeno timeout pra dar tempo da rota mudar antes do dialog abrir.
        setTimeout(() => setWaiverOpen(true), 50);
        return;
      }
      // Se o usuário clicou em "Salvar e enviar para aprovação", submete
      // logo após salvar e vai pro detalhe. Vale tanto pra create quanto
      // pra update — o solicitante não precisa sair do form pra submeter.
      if (submitAfterSave) {
        try {
          await submitMut.mutateAsync(saved.id);
          toast({
            title: 'Requisição enviada para aprovação',
            variant: 'success',
          });
          navigate(`/requisicoes/${saved.id}`, { replace: !isEdit });
          return;
        } catch (err) {
          toast({
            title: 'Rascunho salvo, mas falha ao enviar',
            description: extractApiMessage(err),
            variant: 'destructive',
          });
          // Cai no fluxo padrão (continua no form em modo edição).
        } finally {
          setSubmitAfterSave(false);
        }
      }
      // Depois do create, permanece no FORM em modo edição (mesma página,
      // URL muda pra /editar/:id). Anexos e cotações ficam disponíveis
      // logo abaixo sem o usuário ter que ir pro detalhe e voltar.
      // Em update, mantém o comportamento (vai pro detalhe).
      navigate(
        isEdit ? `/requisicoes/${saved.id}` : `/requisicoes/${saved.id}/editar`,
        { replace: !isEdit },
      );
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string | string[] })?.message
        : null;
      toast({
        title: 'Falha ao salvar',
        description: Array.isArray(msg)
          ? msg.join('\n')
          : msg || 'Não foi possível salvar a requisição.',
        variant: 'destructive',
      });
      throw err;
    }
  }

  if (notEditableStatus) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Edição indisponível</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Apenas requisições em rascunho ou devolvidas para revisão podem
            ser editadas.
          </p>
          <Button onClick={() => navigate(`/requisicoes/${id}`)}>
            Ver requisição
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pb-10">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-xl font-semibold">
          {isEdit ? 'Editar requisição' : 'Nova requisição'}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/requisicoes')}
          >
            Cancelar
          </Button>
          {(() => {
            // Estado atual decide o label dos dois botões — antes ficava
            // "Salvar e reenviar" mesmo numa requisição que NEM tinha sido
            // submetida ainda, e isso confundia muito.
            const status = existing.data?.status;
            const isRevision = status === 'REVISION';
            const saveLabel = 'Salvar rascunho';
            const submitLabel = isRevision
              ? 'Salvar e reenviar para aprovação'
              : 'Salvar e enviar para aprovação';
            const busy =
              createMut.isPending || updateMut.isPending || submitMut.isPending;
            return (
              <>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSubmitAfterSave(false)}
                >
                  {createMut.isPending || updateMut.isPending
                    ? 'Salvando…'
                    : saveLabel}
                </Button>
                <Button
                  type="submit"
                  disabled={busy}
                  onClick={() => setSubmitAfterSave(true)}
                  title="Salva a requisição e já envia para aprovação — sem precisar abrir o detalhe."
                >
                  {submitMut.isPending ? 'Enviando…' : submitLabel}
                </Button>
              </>
            );
          })()}
        </div>
      </div>

      {/* Cabeçalho */}
      <Card>
        <CardHeader>
          <CardTitle>Dados gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Controller
              control={control}
              name="branchErpCode"
              render={({ field }) => (
                <Select
                  key={`branch-${resetNonce}`}
                  value={field.value}
                  onValueChange={field.onChange}
                >
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
            <SupplierPicker
              key={`supplier-${resetNonce}`}
              company={code}
              value={supplier}
              onChange={(next) => {
                const cleared =
                  !next.supplierErpCode &&
                  !next.supplierCnpj &&
                  !next.supplierName;
                const changed =
                  next.supplierErpCode !== supplier.supplierErpCode ||
                  next.supplierCnpj !== supplier.supplierCnpj;
                setSupplier(next);
                setValue('supplierErpCode', next.supplierErpCode, {
                  shouldValidate: true,
                });
                if (cleared) {
                  // Limpou o fornecedor → zera tudo que dependia dele:
                  // condição de pagamento sugerida + itens (catálogo do
                  // fornecedor anterior não vale pro próximo).
                  setValue('paymentConditionCode', '', {
                    shouldValidate: true,
                  });
                  setItems([]);
                } else if (changed) {
                  // Trocou fornecedor → itens do anterior não fazem mais
                  // sentido (codigo ERP, preço estimado etc. eram dele).
                  setItems([]);
                  if (next.suggestedPaymentCondition) {
                    setValue(
                      'paymentConditionCode',
                      next.suggestedPaymentCondition,
                      { shouldValidate: true },
                    );
                  }
                }
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" {...register('title')} />
            <FieldError msg={errors.title?.message} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label>Com adiantamento</Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground"
                    tabIndex={-1}
                  >
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Marque quando a Nota Fiscal ainda não foi emitida. O
                  pagamento é antecipado e o sistema gera uma Solicitação de
                  Verba junto do Pedido de Compra.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex h-9 items-center gap-3">
              <Controller
                control={control}
                name="comAdiantamento"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <span className="text-sm text-muted-foreground">
                Nota Fiscal ainda não emitida (pagamento antecipado)
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Condição de pagamento</Label>
            <Controller
              control={control}
              name="paymentConditionCode"
              render={({ field }) => (
                <Select
                  key={`payment-${resetNonce}`}
                  value={field.value}
                  onValueChange={field.onChange}
                >
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

          {/* Tipo de compra do Linx — vem de v_p2p_compras_tipos da empresa
              ativa. Opcional pro solicitante (loose end 6.1 do SPEC):
              quando não escolhe, o backend cai no default da empresa OU o
              fiscal sobrescreve no FiscalClassifyDialog antes de converter. */}
          <div className="space-y-1.5">
            <Label>
              Tipo de compra{' '}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Controller
              control={control}
              name="tipoCompra"
              render={({ field }) => (
                <Select
                  key={`tipo-${resetNonce}`}
                  value={field.value || ''}
                  onValueChange={(v) => field.onChange(v === '__none__' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Padrão da empresa (definido pelo fiscal)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      Padrão (definido pelo fiscal)
                    </SelectItem>
                    {(comprasTipos.data ?? []).map((t) => (
                      <SelectItem key={t.tipoCompra} value={t.tipoCompra}>
                        {t.tipoCompra}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-muted-foreground">
              Como esta compra deve ser classificada no ERP. Se não souber,
              deixe em branco — o fiscal decide na revisão.
            </p>
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

          {/*
            Cotações deixaram de ser um campo digitado — agora são contadas
            automaticamente a partir dos anexos do tipo "Cotação" enviados
            na tela de detalhe da requisição (após salvar). O banner abaixo
            da lista de itens já mostra quantas ainda faltam para atender
            à RN-REQ-02.
          */}

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
                    inputMode="numeric"
                    min={1}
                    step={1}
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
            disabled={!hasSupplier}
            onClick={openAdd}
          >
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!hasSupplier && (
            <p className="text-sm text-muted-foreground">
              Selecione o fornecedor para adicionar itens.
            </p>
          )}
          {hasSupplier && items.length === 0 && (
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
                          <Badge variant="warning">pendência fiscal</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Conta {it.accountingAccount}
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

          {items.length > 0 && (
            <div className="flex items-center justify-end gap-2 border-t pt-2 text-sm">
              <span className="text-muted-foreground">Total da requisição:</span>
              <span className="font-semibold">{formatCurrency(itemsTotal)}</span>
            </div>
          )}

          {/*
            Aviso live de cotações (RN-REQ-02). Aparece assim que `itemsTotal`
            cruza o threshold parametrizado pelo Admin — o usuário corrige
            ANTES de tentar submeter e levar um BadRequest.
          */}
          {items.length > 0 && activeCompany && (
            <QuotationsWarning
              companyId={activeCompany.id}
              totalAmount={itemsTotal}
              quotationsCount={realQuotationsCount}
              waiverReason={existing.data?.quotationWaiverReason ?? null}
              waiverNote={existing.data?.quotationWaiverNote ?? null}
              showWhenOk
              // Botão de dispensa SEMPRE disponível quando a regra está
              // violada — mesmo sem id ainda. No caso de req nova, salvamos
              // o rascunho automaticamente e abrimos o diálogo em seguida
              // (flag `openWaiverAfterSave` no persist).
              onRequestWaiver={() => {
                if (isEdit && id) {
                  setWaiverOpen(true);
                } else {
                  // Marca pra abrir o diálogo logo após o save e dispara o
                  // submit do form (cria o rascunho).
                  setOpenWaiverAfterSave(true);
                  handleSubmit(onSubmit)();
                }
              }}
              onClearWaiver={
                isEdit && id && existing.data?.quotationWaiverReason
                  ? async () => {
                      await clearWaiverMut.mutateAsync();
                    }
                  : undefined
              }
            />
          )}
        </CardContent>
      </Card>

      {/*
        Em modo edição (req já existe), trazemos cotações + anexos INLINE
        no próprio form — assim o solicitante não precisa ir pro detalhe
        só pra anexar cotações e voltar pra editar a req. Fluxo único
        do começo ao fim.
      */}
      {isEdit && id && existing.data ? (
        <InlineQuotationsAndAttachments requisition={existing.data} />
      ) : (
        // Em modo create, a seção aparece SEMPRE — quando o solicitante
        // clica em "Adicionar" pela primeira vez, fazemos o auto-save
        // do rascunho via `onBeforeUpload` e seguimos o upload normal.
        // Sem fricção de "salve primeiro".
        <Card>
          <CardContent className="pt-6">
            <AttachmentsSection
              kind="requisition"
              hint="Cotações, contratos e documentos de apoio. Ao adicionar o primeiro anexo, o rascunho é salvo automaticamente."
              allowedDocKinds={['QUOTATION', 'CONTRACT', 'INVOICE', 'OTHER']}
              // Sem defaultDocKind → usuário escolhe tipo conscientemente.
              onBeforeUpload={ensureDraftSaved}
            />
          </CardContent>
        </Card>
      )}

      <ItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        company={code}
        supplierCode={supplierErpCode}
        initial={dialogInitial}
        onConfirm={handleItemConfirm}
      />

      {isEdit && id && existing.data && (
        <QuotationWaiverDialog
          requisitionId={id}
          open={waiverOpen}
          onOpenChange={setWaiverOpen}
          suggestedReason={existing.data.recurring ? 'RECORRENTE' : undefined}
        />
      )}

      <EditReasonDialog
        open={reasonOpen}
        onOpenChange={(v) => {
          setReasonOpen(v);
          if (!v) setPendingDto(null);
        }}
        title="Motivo da edição"
        description="A requisição volta para o fluxo de aprovação após salvar."
        confirmLabel="Salvar e reenviar para aprovação"
        pending={updateMut.isPending}
        onConfirm={async (reason) => {
          if (!pendingDto) return;
          await persist(
            { ...pendingDto, editReason: reason } as RequisitionInput & {
              editReason?: string;
            },
            pendingDto.supplierErpCode,
          );
          setReasonOpen(false);
          setPendingDto(null);
        }}
      />
    </form>
  );
}
