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
}

export interface Company {
  id: string;
  code: string;
  name: string;
}
