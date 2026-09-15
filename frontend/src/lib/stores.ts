import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export type StoreProvisionStatus =
  | 'PROVISIONED'
  | 'SKIPPED_NO_EMAIL'
  | 'ALREADY'
  | 'ERROR';

export interface StoreProvisionResult {
  branchErpCode: string;
  status: StoreProvisionStatus;
  detail?: string;
  userId?: string;
  username?: string;
}

/** Provisiona o acesso de UMA loja (um login por filial) e envia o link de senha. */
export function useProvisionStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      empresa: string;
      branchErpCode: string;
      teamId?: string | null;
    }) =>
      (await api.post<StoreProvisionResult>('/admin/stores/provisionar', input))
        .data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches-admin'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/** Provisiona TODAS as filiais ativas com e-mail; devolve o relatório por filial. */
export function useProvisionAllStores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { empresa: string; teamId?: string | null }) =>
      (
        await api.post<StoreProvisionResult[]>(
          '/admin/stores/provisionar-todas',
          input,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches-admin'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

/**
 * Cola `código;email` por loja: grava o e-mail em cada filial e provisiona num
 * passo só, pulando quem já tem acesso. Devolve o relatório por filial.
 */
export function useImportProvisionStores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      empresa: string;
      itens: { branchErpCode: string; email: string }[];
      teamId?: string | null;
    }) =>
      (
        await api.post<StoreProvisionResult[]>(
          '/admin/stores/importar-provisionar',
          input,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branches-admin'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
