import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { Paginated } from './requisitions';

/** Fornecedor novo aguardando (ou já resolvida) validação do Revisor. */
export interface SupplierValidation {
  id: string;
  companyId: string;
  requisitionId: string;
  status: 'PENDING' | 'APPROVED' | 'RETURNED';
  supplierCnpj: string;
  supplierErpCode: string | null;
  justification: string | null;
  decidedAt: string | null;
  createdAt: string;
  requisition: {
    id: string;
    number: string;
    totalAmount: string | number;
    supplierName: string | null;
    supplierCnpj: string | null;
    supplierFantasia: string | null;
    supplierUf: string | null;
    status: string;
    requester: { id: string; name: string };
  };
}

interface SupplierValidationList extends Paginated<SupplierValidation> {
  isReviewer: boolean;
}

export function useSupplierValidations(
  params: { status?: string; companyId?: string } = {},
) {
  return useQuery({
    queryKey: ['supplier-validations', params],
    queryFn: async () =>
      (
        await api.get<SupplierValidationList>('/supplier-validations', {
          params,
        })
      ).data,
  });
}

/** Aprova: cadastra o fornecedor no Linx e a requisição segue pra aprovação. */
export function useApproveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (requisitionId: string) =>
      (
        await api.post<SupplierValidation>(
          `/supplier-validations/${requisitionId}/approve`,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-validations'] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
}

/** Devolve ao solicitante com justificativa (requisição volta pra rascunho). */
export function useReturnSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requisitionId,
      justification,
    }: {
      requisitionId: string;
      justification: string;
    }) =>
      (
        await api.post<SupplierValidation>(
          `/supplier-validations/${requisitionId}/return`,
          { justification },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-validations'] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
}
