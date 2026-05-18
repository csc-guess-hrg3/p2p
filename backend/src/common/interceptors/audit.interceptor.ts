import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../auth/auth.types';

/** Mapeia o primeiro segmento da rota para o nome da entidade auditada. */
const ENTITY_MAP: Record<string, string> = {
  requisitions: 'Requisition',
  'purchase-orders': 'PurchaseOrder',
  'fund-requests': 'FundRequest',
  receiving: 'Receiving',
  approvals: 'ApprovalStep',
  users: 'User',
  companies: 'Company',
};

/** Campos sensíveis mascarados nos snapshots (LGPD). */
const SENSITIVE = /(cnpj|cpf|cgc|banco|agencia|conta|pix|senha|password|token)/i;

interface AuditableRequest {
  method: string;
  path?: string;
  url: string;
  params: Record<string, string>;
  body: Record<string, unknown> | undefined;
  user?: AuthenticatedUser;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Interceptor global de auditoria.
 * Registra em `audit_logs` toda mutação (POST/PUT/PATCH/DELETE) bem-sucedida
 * feita por um usuário autenticado — atende ao RNF de auditoria e à RN-USR-03.
 *
 * Limitação conhecida: captura o estado final (`after`) a partir da resposta;
 * o snapshot `before` não é capturado neste nível (melhoria futura via
 * extensão do Prisma). A trilha de quem-fez-o-quê-quando está completa.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AuditableRequest>();
    const method = req.method?.toUpperCase();

    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((responseBody: unknown) => {
        // Falha de auditoria nunca quebra a requisição do usuário.
        void this.writeLog(req, responseBody).catch((e) =>
          this.logger.error(`Falha ao registrar auditoria: ${String(e)}`),
        );
      }),
    );
  }

  private async writeLog(
    req: AuditableRequest,
    responseBody: unknown,
  ): Promise<void> {
    const user = req.user;
    if (!user) return; // sem usuário autenticado, não audita

    const path = req.path ?? req.url.split('?')[0];
    const segments = path.replace(/^\/?(api\/)?/, '').split('/');
    const entityType = ENTITY_MAP[segments[0]] ?? segments[0];

    const response = this.asRecord(responseBody);
    const entityId =
      (response?.id as string | undefined) ?? req.params?.id ?? null;

    const companyId =
      (response?.companyId as string | undefined) ??
      (req.body?.companyId as string | undefined) ??
      user.companyIds[0];
    if (!companyId || !entityId) return; // sem contexto suficiente

    const action = this.resolveAction(req.method, path, req.body);
    const userAgent = req.headers['user-agent'];

    await this.prisma.auditLog.create({
      data: {
        companyId,
        userId: user.id,
        action,
        entityType,
        entityId,
        after: response ? JSON.stringify(this.mask(response)) : null,
        ipAddress: req.ip ?? null,
        userAgent: Array.isArray(userAgent)
          ? userAgent[0]
          : (userAgent ?? null),
      },
    });
  }

  private resolveAction(
    method: string,
    path: string,
    body: Record<string, unknown> | undefined,
  ): string {
    if (path.endsWith('/submit')) return 'SUBMIT';
    if (path.endsWith('/decide')) {
      return body?.approved === true ? 'APPROVE' : 'REJECT';
    }
    if (method === 'POST') return 'CREATE';
    if (method === 'PATCH' || method === 'PUT') return 'UPDATE';
    if (method === 'DELETE') return 'DELETE';
    return method;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  /** Mascara recursivamente campos sensíveis no snapshot. */
  private mask(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map((v) => this.mask(v));
    if (obj && typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] =
          SENSITIVE.test(k) && v != null && v !== ''
            ? '***'
            : this.mask(v);
      }
      return out;
    }
    return obj;
  }
}
