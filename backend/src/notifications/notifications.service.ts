import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { SecretService } from '../common/crypto/secret.service';
import { AuthenticatedUser } from '../auth/auth.types';

interface CreateNotificationParams {
  companyId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  /** Quando true, dispara também e-mail (se SMTP da empresa estiver configurado). */
  sendEmail?: boolean;
}

/**
 * Notificações in-app + e-mail.
 *
 * In-app é o caminho padrão (toda criação grava em `notifications`).
 * E-mail é opcional (`sendEmail: true`).
 *
 * Estratégia SMTP (decisão 2026-05-25):
 *  - Há **um único SMTP corporativo** configurado via env (`SMTP_HOST`,
 *    `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
 *    `SMTP_FROM_NAME`). Vale para todas as empresas (Guess, HRG3, …).
 *  - O subject sempre é prefixado com `[CODIGO_EMPRESA]` para o
 *    destinatário saber de qual empresa veio o evento.
 *  - Se uma `CompanyErpConfig.smtp*` estiver preenchida no banco,
 *    ela **sobrescreve** o global para aquela empresa específica (caso
 *    raro — uma empresa precisar de servidor próprio). É o caminho de
 *    escape, não o padrão.
 *  - Falha de e-mail nunca bloqueia o registro in-app.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
    private readonly config: ConfigService,
  ) {}

  /** Cria notificação (e dispara e-mail se solicitado). */
  async create(params: CreateNotificationParams): Promise<void> {
    await this.prisma.notification.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        type: params.type,
        title: params.title.slice(0, 255),
        body: params.body,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
      },
    });
    if (params.sendEmail) {
      // Não bloqueia se falhar — fica só o in-app.
      void this.sendEmail(params).catch((err) =>
        this.logger.warn(
          `Falha ao enviar e-mail (notif ${params.type} → user ${params.userId}): ${(err as Error).message}`,
        ),
      );
    }
  }

  /** Feed das notificações do usuário (mais recentes primeiro). */
  async listMine(user: AuthenticatedUser, onlyUnread = false) {
    return this.prisma.notification.findMany({
      where: {
        userId: user.id,
        companyId: { in: user.companyIds },
        ...(onlyUnread ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Contagem de não-lidas — alimenta o badge do sino. */
  async unreadCount(user: AuthenticatedUser): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId: user.id,
        companyId: { in: user.companyIds },
        readAt: null,
      },
    });
  }

  /** Marca uma notificação como lida. */
  async markRead(user: AuthenticatedUser, id: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== user.id) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    if (n.readAt) return;
    await this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Marca todas as não-lidas do usuário como lidas. */
  async markAllRead(user: AuthenticatedUser): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        userId: user.id,
        companyId: { in: user.companyIds },
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  /**
   * Resolve a configuração SMTP para uma empresa. Prioridade:
   *   1. `company_erp_configs.smtp*` (override por empresa) — se host
   *      e from estiverem preenchidos.
   *   2. envs `SMTP_*` (caminho normal — único SMTP corporativo).
   * Retorna null se nenhum dos dois estiver configurado.
   */
  private resolveSmtpConfig(
    erpCfg: {
      smtpHost: string | null;
      smtpPort: number | null;
      smtpSecure: boolean | null;
      smtpUser: string | null;
      smtpPassword: string | null;
      smtpFrom: string | null;
      smtpFromName: string | null;
    } | null,
  ) {
    if (erpCfg?.smtpHost && erpCfg.smtpPort && erpCfg.smtpFrom) {
      return {
        host: erpCfg.smtpHost,
        port: erpCfg.smtpPort,
        secure: erpCfg.smtpSecure ?? false,
        user: erpCfg.smtpUser ?? null,
        password: this.secrets.decrypt(erpCfg.smtpPassword) ?? '',
        from: erpCfg.smtpFrom,
        fromName: erpCfg.smtpFromName ?? null,
        source: 'company' as const,
      };
    }
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 0);
    const from = this.config.get<string>('SMTP_FROM');
    if (!host || !port || !from) return null;
    return {
      host,
      port,
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      user: this.config.get<string>('SMTP_USER') ?? null,
      password: this.config.get<string>('SMTP_PASSWORD') ?? '',
      from,
      fromName: this.config.get<string>('SMTP_FROM_NAME') ?? 'P2P',
      source: 'env' as const,
    };
  }

  /** Envia e-mail via SMTP único corporativo; silencioso se nada configurado. */
  private async sendEmail(params: CreateNotificationParams): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: params.companyId },
      include: { erpConfig: true },
    });
    const smtp = this.resolveSmtpConfig(company?.erpConfig ?? null);
    if (!smtp) {
      this.logger.debug(
        `SMTP não configurado — pulando e-mail (notif ${params.type})`,
      );
      return;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { name: true, email: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE' || !user.email) return;

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
    const link = this.linkFor(params.entityType, params.entityId);
    const linkLine = link ? `\n\nAcesse: https://p2p.hrg3.com.br${link}\n` : '';
    // Subject prefixado com a empresa, pra o destinatário identificar de
    // qual contexto veio (Guess vs HRG3 num único inbox).
    const prefix = company?.code ? `[${company.code}] ` : '';
    await transporter.sendMail({
      from: `"${smtp.fromName ?? company?.name ?? 'P2P'}" <${smtp.from}>`,
      to: user.email,
      subject: `${prefix}${params.title}`,
      text: `Olá ${user.name},\n\n${params.body}${linkLine}\n\nMensagem automática.`,
    });
  }

  /**
   * Constrói o link relativo a partir do entityType — convenção fixa
   * pra evitar passar URL nos pontos de chamada.
   */
  private linkFor(
    entityType?: string | null,
    entityId?: string | null,
  ): string | null {
    if (!entityType || !entityId) return null;
    switch (entityType) {
      case 'REQUISITION':
      case 'Requisition':
        return `/requisicoes/${entityId}`;
      case 'PURCHASE_ORDER':
      case 'PurchaseOrder':
        return `/pedidos/${entityId}`;
      case 'FUND_REQUEST':
      case 'FundRequest':
        return `/solicitacoes-verba/${entityId}`;
      case 'PRODUCT_ORDER_PA':
        return `/pedidos-pa/${entityId}`;
      default:
        return null;
    }
  }
}
