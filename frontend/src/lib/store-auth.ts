import { api } from './api';

/** Resposta do pré-flight de login do vendedor (`/auth/store-lookup`). */
export interface StoreLookupResult {
  found: boolean;
  needsSetup: boolean;
  name: string | null;
  branches: Array<{
    companyCode: string;
    branchErpCode: string;
    branchName: string;
  }>;
}

export async function storeLookup(cpf: string): Promise<StoreLookupResult> {
  return (await api.post<StoreLookupResult>('/auth/store-lookup', { cpf })).data;
}

export async function storeSetupPassword(cpf: string, password: string) {
  return (
    await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/store-setup-password',
      { cpf, password },
    )
  ).data;
}

export async function storeLogin(cpf: string, password: string) {
  return (
    await api.post<{ accessToken: string; refreshToken: string }>(
      '/auth/store-login',
      { cpf, password },
    )
  ).data;
}
