import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface Delegation {
  id: string;
  delegatorId: string;
  delegateId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  delegator?: { id: string; name: string };
  delegate?: { id: string; name: string };
}

export interface CreateDelegationInput {
  delegateId: string;
  startsAt: string;
  endsAt: string;
  reason?: string;
}

export function useDelegations(type: 'given' | 'received') {
  return useQuery({
    queryKey: ['delegations', type],
    queryFn: async () =>
      (await api.get<Delegation[]>('/delegations', { params: { type } })).data,
  });
}

export function useCreateDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateDelegationInput) =>
      (await api.post<Delegation>('/delegations', dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delegations'] }),
  });
}

export function useCancelDelegation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<Delegation>(`/delegations/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delegations'] }),
  });
}
