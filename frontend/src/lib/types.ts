/** Tipos compartilhados do domínio P2P. */

export interface AuthUser {
  id: string;
  adUsername: string;
  email: string;
  name: string;
  profile: string;
  status: string;
  teamId: string | null;
  companyIds: string[];
  /** Admin sempre true; demais perfis dependem da flag liberada pelo Admin. */
  canSwitchEnv?: boolean;
}

export interface Company {
  id: string;
  code: string;
  name: string;
}
