/** Payload do JWT de acesso. */
export interface JwtPayload {
  sub: string; // userId
  email: string;
  name: string;
  profile: string;
  status: string;
  companyIds: string[];
}

/** Usuário autenticado anexado à request após o JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  email: string;
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
