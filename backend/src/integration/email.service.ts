import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { PurchaseOrder, PurchaseOrderItem } from '@prisma/client';
import { SecretService } from '../common/crypto/secret.service';

interface SendOptions {
  to: string;
  subject?: string;
  bodyText?: string;
  fromAddress?: string;
  fromName?: string;
}

/**
 * Envio de e-mail do Pedido de Compra ao fornecedor.
 * SMTP é por empresa (`company_erp_configs.smtp*`). O assunto e corpo
 * usam templates da config (ou fallbacks razoáveis se faltarem).
 *
 * O PDF do pedido é gerado em memória (pdfkit) e anexado ao e-mail.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretService,
  ) {}

  /** Gera o PDF do PC em memória e devolve um Buffer. */
  async renderPurchaseOrderPdf(
    po: PurchaseOrder & { items: PurchaseOrderItem[] },
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (b) => chunks.push(b as Buffer));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Cabeçalho
      doc.fontSize(18).text('Pedido de Compra', { align: 'right' });
      doc.fontSize(11).text(`Nº ${po.number}`, { align: 'right' });
      if (po.erpPedido) {
        doc.text(`Ref. ERP: ${po.erpPedido}`, { align: 'right' });
      }
      doc.moveDown();

      // Dados do pedido
      doc.fontSize(11).text(`Fornecedor: ${po.supplierName}`);
      doc.text(`Filial: ${po.branchName}`);
      if (po.paymentCondition) doc.text(`Condição: ${po.paymentCondition}`);
      if (po.expectedDelivery) {
        doc.text(
          `Entrega prevista: ${po.expectedDelivery.toLocaleDateString('pt-BR')}`,
        );
      }
      if (po.deliveryAddress) doc.text(`Endereço: ${po.deliveryAddress}`);
      doc.moveDown();

      // Itens
      doc.fontSize(12).text('Itens', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      for (const it of po.items) {
        const qty = Number(it.quantity).toLocaleString('pt-BR');
        const unit = Number(it.unitPrice).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        const total = Number(it.totalPrice).toLocaleString('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        });
        doc.text(
          `• ${it.itemDescription}  —  ${qty} ${it.unit} × ${unit} = ${total}`,
        );
      }
      doc.moveDown();

      // Total
      const totalAmount = Number(po.totalAmount).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      doc
        .fontSize(12)
        .text(`Total: ${totalAmount}`, { align: 'right', underline: true });

      doc.end();
    });
  }

  /**
   * Renderiza assunto/corpo a partir dos templates da empresa.
   * Variáveis suportadas: {{numero}} {{fornecedor}} {{total}} {{filial}}
   *                       {{empresa}}
   */
  private render(
    template: string | null,
    fallback: string,
    vars: Record<string, string>,
  ): string {
    let out = template || fallback;
    for (const [k, v] of Object.entries(vars)) {
      out = out.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v);
    }
    return out;
  }

  /**
   * Envia o PC ao fornecedor por SMTP. Usa a config SMTP da empresa.
   * `opts.to` é obrigatório (já vem do diálogo, podendo ser sobrescrito
   * pelo comprador). Anexa o PDF gerado em memória.
   */
  async sendPurchaseOrderEmail(
    po: PurchaseOrder & { items: PurchaseOrderItem[] },
    opts: SendOptions,
  ): Promise<{ messageId?: string }> {
    if (!opts.to) {
      throw new BadRequestException('E-mail do destinatário não informado.');
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
      include: { erpConfig: true },
    });
    const cfg = company.erpConfig;
    if (!cfg?.smtpHost || !cfg?.smtpPort || !cfg?.smtpFrom) {
      throw new BadRequestException(
        `SMTP não configurado para a empresa ${company.code}. ` +
          `Preencha smtpHost/smtpPort/smtpFrom em company_erp_configs.`,
      );
    }

    // SMTP password é armazenado criptografado (AES-256-GCM com chave em env).
    // Em modo passthrough (sem SECRET_ENCRYPTION_KEY), decrypt devolve plain.
    const smtpPass = this.secrets.decrypt(cfg.smtpPassword) ?? '';
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: smtpPass } : undefined,
    });

    const vars = {
      numero: po.number,
      erp: po.erpPedido ?? '',
      fornecedor: po.supplierName,
      filial: po.branchName,
      empresa: company.code,
      total: Number(po.totalAmount).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
    };
    const subject =
      opts.subject ??
      this.render(
        cfg.emailSubjectTemplate,
        'Pedido de Compra {{numero}} — {{empresa}}',
        vars,
      );
    const body =
      opts.bodyText ??
      this.render(
        cfg.emailBodyTemplate,
        'Prezados,\n\nSegue em anexo o Pedido de Compra {{numero}} ' +
          'no valor total de {{total}}.\n\nAtenciosamente,\n{{empresa}}.',
        vars,
      );

    const pdf = await this.renderPurchaseOrderPdf(po);
    const info = await transporter.sendMail({
      from: `"${opts.fromName ?? cfg.smtpFromName ?? company.name}" <${opts.fromAddress ?? cfg.smtpFrom}>`,
      to: opts.to,
      subject,
      text: body,
      attachments: [
        {
          filename: `PC-${po.number}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ],
    });
    this.logger.log(
      `E-mail PC ${po.number} enviado para ${opts.to} (msgId=${info.messageId})`,
    );
    return { messageId: info.messageId };
  }
}
