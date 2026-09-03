import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';

/** Representante ativo no Linx (view v_p2p_representantes). */
export interface RepresentanteErp {
  empresa: string;
  cod_representante: string;
  nome: string;
  documento: string | null;
}

/** Lista os representantes do Linx de uma empresa (para o admin escolher). */
export function useRepresentantesErp(empresa?: string) {
  return useQuery({
    queryKey: ['admin', 'representantes-erp', empresa],
    queryFn: async () =>
      (
        await api.get<RepresentanteErp[]>('/admin/representantes', {
          params: { empresa },
        })
      ).data,
    enabled: !!empresa,
    staleTime: 5 * 60_000,
  });
}

/** Provisiona o acesso externo do representante (cria + envia o link de senha). */
export function useProvisionRepresentante() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      empresa: string;
      codRepresentante: string;
      email: string;
    }) => (await api.post('/admin/representantes/provisionar', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
