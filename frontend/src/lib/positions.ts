import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/**
 * Cargos (Positions) — usados pela cadeia de aprovação dinâmica.
 * Admin gerencia em /admin/cargos; demais perfis só leem.
 */
export interface Position {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PositionInput {
  code: string;
  name: string;
  active?: boolean;
}

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await api.get<Position[]>('/positions')).data,
    staleTime: 60_000,
  });
}

export function useCreatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: PositionInput) =>
      (await api.post<Position>('/positions', dto)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['positions'] }),
  });
}

export function useUpdatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<PositionInput>;
    }) => (await api.patch<Position>(`/positions/${id}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['positions'] }),
  });
}

export function useDeletePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/positions/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['positions'] }),
  });
}
