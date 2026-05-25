import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

export interface AdminUser {
  id: string;
  adUsername: string;
  email: string;
  name: string;
  profile: string;
  status: string;
  teamId: string | null;
  canSwitchEnv: boolean;
  loginType?: 'AD' | 'LOCAL';
  cpf?: string | null;
  positionId?: string | null;
  position?: { id: string; code: string; name: string } | null;
  branchAssignments?: Array<{
    companyId: string;
    branchErpCode: string;
  }>;
  createdAt: string;
  updatedAt: string;
  companies?: Array<{
    companyId: string;
    company?: { id: string; code: string; name: string };
  }>;
  team?: { id: string; name: string } | null;
}

export interface UserListParams {
  status?: string;
  companyId?: string;
  search?: string;
  skip?: number;
  /** Default 50 no backend — passe um valor maior em telas de configuração. */
  take?: number;
}

export function useUsers(params: UserListParams) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () =>
      (await api.get<Paginated<AdminUser>>('/users', { params })).data,
  });
}

export function useUser(id: string | undefined) {
  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => (await api.get<AdminUser>(`/users/${id}`)).data,
    enabled: !!id,
  });
}

export interface UserPatch {
  name?: string;
  profile?: string;
  status?: string;
  teamId?: string | null;
  canSwitchEnv?: boolean;
  positionId?: string | null;
}

/** Cadastro de usuário LOCAL (fora do AD) — supervisor/manual. */
export interface CreateLocalUserInput {
  name: string;
  email: string;
  username: string;
  profile: string;
  positionId?: string | null;
  companyIds: string[];
}

export function useCreateLocalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateLocalUserInput) =>
      (await api.post<{ id: string }>('/users/local', dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResendSetupLink() {
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/users/${id}/resend-setup-link`)).data,
  });
}

export interface BranchAssignmentInput {
  companyId: string;
  branchErpCode: string;
}

export function useSetBranchAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      assignments,
    }: {
      id: string;
      assignments: BranchAssignmentInput[];
    }) =>
      (
        await api.put<AdminUser>(`/users/${id}/branch-assignments`, {
          assignments,
        })
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', data.id] });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UserPatch }) =>
      (await api.patch<AdminUser>(`/users/${id}`, patch)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', data.id] });
    },
  });
}

export function useSetUserCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      companyIds,
    }: {
      id: string;
      companyIds: string[];
    }) =>
      (await api.put<AdminUser>(`/users/${id}/companies`, { companyIds })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['user', data.id] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<AdminUser>(`/users/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
