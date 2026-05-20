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
