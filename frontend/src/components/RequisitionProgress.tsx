import {
  AlertTriangle,
  Check,
  CircleDashed,
  ClipboardCheck,
  ClipboardList,
  FileText,
  PackageCheck,
  ShoppingCart,
  Truck,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Requisition } from '@/lib/requisitions';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * Stepper visual mostrando em que fase do ciclo a requisição está.
 * Diferente do `<HistoryTimeline>` (que é log cronológico de eventos
 * passados), este componente é orientado ao FUTURO: mostra todas as
 * fases possíveis, marca as concluídas e destaca a atual.
 *
 * Pensado pro solicitante (operador) entender o status da própria req
 * sem precisar conhecer os bastidores do sistema — termos de negócio,
 * não termos técnicos.
 */
interface Props {
  req: Pick<
    Requisition,
    'status' | 'pendingFiscalItems' | 'purchaseOrders'
  >;
}

type PhaseState = 'done' | 'current' | 'todo' | 'failed' | 'warning';

interface Phase {
  key: string;
  label: string;
  Icon: typeof Check;
  state: PhaseState;
  detail?: string;
}

export function RequisitionProgress({ req }: Props) {
  const phases = buildPhases(req);
  return (
    <Card>
      <CardContent className="pt-6">
        <ol className="flex flex-wrap items-start gap-2">
          {phases.map((p, idx) => (
            <PhaseNode key={p.key} phase={p} isLast={idx === phases.length - 1} />
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function PhaseNode({ phase, isLast }: { phase: Phase; isLast: boolean }) {
  const { Icon, label, state, detail } = phase;
  const palette = {
    done: 'border-success bg-success text-success-foreground',
    current: 'border-primary bg-primary text-white ring-4 ring-primary/20',
    todo: 'border-muted-foreground/30 bg-card text-muted-foreground',
    failed: 'border-destructive bg-destructive text-destructive-foreground',
    warning: 'border-warning bg-warning text-warning-foreground',
  }[state];
  const labelColor = {
    done: 'text-success',
    current: 'text-primary font-semibold',
    todo: 'text-muted-foreground',
    failed: 'text-destructive font-semibold',
    warning: 'text-warning font-semibold',
  }[state];
  const connector = {
    done: 'bg-success',
    current: 'bg-primary',
    todo: 'bg-muted-foreground/20',
    failed: 'bg-destructive',
    warning: 'bg-warning',
  }[state];

  // Em mobile o stepper colapsa pra vertical. No desktop ele flui em
  // linha e o conector horizontal mostra avanço entre fases.
  const node = (
    <li className="flex flex-1 min-w-[110px] items-start gap-2">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-full border-2 transition',
            palette,
          )}
        >
          <Icon className="size-4" />
        </div>
        {!isLast && (
          <div
            className={cn('mt-1 h-0.5 w-full hidden sm:block', connector)}
            aria-hidden
          />
        )}
      </div>
      <div className="flex-1 pt-1 text-xs">
        <p className={cn('leading-tight', labelColor)}>{label}</p>
        {detail && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
        )}
      </div>
    </li>
  );

  // Tooltip explicando o estado quando há contexto (atalho de hover).
  if (detail) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    );
  }
  return node;
}

/**
 * Determina as fases visíveis e os estados (done/current/todo/...) com
 * base no status da requisição + pedidos vinculados + pendências fiscais.
 *
 * Regras:
 *  - "Pendência fiscal" só entra se houver itens fiscais pendentes — não
 *    polui a timeline de requisições normais.
 *  - Quando a req é REJECTED/CANCELLED, marcamos a fase atual como
 *    "failed" e não exibimos as posteriores como `todo`.
 *  - Recebimento é por PC: se algum PC ligado está em recebimento, marca
 *    a fase de recebimento como current/done conforme o status.
 */
function buildPhases(req: Props['req']): Phase[] {
  const status = req.status;
  const isFailed = status === 'REJECTED' || status === 'CANCELLED';
  const hasFiscalPending = (req.pendingFiscalItems ?? []).some(
    (f) => f.status === 'PENDING',
  );
  const hasFiscalRejected = (req.pendingFiscalItems ?? []).some(
    (f) => f.status === 'REJECTED',
  );
  const linkedPos = req.purchaseOrders ?? [];
  const hasPo = linkedPos.length > 0;
  const poStatuses = new Set(linkedPos.map((p) => p.status));
  const hasReceivingStarted =
    poStatuses.has('PARTIALLY_RECEIVED') || poStatuses.has('FULLY_RECEIVED');
  const fullyReceived = linkedPos.every((p) => p.status === 'FULLY_RECEIVED');

  // Helper pra dizer se um marco já foi atingido.
  const past = (...sts: string[]) => sts.includes(status);
  const phases: Phase[] = [];

  // 1) Rascunho — sempre passa por aqui se a req existe.
  phases.push({
    key: 'draft',
    label: 'Rascunho',
    Icon: FileText,
    state: status === 'DRAFT' ? 'current' : 'done',
  });

  // 2) Em aprovação
  phases.push({
    key: 'approval',
    label: 'Em aprovação',
    Icon: ClipboardList,
    state:
      status === 'IN_APPROVAL' || status === 'SUBMITTED'
        ? 'current'
        : status === 'REJECTED'
          ? 'failed'
          : past('DRAFT')
            ? 'todo'
            : 'done',
    detail:
      status === 'REJECTED' ? 'Aprovação rejeitada' : undefined,
  });

  // 3) Aprovada
  phases.push({
    key: 'approved',
    label: 'Aprovada',
    Icon: ClipboardCheck,
    state:
      status === 'APPROVED'
        ? 'current'
        : status === 'CONVERTED'
          ? 'done'
          : isFailed
            ? 'todo'
            : past('DRAFT', 'IN_APPROVAL', 'SUBMITTED')
              ? 'todo'
              : 'done',
  });

  // 4) Pendência fiscal — só entra se realmente houver pendência
  if (hasFiscalPending || hasFiscalRejected) {
    phases.push({
      key: 'fiscal',
      label: hasFiscalRejected
        ? 'Pendência fiscal rejeitada'
        : 'Pendência fiscal',
      Icon: hasFiscalRejected ? XCircle : AlertTriangle,
      state: hasFiscalRejected ? 'failed' : 'warning',
      detail: hasFiscalRejected
        ? 'Fiscal recusou o vínculo do item — ajuste com o solicitante.'
        : 'Aguardando o time fiscal vincular itens novos ao fornecedor.',
    });
  }

  // 5) Pedido de Compra criado
  phases.push({
    key: 'po',
    label: 'Pedido de compra',
    Icon: ShoppingCart,
    state: isFailed
      ? 'todo'
      : hasPo
        ? hasReceivingStarted || fullyReceived
          ? 'done'
          : 'current'
        : 'todo',
    detail: hasPo ? linkedPos.map((p) => p.number).join(', ') : undefined,
  });

  // 6) Recebimento
  phases.push({
    key: 'receiving',
    label: fullyReceived ? 'Recebimento concluído' : 'Recebimento',
    Icon: fullyReceived ? PackageCheck : Truck,
    state: isFailed
      ? 'todo'
      : fullyReceived
        ? 'done'
        : hasReceivingStarted
          ? 'current'
          : 'todo',
    detail: poStatuses.has('PARTIALLY_RECEIVED')
      ? 'Recebimento parcial em andamento.'
      : undefined,
  });

  return phases;
}

// Placeholder pra evitar warning de import não usado quando este arquivo
// for usado só num import inicial; o CircleDashed é exportado por sinal.
void CircleDashed;
