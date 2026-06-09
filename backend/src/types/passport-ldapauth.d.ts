// Declaração mínima — o pacote passport-ldapauth não publica @types.
declare module 'passport-ldapauth' {
  import { Strategy as PassportStrategy } from 'passport';

  export interface LdapServerOptions {
    url: string;
    bindDN?: string;
    bindCredentials?: string;
    searchBase: string;
    searchFilter: string;
    searchAttributes?: string[];
    tlsOptions?: Record<string, unknown>;
  }

  export interface LdapStrategyOptions {
    server: LdapServerOptions;
    usernameField?: string;
    passwordField?: string;
    passReqToCallback?: boolean;
    credentialsLookup?: (req: unknown) => {
      username: string;
      password: string;
    };
  }

  export type VerifyCallback = (
    user: Record<string, unknown> | false,
    info?: unknown,
  ) => void;

  export class Strategy extends PassportStrategy {
    constructor(
      options: LdapStrategyOptions,
      verify?: (user: Record<string, unknown>, done: VerifyCallback) => void,
    );
    name: string;
  }
}
