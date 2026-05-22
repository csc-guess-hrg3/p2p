import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../prisma/prisma.service';
import { SecretService } from '../common/crypto/secret.service';

/**
 * Notifica o aprovador de Produto Acabado (diretor da marca) quando
 * surge um pedido novo em status 'E' (em estudo) no ERP.
 *
 * Estratégia:
 *  - Cron a cada 15 minutos varre cada empresa que tem `paApproverUserId`
 *    + SMTP configurados.
 *  - Lê v_p2p_product_orders com `status_efetivo='E'` (corte 2025+).
 *  - Para cada pedido sem entrada em `pa_approval_notifications`, dispara
 *    e-mail e marca como enviado. Falha não bloqueia os próximos — fica
 *    logada com `success=0` e o próximo tick reaproveita (até teto de
 *    tentativas, pra não ficar martelando SMTP quebrado eternamente).
 */
@Injectable()
export class PaNotificationService {
  private readonly logger = new Logger(PaNotificationService.name);
  /** Limite de tentativas por pedido — depois disso, só intervenção manual. */
  private readonly MAX_ATTEMPTS = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
  ) {}

  /** Tick principal. Roda a cada 15 min em prod; pode chamar manual no /admin. */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async tick() {
    try {
      const result = await this.run();
      if (result.sent > 0 || result.failed > 0) {
        this.logger.log(
          `PA notify tick — enviados=${result.sent} falhas=${result.failed} ` +
            `pendentes=${result.pending}`,
        );
      }
    } catch (err) {
      this.logger.error(`Tick falhou: ${(err as Error).message}`);
    }
  }

  /** Varredura completa. Devolve contadores pra dashboard/health checks. */
  async run() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      include: { erpConfig: true },
    });
    let sent = 0;
    let failed = 0;
    let pending = 0;

    for (const company of companies) {
      const cfg = company.erpConfig;
      if (!cfg?.paApproverUserId) continue;
      if (!cfg.smtpHost || !cfg.smtpPort || !cfg.smtpFrom) continue;

      const approver = await this.prisma.user.findUnique({
        where: { id: cfg.paApproverUserId },
        select: { id: true, name: true, email: true, status: true },
      });
      if (!approver || approver.status !== 'ACTIVE' || !approver.email) {
        continue;
      }

      // Pedidos pendentes do ERP (cross-database via view).
      const candidates = await this.prisma.$queryRaw<
        { pedido: string; fornecedor: string; tot_valor_original: number }[]
      >`
        SELECT TOP 100 pedido, fornecedor, tot_valor_original
        FROM dbo.v_p2p_product_orders
        WHERE empresa = ${company.code}
          AND status_efetivo = 'E'
          AND emissao >= '2025-01-01'`;

      for (const c of candidates) {
        const existing = await this.prisma.paApprovalNotification.findUnique({
          where: {
            companyId_pedido: { companyId: company.id, pedido: c.pedido },
          },
        });
        if (existing?.success) continue;
        if (existing && existing.attemptCount >= this.MAX_ATTEMPTS) {
          continue;
        }
        pending++;

        try {
          await this.sendOne(
            company.id,
            company.code,
            company.name,
            cfg,
            approver.email,
            approver.name,
            c.pedido,
            c.fornecedor,
            c.tot_valor_original,
          );
          await this.prisma.paApprovalNotification.upsert({
            where: {
              companyId_pedido: { companyId: company.id, pedido: c.pedido },
            },
            create: {
              companyId: company.id,
              pedido: c.pedido,
              approverEmail: approver.email,
              success: true,
            },
            update: {
              success: true,
              errorMessage: null,
              lastAttempt: new Date(),
              attemptCount: { increment: 1 },
            },
          });
          sent++;
        } catch (err) {
          const message = (err as Error).message.slice(0, 480);
          await this.prisma.paApprovalNotification.upsert({
            where: {
              companyId_pedido: { companyId: company.id, pedido: c.pedido },
            },
            create: {
              companyId: company.id,
              pedido: c.pedido,
              approverEmail: approver.email,
              success: false,
              errorMessage: message,
            },
            update: {
              success: false,
              errorMessage: message,
              lastAttempt: new Date(),
              attemptCount: { increment: 1 },
            },
          });
          failed++;
        }
      }
    }
    return { sent, failed, pending };
  }

  private async sendOne(
    _companyId: string,
    companyCode: string,
    companyName: string,
    cfg: {
      smtpHost: string | null;
      smtpPort: number | null;
      smtpUser: string | null;
      smtpPassword: string | null;
      smtpSecure: boolean;
      smtpFrom: string | null;
      smtpFromName: string | null;
    },
    to: string,
    approverName: string,
    pedido: string,
    fornecedor: string,
    valorTotal: number,
  ) {
    const smtpPass = this.secrets.decrypt(cfg.smtpPassword) ?? '';
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost!,
      port: cfg.smtpPort!,
      secure: cfg.smtpSecure,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: smtpPass } : undefined,
    });
    const valor = Number(valorTotal).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    const subject = `Pedido de Produto Acabado ${pedido} aguarda aprovação — ${companyCode}`;
    const text =
      `Olá ${approverName},\n\n` +
      `Você tem um pedido de Produto Acabado aguardando sua aprovação:\n\n` +
      `  Pedido: ${pedido}\n` +
      `  Fornecedor: ${fornecedor}\n` +
      `  Valor total: ${valor}\n` +
      `  Empresa: ${companyName}\n\n` +
      `Acesse o P2P para aprovar ou reprovar:\n` +
      `  https://p2p.hrg3.com.br/pedidos-pa/${pedido}\n\n` +
      `Mensagem automática.`;
    await transporter.sendMail({
      from: `"${cfg.smtpFromName ?? companyName}" <${cfg.smtpFrom}>`,
      to,
      subject,
      text,
    });
  }
}
