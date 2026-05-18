import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-ldapauth';

/**
 * Estratégia LDAP — autentica contra o Active Directory on-premise.
 * O bind é feito com a conta de serviço (P2P Service); em seguida o
 * passport-ldapauth busca o usuário e revalida com a senha informada.
 *
 * O objeto retornado por validate() é a entrada LDAP do usuário —
 * o AuthService faz o provisionamento JIT a partir dele.
 */
@Injectable()
export class LdapStrategy extends PassportStrategy(Strategy, 'ldap') {
  constructor(config: ConfigService) {
    super({
      server: {
        url: config.getOrThrow<string>('LDAP_URL'),
        bindDN: config.getOrThrow<string>('LDAP_BIND_DN'),
        bindCredentials: config.getOrThrow<string>('LDAP_BIND_PASSWORD'),
        searchBase: config.getOrThrow<string>('LDAP_BASE_DN'),
        // login por UPN (usuario@dominio) ou sAMAccountName
        searchFilter:
          '(|(userPrincipalName={{username}})(sAMAccountName={{username}}))',
        searchAttributes: [
          'displayName',
          'cn',
          'mail',
          'userPrincipalName',
          'sAMAccountName',
        ],
      },
      usernameField: 'username',
      passwordField: 'password',
    });
  }

  validate(user: Record<string, unknown>): Record<string, unknown> {
    return user;
  }
}
