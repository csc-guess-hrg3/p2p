import { Badge, type BadgeProps } from '@/components/ui/badge';

type Variant = NonNullable<BadgeProps['variant']>;

/** Rótulo + cor de cada status das entidades do P2P. */
const STATUS_MAP: Record<string, { label: string; variant: Variant }> = {
  // Requisição
  DRAFT: { label: 'Rascunho', variant: 'neutral' },
  SUBMITTED: { label: 'Enviada', variant: 'default' },
  IN_APPROVAL: { label: 'Em aprovação', variant: 'warning' },
  APPROVED: { label: 'Aprovada', variant: 'success' },
  REJECTED: { label: 'Rejeitada', variant: 'destructive' },
  REVISION: { label: 'Em revisão', variant: 'warning' },
  CONVERTED: { label: 'Convertida', variant: 'default' },
  CANCELLED: { label: 'Cancelada', variant: 'destructive' },
  // Pedido de Compra
  SENT_TO_SUPPLIER: { label: 'Enviado ao fornecedor', variant: 'default' },
  PARTIALLY_RECEIVED: { label: 'Recebido parcial', variant: 'warning' },
  FULLY_RECEIVED: { label: 'Recebido total', variant: 'success' },
  PENDING_ERP: { label: 'Pendente ERP', variant: 'warning' },
  // Azul (default) ao invés de verde pra não confundir com APPROVED nos
  // gráficos e tabelas — "integrado" é status de informação, não sucesso.
  INTEGRATED: { label: 'Integrado', variant: 'default' },
  // Recebimento
  CONFIRMED: { label: 'Confirmado', variant: 'success' },
  DIVERGENT: { label: 'Divergente', variant: 'warning' },
};

const NF_TYPE_LABELS: Record<string, string> = {
  NF_EXISTENTE: 'NF já existe',
  NF_FUTURA: 'NF futura (adiantamento)',
  SEM_NF: 'Sem NF',
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, variant: 'neutral' };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function statusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status;
}

export function nfTypeLabel(type: string): string {
  return NF_TYPE_LABELS[type] ?? type;
}
