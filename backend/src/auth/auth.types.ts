/** Payload do JWT de acesso. */
export interface JwtPayload {
  sub: string; // userId
  adUsername: string;
  email: string | null;
  name: string;
  profile: string;
  status: string;
  companyIds: string[];
}

/** Usuário autenticado anexado à request após o JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  adUsername: string;
  email: string | null;
  name: string;
  profile: string;
  status: string;
  companyIds: string[];
}

/** Par de tokens emitido no login/refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
