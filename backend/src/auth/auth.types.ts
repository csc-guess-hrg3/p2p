/** Payload do JWT de acesso. */
export interface JwtPayload {
  sub: string; // userId
  /** adUsername é nulo para usuários LOCAL (supervisores, vendedores). */
  adUsername: string | null;
  email: string;
  name: string;
  profile: string;
  status: string;
  teamId: string | null;
  companyIds: string[];
  /** INTERNAL (app corporativo) | EXTERNAL (Área Externa / portal). */
  realm: string;
  /** Categoria do usuário externo (REPRESENTANTE | VENDEDOR_LOJA | ...); null se INTERNAL. */
  externalCategory: string | null;
  /**
   * Simulação de login: id do ADMIN real que está "vendo como" este usuário.
   * null em sessão normal. A identidade EFETIVA é a deste payload (o alvo);
   * `impersonatedBy` só serve p/ auditoria e p/ sair da simulação.
   */
  impersonatedBy?: string | null;
}

/** Usuário autenticado anexado à request após o JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  adUsername: string | null;
  email: string;
  name: string;
  profile: string;
  status: string;
  teamId: string | null;
  companyIds: string[];
  /** INTERNAL (app corporativo) | EXTERNAL (Área Externa / portal). */
  realm: string;
  /** Categoria do usuário externo (REPRESENTANTE | VENDEDOR_LOJA | ...); null se INTERNAL. */
  externalCategory: string | null;
  /** Simulação de login: id do ADMIN real que está "vendo como" este usuário. */
  impersonatedBy?: string | null;
}

/** Par de tokens emitido no login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
