import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Aciona a autenticação LDAP na rota de login. */
@Injectable()
export class LdapAuthGuard extends AuthGuard('ldap') {}
