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

/**
 * Campos sensíveis mascarados nos snapshots (LGPD / segurança).
 * Cobre dados pessoais (email, phone, CPF, CNPJ, endereço, CEP) e
 * segredos (senha, token, chave, banco, pix).
 */
const SENSITIVE =
  /(cnpj|cpf|cgc|banco|agencia|conta|pix|senha|password|token|email|phone|telefone|celular|endereco|address|cep|zipcode|logradouro|complemento|bairro|cidade|estado|uf|rg|nascimento|birth)/i;

/** Tamanho máximo do JSON serializado de `after` (bytes). Payloads maiores
 *  (ex.: rawXmlBase64 de NFes) seriam inúteis no log e inflariam a tabela.  */
const MAX_AFTER_BYTES = 32_768; // 32 KB

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
          this.logger.error(
            `Falha ao registrar auditoria [${req.method} ${req.path ?? req.url}]: ${String(e)}`,
            e instanceof Error ? e.stack : undefined,
          ),
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
        after: response ? this.serializeAfter(this.mask(response)) : null,
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

  /**
   * Serializa o payload `after` com limite de tamanho.
   * Campos com XML/base64 (rawXmlBase64, pdf, etc.) podem chegar a MBs —
   * guardar isso no audit_log seria inútil e inflaria muito a tabela.
   */
  private serializeAfter(masked: unknown): string {
    const full = JSON.stringify(masked);
    if (full.length <= MAX_AFTER_BYTES) return full;
    // Payload grande: reduz a um stub explicativo + tamanho original.
    return JSON.stringify({
      _truncated: true,
      _originalBytes: full.length,
      _hint: 'payload excedeu 32 KB; consulte a entidade diretamente',
    });
  }

  /** Mascara recursivamente campos sensíveis no snapshot. */
  private mask(obj: unknown): unknown {
    if (Array.isArray(obj)) return obj.map((v) => this.mask(v));
    if (obj && typeof obj === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        out[k] =
          SENSITIVE.test(k) && v != null && v !== '' ? '***' : this.mask(v);
      }
      return out;
    }
    return obj;
  }
}
