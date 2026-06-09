import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RequisitionStatus } from '../common/enums';

/**
 * PRD RN-REQ-03 — recorrências automáticas.
 *
 * Toda requisição APROVADA com `recurring=true` ganha um agendamento
 * (`nextRecurrenceAt = approvedAt + recurrenceMonths meses`). O cron
 * diário (07:00) varre essas requisições, e quando a data chega, clona
 * a requisição como DRAFT — o solicitante recebe uma cópia nova pra
 * ajustar e submeter.
 *
 * Filhas geradas referenciam o pai via `recurrenceParentId`. O pai
 * tem `nextRecurrenceAt` empurrado +N meses a cada geração.
 *
 * Estratégia preguiçosa: o agendamento inicial (de requisições aprovadas
 * antes desta feature, ou sem nextRecurrenceAt) é calculado no próprio
 * tick — não precisa alterar o fluxo de aprovação existente.
 */
@Injectable()
export class RequisitionRecurrenceService {
  private readonly logger = new Logger(RequisitionRecurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Tick diário às 07:00 local. */
  @Cron('0 0 7 * * *')
  async tick() {
    try {
      const result = await this.run();
      if (result.generated > 0 || result.scheduled > 0) {
        this.logger.log(
          `Recorrência — geradas=${result.generated} agendadas=${result.scheduled}`,
        );
      }
    } catch (err) {
      this.logger.error(`Tick falhou: ${(err as Error).message}`);
    }
  }

  /**
   * Run principal — pode ser chamado direto (testes / endpoint admin).
   * Retorna contadores pra observabilidade.
   */
  async run() {
    const now = new Date();
    let scheduled = 0;
    let generated = 0;

    // 1) Agendamento inicial: recurring sem nextRecurrenceAt.
    const toSchedule = await this.prisma.requisition.findMany({
      where: {
        recurring: true,
        status: RequisitionStatus.APPROVED,
        nextRecurrenceAt: null,
        recurrenceMonths: { not: null },
        approvedAt: { not: null },
        deletedAt: null,
      },
      select: {
        id: true,
        approvedAt: true,
        recurrenceMonths: true,
      },
    });
    for (const r of toSchedule) {
      const next = this.addMonths(r.approvedAt!, r.recurrenceMonths!);
      await this.prisma.requisition.update({
        where: { id: r.id },
        data: { nextRecurrenceAt: next },
      });
      scheduled++;
    }

    // 2) Materialização: requisições com nextRecurrenceAt <= now.
    const dueParents = await this.prisma.requisition.findMany({
      where: {
        recurring: true,
        nextRecurrenceAt: { lte: now },
        deletedAt: null,
      },
      include: {
        items: { include: { rateios: true } },
        company: { select: { code: true } },
      },
    });
    for (const parent of dueParents) {
      try {
        const child = await this.cloneAsDraft(parent);
        const next = this.addMonths(
          parent.nextRecurrenceAt!,
          parent.recurrenceMonths!,
        );
        await this.prisma.requisition.update({
          where: { id: parent.id },
          data: { nextRecurrenceAt: next },
        });
        // Notifica o solicitante para revisar/submeter a nova requisição.
        await this.notifications
          .create({
            companyId: parent.companyId,
            userId: parent.requesterId,
            type: 'REQUISITION_RECURRED',
            title: `Recorrência: nova requisição ${child.number}`,
            body: `Foi gerada automaticamente uma cópia da requisição ${parent.number} para revisão e submissão.`,
            entityType: 'REQUISITION',
            entityId: child.id,
            sendEmail: true,
          })
          .catch(() => undefined);
        generated++;
      } catch (err) {
        this.logger.error(
          `Falha ao gerar filha de ${parent.number}: ${(err as Error).message}`,
        );
      }
    }
    return { scheduled, generated };
  }

  /**
   * Clona a requisição como DRAFT — copia itens e rateios mas zera
   * estado de aprovação. Mantém solicitante/equipe da original.
   * O título recebe sufixo "(recorrência YYYY-MM-DD)" pra o usuário
   * identificar facilmente que veio do job.
   */
  private async cloneAsDraft(parent: {
    id: string;
    number: string;
    companyId: string;
    branchErpCode: string;
    branchName: string;
    supplierErpCode: string | null;
    supplierName: string;
    requesterId: string;
    teamId: string | null;
    title: string;
    justification: string | null;
    tipoNotaFiscal: string;
    paymentConditionCode: string | null;
    paymentConditionDesc: string | null;
    contractRef: string | null;
    tipoCompra: string | null;
    totalAmount: import('@prisma/client').Prisma.Decimal;
    company: { code: string };
    items: Array<{
      itemErpCode: string | null;
      itemDescription: string;
      quantity: import('@prisma/client').Prisma.Decimal;
      unit: string;
      estimatedPrice: import('@prisma/client').Prisma.Decimal;
      totalPrice: import('@prisma/client').Prisma.Decimal;
      accountingAccount: string;
      accountName: string | null;
      branchRateioCode: string;
      branchRateioDesc: string | null;
      costCenterRateioCode: string;
      costCenterRateioDesc: string | null;
      notes: string | null;
      rateios: Array<{
        kind: string;
        rateioCode: string;
        targetCode: string;
        branchCode: string | null;
        percentage: import('@prisma/client').Prisma.Decimal;
        amount: import('@prisma/client').Prisma.Decimal;
      }>;
    }>;
  }) {
    const number = await this.numbering.next(parent.company.code, 'REQ');
    const stamp = new Date().toLocaleDateString('pt-BR');
    const created = await this.prisma.requisition.create({
      select: { id: true, number: true },
      data: {
        number,
        companyId: parent.companyId,
        branchErpCode: parent.branchErpCode,
        branchName: parent.branchName,
        supplierErpCode: parent.supplierErpCode,
        supplierName: parent.supplierName,
        requesterId: parent.requesterId,
        teamId: parent.teamId,
        title: `${parent.title} (recorrência ${stamp})`,
        justification: parent.justification,
        tipoNotaFiscal: parent.tipoNotaFiscal,
        status: RequisitionStatus.DRAFT,
        totalAmount: parent.totalAmount,
        paymentConditionCode: parent.paymentConditionCode,
        paymentConditionDesc: parent.paymentConditionDesc,
        contractRef: parent.contractRef,
        tipoCompra: parent.tipoCompra,
        recurring: false, // a filha não recorre — só o pai.
        recurrenceParentId: parent.id,
        items: {
          create: parent.items.map((it) => ({
            itemErpCode: it.itemErpCode,
            itemDescription: it.itemDescription,
            quantity: it.quantity,
            unit: it.unit,
            estimatedPrice: it.estimatedPrice,
            totalPrice: it.totalPrice,
            accountingAccount: it.accountingAccount,
            accountName: it.accountName,
            branchRateioCode: it.branchRateioCode,
            branchRateioDesc: it.branchRateioDesc,
            costCenterRateioCode: it.costCenterRateioCode,
            costCenterRateioDesc: it.costCenterRateioDesc,
            notes: it.notes,
            rateios: {
              create: it.rateios.map((r) => ({
                kind: r.kind,
                rateioCode: r.rateioCode,
                targetCode: r.targetCode,
                branchCode: r.branchCode,
                percentage: r.percentage,
                amount: r.amount,
              })),
            },
          })),
        },
      },
    });
    this.logger.log(`Recorrência: ${parent.number} -> ${number}`);
    return created;
  }

  /**
   * Soma `months` ao timestamp preservando dia/hora. Se o dia não
   * existir no mês destino (31 jan + 1 mês), JS já volta pro último
   * dia válido — comportamento aceitável.
   */
  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }
}
