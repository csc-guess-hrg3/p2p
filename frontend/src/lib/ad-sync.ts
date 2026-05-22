import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface AdTeamSuggestion {
  ouName: string;
  companyCode: string | null;
  users: Array<{
    login: string;
    name: string;
    email: string | null;
    dn: string;
  }>;
}

export function useAdPreview(enabled = false) {
  return useQuery({
    queryKey: ['ad-preview'],
    queryFn: async () =>
      (await api.get<AdTeamSuggestion[]>('/admin/ad/preview')).data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export interface AdApplyPayload {
  selections: Array<{
    ouName: string;
    companyCode: string;
    teamName: string;
    userLogins: string[];
  }>;
}

export function useAdApply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AdApplyPayload) =>
      (
        await api.post<{
          teamsCreated: number;
          usersCreated: number;
          usersLinked: number;
        }>('/admin/ad/apply', payload)
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['ad-preview'] });
    },
  });
}
