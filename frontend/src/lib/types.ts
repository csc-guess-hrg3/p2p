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
  /**
   * Módulos extras liberados pela equipe do usuário — destravam itens de
   * menu/rota que o perfil sozinho não veria. Ex.: 'PA', 'FISCAL_QUEUE'.
   */
  extraModules?: string[];
  /** INTERNAL (app interno) | EXTERNAL (Área Externa / portal). */
  realm?: string;
  /** Categoria do usuário externo (REPRESENTANTE | VENDEDOR_LOJA); null se interno. */
  externalCategory?: string | null;
}

export interface Company {
  id: string;
  code: string;
  name: string;
}
