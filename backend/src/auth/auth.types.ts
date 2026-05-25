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
}

/** Par de tokens emitido no login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
