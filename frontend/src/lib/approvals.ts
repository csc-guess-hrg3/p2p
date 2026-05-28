import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface PendingApproval {
  id: string;
  level: number;
  levelName: string | null;
  status: string;
  companyId: string;
  /**
   * Aprovador titular desta etapa. Admin enxerga TODAS as etapas
   * pendentes — usamos este campo pra mostrar "Aprovador titular: Fulano"
   * quando o admin não é a pessoa designada (override).
   */
  assignedApprover?: { id: string; name: string } | null;
  requisition: {
    id: string;
    number: string;
    title: string;
    totalAmount: string;
    requester: { name: string };
    /** Dispensa de cotação solicitada (quando preenchida na requisição). */
    quotationWaiverReason?:
      | 'CONTRATO_VIGENTE'
      | 'RECORRENTE'
      | 'UNICO_FORNECEDOR'
      | 'EMERGENCIA'
      | 'OUTRO'
      | null;
    quotationWaiverNote?: string | null;
  };
}

/** Etapas de aprovação pendentes para o usuário logado. */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['approvals', 'pending'],
    queryFn: async () =>
      (await api.get<PendingApproval[]>('/approvals/pending')).data,
  });
}

/** Visão do solicitante: requisições próprias aguardando o aprovador. */
export interface MineWaitingApproval {
  id: string;
  number: string;
  title: string;
  totalAmount: string;
  status: string;
  submittedAt: string | null;
  currentLevel: number | null;
  currentLevelName: string | null;
  currentApprover: { id: string; name: string } | null;
}

export function useMineWaitingApproval() {
  return useQuery({
    queryKey: ['approvals', 'mine-waiting'],
    queryFn: async () =>
      (await api.get<MineWaitingApproval[]>('/approvals/mine-waiting')).data,
  });
}

/** Pedir revisão da requisição/PC — devolve pro solicitante com motivo. */
export function useRequestRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      stepId,
      reason,
      clearQuotationWaiver,
    }: {
      stepId: string;
      reason: string;
      /** Marca quando o motivo é recusa de dispensa de cotação. */
      clearQuotationWaiver?: boolean;
    }) =>
      (
        await api.post(`/approvals/${stepId}/request-revision`, {
          reason,
          clearQuotationWaiver,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['requisition'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['purchase-order'] });
    },
  });
}

/** Registra a decisão de uma etapa (aprovar/rejeitar). */
export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      stepId,
      approved,
      comments,
    }: {
      stepId: string;
      approved: boolean;
      comments?: string;
    }) =>
      (
        await api.post(`/approvals/${stepId}/decide`, { approved, comments })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      // Detalhe ['requisition', id] também precisa refletir o novo estado
      // (status + cadeia de aprovação) sem o usuário ter que recarregar.
      qc.invalidateQueries({ queryKey: ['requisition'] });
    },
  });
}
