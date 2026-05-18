import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Protege rotas exigindo um JWT de acesso válido. */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
