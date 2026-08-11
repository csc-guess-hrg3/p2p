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
}

/** Par de tokens emitido no login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
