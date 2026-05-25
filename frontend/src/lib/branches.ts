import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

export interface BranchWithExtras {
  codigo: string;
  nome: string;
  razaoSocial: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  tipo: string | null;
  inativo: boolean;
  /** E-mail definido pelo Admin em `branch_extensions`. */
  email: string | null;
}

export function useBranchesAdmin(companyId: string | undefined) {
  return useQuery({
    queryKey: ['branches-admin', companyId],
    enabled: !!companyId,
    queryFn: async () =>
      (await api.get<BranchWithExtras[]>('/branches', { params: { companyId } }))
        .data,
  });
}

export function useSetBranchEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      companyId,
      code,
      email,
    }: {
      companyId: string;
      code: string;
      email: string | null;
    }) =>
      (
        await api.put(
          `/branches/${encodeURIComponent(code)}/email`,
          { email },
          { params: { companyId } },
        )
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches-admin'] }),
  });
}
