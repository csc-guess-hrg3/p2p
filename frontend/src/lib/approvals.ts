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
    },
  });
}
