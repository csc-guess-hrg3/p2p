import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/* Tipos espelham as views v_p2p_product_orders / v_p2p_product_order_items. */

export interface PaOrder {
  empresa: string;
  pedido: string;
  fornecedor: string;
  filial: string;
  condicao_pgto: string | null;
  moeda: string;
  status_compra: string;
  status_aprovacao: string;
  /**
   * Status efetivo derivado do header + cancelamento por item:
   *   - 'CP' (cancelado parcial) quando há itens parcialmente cancelados
   *   - 'C' quando todos os itens estão totalmente cancelados
   *   - caso contrário, o próprio status_compra
   */
  status_efetivo: string;
  tot_qtde_cancelada: number | null;
  lx_status_compra: number | null;
  tipo_compra: string;
  natureza_entrada: string | null;
  emissao: string;
  cadastramento: string;
  data_aprovacao: string | null;
  aprovado_por: string | null;
  requerido_por: string | null;
  tot_qtde_original: number | null;
  tot_qtde_entregar: number | null;
  tot_valor_original: string;
  tot_valor_entregar: string;
  obs: string | null;
  /**
   * LIMITE_ENTREGA mais antigo entre itens com saldo a entregar.
   * Null quando não há item aberto (pedido fechado ou todos sem data).
   * Frontend usa pra sinalizar atraso/vencimento próximo na lista.
   */
  proxima_entrega: string | null;
  /**
   * Data original (sem aplicar reagendamentos). Quando difere de
   * `proxima_entrega`, a UI mostra tooltip "Original: X".
   */
  proxima_entrega_original?: string | null;
  /** Quantidade distinta de NFs vinculadas. */
  nfs_count?: number | null;
  /** Primeira NF (menor número) — usada na coluna da listagem. */
  first_nf?: string | null;
  /** True se houve reagendamento via P2P registrado em pa_delivery_changes. */
  was_rescheduled?: boolean;
}

export interface PaItemNf {
  pedido: string;
  produto: string;
  cor: string;
  entrega: string;
  nf: string;
  serie: string | null;
  fornecedor: string;
  emissao: string | null;
  recebimento: string | null;
  qtde: number;
  valor_unit: string;
  valor_total: string;
  mata_saldo: boolean;
}

export interface PaOrderNf {
  pedido: string;
  nf: string;
  serie: string | null;
  fornecedor: string;
  emissao: string | null;
  recebimento: string | null;
  filial_entrada: string | null;
  qtde_total: number;
  valor_total: string;
}

export interface PaItem {
  empresa: string;
  pedido: string;
  produto: string;
  cor: string;
  entrega: string;
  limite_entrega: string | null;
  chegada_prevista: string | null;
  data_confirmacao: string | null;
  qtde_original: number | null;
  qtde_cancelada: number | null;
  qtde_entregue: number | null;
  qtde_entregar: number | null;
  valor_original: string;
  valor_entregue: string;
  valor_entregar: string;
  custo_unit: string;
  ipi_pct: string;
  desconto_item: string;
  obs_item: string | null;
  /** NFs que entregaram esse item (entrega parcelada → várias). */
  nfs: PaItemNf[];
  /**
   * True se houve reagendamento P2P que afeta este item (scope=order ou
   * scope=item matching). Não usar ENTREGA != LIMITE_ENTREGA como proxy
   * — Compras já preenche essas datas diferentes organicamente no ERP.
   */
  was_rescheduled: boolean;
}

export interface PaTimelineEvent {
  at: string;
  kind:
    | 'created'
    | 'approved'
    | 'rejected'
    | 'status'
    | 'nf'
    | 'reschedule';
  label: string;
  who?: string | null;
  detail?: string | null;
}

export interface PaOrderDetail extends PaOrder {
  items: PaItem[];
  /** Lista de NFs distintas do pedido inteiro (header agregado). */
  nfs: PaOrderNf[];
  /** Histórico cronológico (mais recente primeiro). */
  timeline: PaTimelineEvent[];
  canApprovePa: boolean;
  /** True se o usuário pode reagendar (time configurado ou ADMIN). */
  canReschedule: boolean;
}

export interface PaGradeRow {
  posicao: number;
  qtdeOriginal: number;
  qtdeEntregue: number;
  tamanho: string | null;
}

export interface PaGrade {
  grade: string | null;
  rows: PaGradeRow[];
}

/** Lista pedidos PA da empresa. status: 'P', 'E', 'A', 'R', 'C', 'M' ou 'ALL'. */
export function usePaOrders(
  company?: string,
  params: { status?: string; search?: string } = {},
) {
  return useQuery({
    queryKey: ['pa-orders', company, params],
    queryFn: async () =>
      (
        await api.get<PaOrder[]>(`/product-orders-pa/${company}`, { params })
      ).data,
    enabled: !!company,
    staleTime: 60_000,
  });
}

export function usePaOrder(company?: string, pedido?: string) {
  return useQuery({
    queryKey: ['pa-order', company, pedido],
    queryFn: async () =>
      (
        await api.get<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}`,
        )
      ).data,
    enabled: !!company && !!pedido,
  });
}

export function useApprovePaOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ company, pedido }: { company: string; pedido: string }) =>
      (
        await api.post<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}/approve`,
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pa-orders', vars.company] });
      qc.invalidateQueries({ queryKey: ['pa-order', vars.company, vars.pedido] });
    },
  });
}

export interface ReschedulePayload {
  scope: 'order' | 'item';
  toDate: string;
  reason: string;
  produto?: string;
  cor?: string;
  entregaOriginal?: string;
}

export function useReschedulePaOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      company,
      pedido,
      payload,
    }: {
      company: string;
      pedido: string;
      payload: ReschedulePayload;
    }) =>
      (
        await api.post<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}/reschedule`,
          payload,
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pa-orders', vars.company] });
      qc.invalidateQueries({ queryKey: ['pa-order', vars.company, vars.pedido] });
    },
  });
}

export function useRejectPaOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      company,
      pedido,
      reason,
    }: {
      company: string;
      pedido: string;
      reason: string;
    }) =>
      (
        await api.post<PaOrderDetail>(
          `/product-orders-pa/${company}/${pedido}/reject`,
          { reason },
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['pa-orders', vars.company] });
      qc.invalidateQueries({ queryKey: ['pa-order', vars.company, vars.pedido] });
    },
  });
}

export function usePaItemGrade(
  company?: string,
  pedido?: string,
  produto?: string,
  cor?: string,
  entrega?: string,
) {
  return useQuery({
    queryKey: ['pa-grade', company, pedido, produto, cor, entrega],
    queryFn: async () =>
      (
        await api.get<PaGrade>(`/product-orders-pa/${company}/${pedido}/grade`, {
          params: { produto, cor, entrega },
        })
      ).data,
    enabled: !!company && !!pedido && !!produto && !!cor && !!entrega,
  });
}
