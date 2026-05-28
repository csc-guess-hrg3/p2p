import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import type { ErpSupplier } from './integration';

export interface QuotationItem {
  id: string;
  position: number;
  description: string;
  unit: string | null;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
}

export interface Quotation {
  id: string;
  requisitionId: string;
  attachmentId: string | null;
  supplierCnpj: string;
  supplierName: string;
  supplierErpCode: string | null;
  paymentConditionCode: string | null;
  paymentConditionDesc: string | null;
  totalAmount: string;
  notes: string | null;
  isWinner: boolean;
  selectedAt: string | null;
  /** Justificativa preenchida pelo aprovador no momento da seleção. */
  selectionReason: string | null;
  createdAt: string;
  attachment?: {
    id: string;
    filename: string;
    mimeType: string;
  } | null;
  createdBy?: { name: string } | null;
  selectedBy?: { name: string } | null;
  items: QuotationItem[];
}

export interface QuotationInput {
  attachmentId?: string;
  supplierCnpj: string;
  supplierNameOverride?: string;
  paymentConditionCode?: string;
  notes?: string;
  items: Array<{
    description: string;
    unit?: string;
    quantity: number;
    unitPrice: number;
  }>;
}

export function useQuotations(requisitionId: string | undefined) {
  return useQuery({
    queryKey: ['quotations', requisitionId],
    enabled: !!requisitionId,
    queryFn: async () =>
      (await api.get<Quotation[]>(`/requisitions/${requisitionId}/quotations`))
        .data,
  });
}

export function useCreateQuotation(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: QuotationInput) =>
      (
        await api.post<Quotation>(
          `/requisitions/${requisitionId}/quotations`,
          dto,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      // Invalida lista de anexos — o anexo associado ganhou `quotation`
      // no backend, o que faz a lista geral filtrar com `hideLinkedQuotations`.
      // Sem invalidar, o anexo continua aparecendo na lista até refresh manual.
      qc.invalidateQueries({ queryKey: ['attachments', 'requisition', requisitionId] });
    },
  });
}

export function useUpdateQuotation(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      dto,
    }: {
      id: string;
      dto: Partial<QuotationInput>;
    }) => (await api.patch<Quotation>(`/quotations/${id}`, dto)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', requisitionId] });
    },
  });
}

export function useDeleteQuotation(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/quotations/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      // Quando a cotação é removida, o anexo pode reaparecer na lista
      // geral (perde o vínculo) — invalida pra refletir corretamente.
      qc.invalidateQueries({ queryKey: ['attachments', 'requisition', requisitionId] });
    },
  });
}

/**
 * Restaura a proposta original do solicitante — descarta a cotação
 * vencedora atual. Usado quando o aprovador muda de ideia depois de
 * escolher uma alternativa. O backend tem o snapshot dos dados originais.
 */
export function useClearWinningQuotation(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (
        await api.post(
          `/requisitions/${requisitionId}/quotations/clear-winner`,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

export function useSelectWinningQuotation(requisitionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) =>
      (
        await api.post<Quotation>(`/quotations/${args.id}/select`, {
          reason: args.reason,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      qc.invalidateQueries({ queryKey: ['requisitions'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
  });
}

/**
 * Lookup de fornecedor por CNPJ no ERP. Devolve null se não encontrado.
 * Usado pelo dialog de cotação pra auto-preencher o nome.
 */
export async function lookupSupplierByCnpj(
  companyCode: string,
  cnpj: string,
): Promise<ErpSupplier | null> {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length < 11) return null;
  try {
    const res = await api.get(
      `/integration/${companyCode}/supplier-by-cnpj`,
      { params: { cnpj: clean } },
    );
    if ((res.data as { found?: boolean }).found === false) return null;
    return res.data as ErpSupplier;
  } catch {
    return null;
  }
}

/**
 * Consulta dados públicos do CNPJ na Receita (via BrasilAPI proxy do
 * backend). Usada como fallback quando o fornecedor não está no ERP —
 * traz razão social, endereço, CNAE, etc. pro solicitante só digitar o CNPJ.
 */
export interface PublicCnpjData {
  found: true;
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacao: string | null;
  email: string | null;
  telefone: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  cnaePrincipal: string | null;
  dataAbertura: string | null;
}

export async function lookupCnpjPublic(
  companyCode: string,
  cnpj: string,
): Promise<PublicCnpjData | null> {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return null;
  try {
    const res = await api.get(`/integration/${companyCode}/cnpj-public`, {
      params: { cnpj: clean },
    });
    if ((res.data as { found?: boolean }).found === false) return null;
    return res.data as PublicCnpjData;
  } catch {
    return null;
  }
}

/** Máscara visual de CNPJ XX.XXX.XXX/XXXX-XX (parcial conforme digita). */
export function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
