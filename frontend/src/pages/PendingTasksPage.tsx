import { Link } from 'react-router-dom';
import {
  CheckSquare,
  ClipboardCheck,
  FileText,
  PackageCheck,
  ShoppingCart,
  Shirt,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { useMyActions } from '@/lib/dashboard';
import { useAuth } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface TaskItem {
  label: string;
  hint: string;
  count: number;
  icon: typeof CheckSquare;
  to: string;
  /** 'act' = depende de uma ação minha; 'track' = só acompanhamento. */
  kind: 'act' | 'track';
}

/**
 * "Minhas pendências" — painel orientado a AÇÃO, role-aware. Mostra só o
 * que depende do usuário logado (conforme perfil/equipe), separando o que
 * ele precisa DECIDIR/EXECUTAR do que é só acompanhamento. Fica no topo da
 * home, acima das dashboards analíticas — cada pessoa vê "o que é meu"
 * sem garimpar menu, mas sem perder a visão geral logo abaixo.
 */
export function PendingTasksPanel({ companyId }: { companyId?: string }) {
  const { data, isLoading } = useMyActions(companyId);
  const { user } = useAuth();

  const profile = user?.profile;
  const isApprover = profile === 'ADMIN' || profile === 'MANAGER';
  const isFiscal = profile === 'ADMIN' || profile === 'REVIEWER';
  const extras = user?.extraModules ?? [];
  const canSeePa = isApprover || extras.includes('PA');
  const canSeeFiscal = isFiscal || extras.includes('FISCAL_QUEUE');

  const items: TaskItem[] = (
    [
      isApprover && {
        label: 'Aprovações aguardando você',
        hint: 'Requisições que dependem da sua decisão.',
        count: data?.approvalsPending ?? 0,
        icon: CheckSquare,
        to: '/aprovacoes',
        kind: 'act' as const,
      },
      isApprover && {
        label: 'Requisições a converter em pedido',
        hint: 'Aprovadas, aguardando virar pedido de compra.',
        count: data?.toConvert ?? 0,
        icon: ShoppingCart,
        to: '/requisicoes?status=APPROVED',
        kind: 'act' as const,
      },
      canSeePa && {
        label: isApprover ? 'Pedidos PA para aprovar' : 'Pedidos PA em andamento',
        hint: 'Produto acabado aguardando tratamento.',
        count: data?.paPending ?? 0,
        icon: Shirt,
        to: '/pedidos-pa?status=E',
        kind: 'act' as const,
      },
      canSeeFiscal && {
        label: 'Pendências fiscais',
        hint: 'Itens sem vínculo fiscal no ERP.',
        count: data?.fiscalPending ?? 0,
        icon: ClipboardCheck,
        to: '/fiscal/pendencias-fiscais',
        kind: 'act' as const,
      },
      {
        label: 'Minhas requisições em rascunho/devolvidas',
        hint: 'Suas requisições para retomar e enviar.',
        count: data?.myDraftRequisitions ?? 0,
        icon: FileText,
        to: '/requisicoes?status=DRAFT',
        kind: 'act' as const,
      },
      {
        label: 'Minhas requisições em aprovação',
        hint: 'Aguardando a decisão do gestor.',
        count: data?.myInApproval ?? 0,
        icon: PackageCheck,
        to: '/requisicoes',
        kind: 'track' as const,
      },
    ].filter(Boolean) as TaskItem[]
  );

  const toAct = items.filter((i) => i.kind === 'act');
  const toTrack = items.filter((i) => i.kind === 'track');
  const pendingCount = toAct.reduce((s, i) => s + i.count, 0);
  const firstName = user?.name?.split(' ')[0];

  // Um grid único (2 colunas) com tudo que é relevante — ação primeiro,
  // acompanhamento (só os com contagem > 0) em seguida, apenas "apagadinho".
  // Assim 4 cartões caem 2×2 em vez de sobrar buraco em grids separados.
  const cards = [...toAct, ...toTrack.filter((t) => t.count > 0)];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">
          Minhas pendências
        </h2>
        <span className="text-sm text-muted-foreground">
          {isLoading
            ? 'Carregando…'
            : pendingCount > 0
              ? `${firstName ? firstName + ', você' : 'Você'} tem ${pendingCount} ${pendingCount === 1 ? 'item' : 'itens'} aguardando ação`
              : 'Nada aguardando sua ação'}
        </span>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex items-center gap-3 py-5 text-muted-foreground">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <span className="text-sm">
              Tudo em dia — nenhuma pendência aguardando você.
            </span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.map((it) => (
            <TaskCard key={it.label} item={it} muted={it.kind === 'track'} />
          ))}
        </div>
      )}
    </section>
  );
}

function TaskCard({ item, muted }: { item: TaskItem; muted?: boolean }) {
  const active = item.count > 0;
  return (
    <Link
      to={item.to}
      className={`group flex items-center justify-between rounded-xl border p-4 transition-colors hover:bg-accent ${
        active && !muted ? 'border-primary/30 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 rounded-lg p-2 ${
            active && !muted
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <item.icon className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <p className="text-xs text-muted-foreground">{item.hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`min-w-8 rounded-full px-2.5 py-1 text-center text-sm font-semibold ${
            active && !muted
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {item.count}
        </span>
        <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  );
}
