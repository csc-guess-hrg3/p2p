import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { ArrowLeft, Save } from 'lucide-react';
import { useCompany } from '@/lib/company';
import {
  useErpConfig,
  useUpdateErpConfig,
  type ErpConfigPatch,
} from '@/lib/admin';
import {
  useComprasTipos,
  useCtbTipoOperacao,
  useNaturezasEntrada,
} from '@/lib/integration';
import { useUsers } from '@/lib/users';
import { useTeams } from '@/lib/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FormState {
  codTransacao: string;
  tabelaFilha: string;
  tipoCompraDefault: string;
  ctbTipoOperacaoDefault: number;
  naturezaEntradaDefault: string;
  moeda: string;
  transportadoraPadrao: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  smtpSecure: boolean;
  smtpFrom: string;
  smtpFromName: string;
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  /** UUID do aprovador de Pedidos de Produto Acabado (diretor da marca). */
  paApproverUserId: string;
  paReschedulerTeamId: string;
}

const EMPTY: FormState = {
  codTransacao: 'COMPRAS_003',
  tabelaFilha: 'COMPRAS_CONSUMIVEL',
  tipoCompraDefault: 'COMPRA DIVERSAS',
  ctbTipoOperacaoDefault: 202,
  naturezaEntradaDefault: '202.01',
  moeda: 'R$',
  transportadoraPadrao: '',
  smtpHost: '',
  smtpPort: '',
  smtpUser: '',
  smtpPassword: '',
  smtpSecure: false,
  smtpFrom: '',
  smtpFromName: '',
  emailSubjectTemplate: '',
  emailBodyTemplate: '',
  paApproverUserId: '',
  paReschedulerTeamId: '',
};

