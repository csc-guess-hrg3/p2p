import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface ApprovalLevel {
  id?: string;
  level: number;
  name: string;
  approverId: string;
  approver?: { id: string; name: string };
  maxAmount: string | number | null;
}

export interface AdminTeam {
  id: string;
  name: string;
  managerId: string | null;
  isFiscal: boolean;
  active: boolean;
  /** Módulos extras liberados (PA, FISCAL_QUEUE, REPORTS, RECEIVING, APPROVALS). */
  moduleAccess?: Array<{ module: string }>;
  /** Rateios de filial liberados por (companyId, code) — só no findOne. */
  branchRateios?: Array<{ companyId: string; branchRateioCode: string }>;
  /** Rateios de centro de custo liberados por (companyId, code). */
  costCenterRateios?: Array<{ companyId: string; costCenterRateioCode: string }>;
  createdAt: string;
  updatedAt: string;
  approvalLevels?: ApprovalLevel[];
  members?: Array<{ id: string; name: string; profile: string }>;
}

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => (await api.get<AdminTeam[]>('/teams')).data,
  });
}

export function useTeam(id: string | undefined) {
  return useQuery({
    queryKey: ['team', id],
    queryFn: async () => (await api.get<AdminTeam>(`/teams/${id}`)).data,
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) =>
      (await api.post<AdminTeam>('/teams', { name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; active?: boolean };
    }) => (await api.patch<AdminTeam>(`/teams/${id}`, patch)).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', data.id] });
    },
  });
}

export function useSetTeamModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      modules,
    }: {
      id: string;
      modules: string[];
    }) =>
      (await api.put<AdminTeam>(`/teams/${id}/modules`, { modules })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', data.id] });
    },
  });
}

export interface ApprovalLevelInput {
  level: number;
  name: string;
  approverId: string;
  maxAmount?: number | null;
}

export function useSetApprovalLevels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      levels,
    }: {
      id: string;
      levels: ApprovalLevelInput[];
    }) =>
      (
        await api.put<AdminTeam>(`/teams/${id}/approval-levels`, { levels })
      ).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', data.id] });
    },
  });
}

/** Entrada usada nos dois endpoints de rateio (PUT branch/cc). */
export interface TeamRateioEntry {
  companyId: string;
  code: string;
}

export function useSetTeamBranchRateios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      rateios,
    }: {
      id: string;
      rateios: TeamRateioEntry[];
    }) =>
      (await api.put<AdminTeam>(`/teams/${id}/branch-rateios`, { rateios }))
        .data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', data.id] });
      // O combo do form precisa re-buscar depois que o admin libera/retira.
      qc.invalidateQueries({ queryKey: ['erp'] });
    },
  });
}

export function useSetTeamCcRateios() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      rateios,
    }: {
      id: string;
      rateios: TeamRateioEntry[];
    }) =>
      (await api.put<AdminTeam>(`/teams/${id}/cc-rateios`, { rateios })).data,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team', data.id] });
      qc.invalidateQueries({ queryKey: ['erp'] });
    },
  });
}

export function useDeactivateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<AdminTeam>(`/teams/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}
