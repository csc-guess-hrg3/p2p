import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface PendingApproval {
  id: string;
  level: number;
  levelName: string | null;
  status: string;
  companyId: string;
  requisition: {
    id: string;
    number: string;
    title: string;
    totalAmount: string;
    requester: { name: string };
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
    }: {
      stepId: string;
      reason: string;
    }) =>
      (await api.post(`/approvals/${stepId}/request-revision`, { reason }))
        .data,
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