export function ErpConfigPage() {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const companyId = activeCompany?.id;
  const companyCode = activeCompany?.code;

  const { data, isLoading } = useErpConfig(companyId);
  const updateMut = useUpdateErpConfig();

  const { data: tipos = [] } = useComprasTipos(companyCode);
  const { data: ctbs = [] } = useCtbTipoOperacao(companyCode);
  const { data: naturezas = [] } = useNaturezasEntrada(
    companyCode,
    null, // todas, sem filtro
  );
  // Lista usuários ativos da empresa pra escolher o aprovador de PA.
  // Take alto pra garantir que todos caibam no select (Hering tem ~120
  // usuários — sem isso o usuário corrente pode ficar fora dos 50 default).
  const { data: usersPage } = useUsers({
    companyId,
    status: 'ACTIVE',
    take: 500,
  });
  const users = usersPage?.data ?? [];
  // Times pra escolher quem reagenda PA — todos ativos.
  const { data: teams = [] } = useTeams();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);

  // Carrega valores quando o GET resolver.
  useEffect(() => {
    if (!data?.config) return;
    const c = data.config;
    setForm({
      codTransacao: c.codTransacao,
      tabelaFilha: c.tabelaFilha,
      tipoCompraDefault: c.tipoCompraDefault,
      ctbTipoOperacaoDefault: c.ctbTipoOperacaoDefault,
      naturezaEntradaDefault: c.naturezaEntradaDefault,
      moeda: c.moeda,
      transportadoraPadrao: c.transportadoraPadrao ?? '',
      smtpHost: c.smtpHost ?? '',
      smtpPort: c.smtpPort != null ? String(c.smtpPort) : '',
      smtpUser: c.smtpUser ?? '',
      smtpPassword: '', // nunca devolve do servidor
      smtpSecure: c.smtpSecure,
      smtpFrom: c.smtpFrom ?? '',
      smtpFromName: c.smtpFromName ?? '',
      emailSubjectTemplate: c.emailSubjectTemplate ?? '',
      emailBodyTemplate: c.emailBodyTemplate ?? '',
      paApproverUserId: c.paApproverUserId ?? '',
      paReschedulerTeamId: c.paReschedulerTeamId ?? '',
    });
    setTouched(false);
  }, [data?.config]);

  function patch<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
    setTouched(true);
  }

  async function handleSave() {
    if (!companyId) return;
    const payload: ErpConfigPatch = {
      codTransacao: form.codTransacao.trim(),
      tabelaFilha: form.tabelaFilha.trim(),
      tipoCompraDefault: form.tipoCompraDefault.trim(),
      ctbTipoOperacaoDefault: Number(form.ctbTipoOperacaoDefault),
      naturezaEntradaDefault: form.naturezaEntradaDefault.trim(),
      moeda: form.moeda.trim(),
      transportadoraPadrao: form.transportadoraPadrao.trim() || null,
      smtpHost: form.smtpHost.trim() || null,
      smtpPort: form.smtpPort.trim() ? Number(form.smtpPort) : null,
      smtpUser: form.smtpUser.trim() || null,
      smtpSecure: form.smtpSecure,
      smtpFrom: form.smtpFrom.trim() || null,
      smtpFromName: form.smtpFromName.trim() || null,
      emailSubjectTemplate: form.emailSubjectTemplate.trim() || null,
      emailBodyTemplate: form.emailBodyTemplate.trim() || null,
      paApproverUserId: form.paApproverUserId.trim() || null,
      paReschedulerTeamId: form.paReschedulerTeamId.trim() || null,
    };
    // Senha: só envia se o usuário digitou alguma coisa.
    if (form.smtpPassword.trim()) {
      payload.smtpPassword = form.smtpPassword;
    }
    try {
      await updateMut.mutateAsync({ companyId, patch: payload });
      toast({
        title: 'Configuração salva',
        description: `Integração de ${data?.companyName ?? 'empresa'} atualizada.`,
        variant: 'success',
      });
      // limpa o campo senha após salvar
      setForm((p) => ({ ...p, smtpPassword: '' }));
      setTouched(false);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string })?.message
        : null;
      toast({
        title: 'Falha ao salvar',
        description: msg || 'Tente novamente.',
        variant: 'destructive',
      });
    }
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  // Filtra naturezas pelo CTB escolhido (cascade dentro da página).
  const naturezasFiltered = naturezas.filter(
    (n) => n.ctbTipoOperacao === Number(form.ctbTipoOperacaoDefault),
  );

  return (
    <div className="space-y-4 pb-10">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin">
            <ArrowLeft className="size-4" />
            Administração
          </Link>
        </Button>
        <Button onClick={handleSave} disabled={!touched || updateMut.isPending}>
          <Save className="size-4" />
          {updateMut.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Integração com o ERP — {data?.companyName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Defaults da gravação
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de compra padrão</Label>
                <Select
                  value={form.tipoCompraDefault}
                  onValueChange={(v) => patch('tipoCompraDefault', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((t) => (
                      <SelectItem key={t.tipoCompra} value={t.tipoCompra}>
                        {t.tipoCompra}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Operação contábil padrão</Label>
                <Select
                  value={String(form.ctbTipoOperacaoDefault)}
                  onValueChange={(v) => patch('ctbTipoOperacaoDefault', Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ctbs.map((c) => (
                      <SelectItem key={c.codigo} value={String(c.codigo)}>
                        {c.codigo} — {c.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Natureza de entrada padrão</Label>
                <Select
                  value={form.naturezaEntradaDefault}
                  onValueChange={(v) => patch('naturezaEntradaDefault', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {naturezasFiltered.map((n) => (
                      <SelectItem key={n.codigo} value={n.codigo}>
                        {n.codigo} — {n.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Moeda</Label>
                <Input
                  value={form.moeda}
                  onChange={(e) => patch('moeda', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Transportadora padrão</Label>
                <Input
                  value={form.transportadoraPadrao}
                  onChange={(e) => patch('transportadoraPadrao', e.target.value)}
                  placeholder="Opcional"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Compra de Produto Acabado
            </h3>
            <p className="text-xs text-muted-foreground">
              Pedidos de PA (TABELA_FILHA = COMPRAS_PRODUTO) nascem no ERP em
              status "em estudo" e aguardam aprovação do diretor da marca aqui
              no P2P. Defina quem é esse aprovador.
            </p>
            <div className="space-y-1.5 md:max-w-md">
              <Label>Aprovador (diretor da marca)</Label>
              <Select
                value={form.paApproverUserId || '__none__'}
                onValueChange={(v) =>
                  patch('paApproverUserId', v === '__none__' ? '' : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem aprovador —</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.paApproverUserId === '' && (
                <p className="text-xs text-warning">
                  Sem aprovador definido — botão Aprovar/Reprovar não aparece
                  para ninguém.
                </p>
              )}
            </div>

            <div className="space-y-1.5 md:max-w-md">
              <Label>Time autorizado a reagendar entregas</Label>
              <Select
                value={form.paReschedulerTeamId || '__none__'}
                onValueChange={(v) =>
                  patch(
                    'paReschedulerTeamId',
                    v === '__none__' ? '' : v,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Sem time —</SelectItem>
                  {teams
                    .filter((t) => t.active)
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quem é membro deste time (ou ADMIN) consegue reagendar a data
                de entrega de pedidos PA pela tela de detalhe.
              </p>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Envio de e-mail ao fornecedor (SMTP)
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Servidor</Label>
                <Input
                  value={form.smtpHost}
                  onChange={(e) => patch('smtpHost', e.target.value)}
                  placeholder="smtp.exemplo.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Porta</Label>
                <Input
                  type="number"
                  value={form.smtpPort}
                  onChange={(e) => patch('smtpPort', e.target.value)}
                  placeholder="587"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Input
                  value={form.smtpUser}
                  onChange={(e) => patch('smtpUser', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={form.smtpPassword}
                  onChange={(e) => patch('smtpPassword', e.target.value)}
                  placeholder={
                    data?.config?.hasSmtpPassword
                      ? '••••••• (preencha para alterar)'
                      : ''
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border p-2.5">
                <div>
                  <p className="text-sm font-medium">Conexão segura (TLS)</p>
                  <p className="text-xs text-muted-foreground">
                    Ativar quando a porta exige SSL/TLS (geralmente 465).
                  </p>
                </div>
                <Switch
                  checked={form.smtpSecure}
                  onCheckedChange={(v) => patch('smtpSecure', v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Remetente (endereço)</Label>
                <Input
                  value={form.smtpFrom}
                  onChange={(e) => patch('smtpFrom', e.target.value)}
                  placeholder="compras@empresa.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Remetente (nome)</Label>
                <Input
                  value={form.smtpFromName}
                  onChange={(e) => patch('smtpFromName', e.target.value)}
                  placeholder="Compras Indiretas"
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Templates de e-mail (opcionais)
            </h3>
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code>{'{{numero}}'}</code>,{' '}
              <code>{'{{fornecedor}}'}</code>, <code>{'{{filial}}'}</code>,{' '}
              <code>{'{{empresa}}'}</code>, <code>{'{{total}}'}</code>,{' '}
              <code>{'{{erp}}'}</code>.
            </p>
            <div className="space-y-1.5">
              <Label>Assunto</Label>
              <Input
                value={form.emailSubjectTemplate}
                onChange={(e) => patch('emailSubjectTemplate', e.target.value)}
                placeholder="Pedido de Compra {{numero}} — {{empresa}}"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Corpo</Label>
              <Textarea
                rows={5}
                value={form.emailBodyTemplate}
                onChange={(e) => patch('emailBodyTemplate', e.target.value)}
              />
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
