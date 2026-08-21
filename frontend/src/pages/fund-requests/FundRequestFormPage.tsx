import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useCompany } from '@/lib/company';
import { useAccounts, useBranchRateios, useCcRateios } from '@/lib/integration';
import {
  useCreateFundRequest,
  useSubmitFundRequest,
  type CreateFundRequestPayload,
} from '@/lib/fund-requests';
import { extractApiMessage } from '@/lib/api-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

interface ItemForm {
  description: string;
  beneficiaryName: string;
  accountingAccount: string;
  accountName: string;
  branchRateioCode: string;
  branchRateioDesc: string;
  costCenterRateioCode: string;
  costCenterRateioDesc: string;
  amount: string;
  dueDate: string;
  beneficiaryBank: string;
  beneficiaryAgency: string;
  beneficiaryAccount: string;
  notes: string;
}

function emptyItem(): ItemForm {
  return {
    description: '',
    beneficiaryName: '',
    accountingAccount: '',
    accountName: '',
    branchRateioCode: '',
    branchRateioDesc: '',
    costCenterRateioCode: '',
    costCenterRateioDesc: '',
    amount: '',
    dueDate: '',
    beneficiaryBank: '',
    beneficiaryAgency: '',
    beneficiaryAccount: '',
    notes: '',
  };
}

/**
 * Nova Solicitação de Verba AVULSA (pagamento sem NF — taxas, reembolsos,
 * contribuições). Cria e (opcionalmente) já envia para a cadeia de aprovação
 * da equipe do solicitante.
 */
export function FundRequestFormPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const code = activeCompany?.code;

  const { data: accounts = [] } = useAccounts(code);
  const { data: branchRateios = [] } = useBranchRateios(code);
  const { data: ccRateios = [] } = useCcRateios(code);

  const createMut = useCreateFundRequest();
  const submitMut = useSubmitFundRequest();

  const [title, setTitle] = useState('');
  const [items, setItems] = useState<ItemForm[]>([emptyItem()]);

  const total = useMemo(
    () => items.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [items],
  );

  const patch = (i: number, p: Partial<ItemForm>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)));

  const invalid =
    !title.trim() ||
    items.length === 0 ||
    items.some(
      (it) =>
        !it.description.trim() ||
        !it.beneficiaryName.trim() ||
        !it.accountingAccount ||
        !it.branchRateioCode ||
        !it.costCenterRateioCode ||
        !(Number(it.amount) > 0) ||
        !it.dueDate,
    );

  const busy = createMut.isPending || submitMut.isPending;

  function buildPayload(): CreateFundRequestPayload {
    return {
      companyId: activeCompany!.id,
      title: title.trim(),
      items: items.map((it) => ({
        description: it.description.trim(),
        beneficiaryName: it.beneficiaryName.trim(),
        accountingAccount: it.accountingAccount,
        accountName: it.accountName || undefined,
        branchRateioCode: it.branchRateioCode,
        branchRateioDesc: it.branchRateioDesc || undefined,
        costCenterRateioCode: it.costCenterRateioCode,
        costCenterRateioDesc: it.costCenterRateioDesc || undefined,
        amount: Number(it.amount),
        dueDate: it.dueDate,
        beneficiaryBank: it.beneficiaryBank || undefined,
        beneficiaryAgency: it.beneficiaryAgency || undefined,
        beneficiaryAccount: it.beneficiaryAccount || undefined,
        notes: it.notes || undefined,
      })),
    };
  }

  async function handle(sendToApproval: boolean) {
    if (invalid || !activeCompany) return;
    try {
      const sv = await createMut.mutateAsync(buildPayload());
      if (sendToApproval) {
        await submitMut.mutateAsync(sv.id);
        toast({
          title: 'Solicitação enviada para aprovação',
          description: sv.number,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Rascunho salvo',
          description: sv.number,
          variant: 'success',
        });
      }
      navigate(`/solicitacoes-verba/${sv.id}`, { replace: true });
    } catch (err) {
      toast({
        title: 'Não foi possível concluir',
        description: extractApiMessage(err, 'Tente novamente.'),
        variant: 'destructive',
      });
    }
  }

  return (
    <div className="space-y-4 pb-10">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/solicitacoes-verba">
          <ArrowLeft className="size-4" />
          Solicitações de verba
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nova solicitação de verba (sem nota fiscal)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Pagamento sem NF — taxas, contribuições, reembolsos.
            {activeCompany ? ` Empresa: ${activeCompany.name}.` : ''}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Taxa de licenciamento anual"
            />
          </div>

          <div className="space-y-3">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Item {i + 1}</span>
                  {items.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Descrição</Label>
                    <Input
                      value={it.description}
                      onChange={(e) => patch(i, { description: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Beneficiário</Label>
                    <Input
                      value={it.beneficiaryName}
                      onChange={(e) =>
                        patch(i, { beneficiaryName: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Conta contábil</Label>
                    <Select
                      value={it.accountingAccount}
                      onValueChange={(v) => {
                        const a = accounts.find((x) => x.codigo === v);
                        patch(i, {
                          accountingAccount: v,
                          accountName: a?.nome ?? '',
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts
                          .filter((a) => !a.inativo)
                          .map((a) => (
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
                      value={it.branchRateioCode}
                      onValueChange={(v) => {
                        const r = branchRateios.find((x) => x.codigo === v);
                        patch(i, {
                          branchRateioCode: v,
                          branchRateioDesc: r?.descricao ?? '',
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {branchRateios
                          .filter((r) => !r.inativo)
                          .map((r) => (
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
                      value={it.costCenterRateioCode}
                      onValueChange={(v) => {
                        const r = ccRateios.find((x) => x.codigo === v);
                        patch(i, {
                          costCenterRateioCode: v,
                          costCenterRateioDesc: r?.descricao ?? '',
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {ccRateios
                          .filter((r) => !r.inativo)
                          .map((r) => (
                            <SelectItem key={r.codigo} value={r.codigo}>
                              {r.codigo} — {r.descricao}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={it.amount}
                      onChange={(e) => patch(i, { amount: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Vencimento</Label>
                    <Input
                      type="date"
                      value={it.dueDate}
                      onChange={(e) => patch(i, { dueDate: e.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Banco (opcional)</Label>
                    <Input
                      value={it.beneficiaryBank}
                      onChange={(e) =>
                        patch(i, { beneficiaryBank: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Agência (opcional)</Label>
                      <Input
                        value={it.beneficiaryAgency}
                        onChange={(e) =>
                          patch(i, { beneficiaryAgency: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Conta (opcional)</Label>
                      <Input
                        value={it.beneficiaryAccount}
                        onChange={(e) =>
                          patch(i, { beneficiaryAccount: e.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, emptyItem()])}
            >
              <Plus className="size-4" />
              Adicionar item
            </Button>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              Total:{' '}
              <span className="font-semibold tabular-nums">
                {money.format(total)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={invalid || busy}
                onClick={() => void handle(false)}
              >
                Salvar rascunho
              </Button>
              <Button
                type="button"
                disabled={invalid || busy}
                onClick={() => void handle(true)}
              >
                {busy ? 'Enviando…' : 'Enviar para aprovação'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
