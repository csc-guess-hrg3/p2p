import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
 * E-mail é opcional (`sendEmail: true`) e usa o SMTP da empresa
 * configurado em CompanyErpConfig. Falha de e-mail não bloqueia o
 * registro in-app.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
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

  /** Envia e-mail via SMTP da empresa — silencioso se config faltar. */
  private async sendEmail(params: CreateNotificationParams): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: params.companyId },
      include: { erpConfig: true },
    });
    const cfg = company?.erpConfig;
    if (!cfg?.smtpHost || !cfg?.smtpPort || !cfg?.smtpFrom) return;
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { name: true, email: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE' || !user.email) return;

    const smtpPass = this.secrets.decrypt(cfg.smtpPassword) ?? '';
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: cfg.smtpUser
        ? { user: cfg.smtpUser, pass: smtpPass }
        : undefined,
    });
    const link = this.linkFor(params.entityType, params.entityId);
    const linkLine = link
      ? `\n\nAcesse: https://p2p.hrg3.com.br${link}\n`
      : '';
    await transporter.sendMail({
      from: `"${cfg.smtpFromName ?? company?.name ?? 'P2P'}" <${cfg.smtpFrom}>`,
      to: user.email,
      subject: params.title,
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
