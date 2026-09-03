import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PurchaseOrderConverterService } from '../purchase-orders/purchase-order-converter.service';
import { RequisitionStatus } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Recorrência em SÉRIE (RN-REQ-03 + decisão da PO, ago/2026).
 *
 * Quando uma requisição RECORRENTE aprovada é detectada, geramos a SÉRIE
 * INTEIRA de uma vez: N pedidos (N = `recurrenceMonths`), cada um com a
 * ENTREGA no mês k (base + (k-1) meses). O vencimento sai automático na
 * tela de Provisões (a view do Linx calcula ENTREGA + prazo da condição).
 * Isso substitui o antigo "pinga-a-pinga por cron" (uma requisição-rascunho
 * por mês, que exigia re-aprovação): aqui aprova a série UMA vez e os pedidos
 * já nascem pré-aprovados, com o cronograma inteiro visível.
 *
 * Cada mês vira uma filha (clone da requisição, `recurrenceParentId` = pai)
 * já APROVADA, convertida em pedido via o `convert()` normal (código testado
 * — não reimplementamos a gravação no Linx). `seriesGeneratedAt` no pai marca
 * que a série já saiu, pra o scan não regerar.
 *
 * O scan roda no tick (e pode ser chamado direto). A geração é best-effort
 * por mês: um mês que falha no convert fica logado e não derruba os demais.
 */
/** Requisição-pai (recorrente) com itens+rateios+empresa, pro clone da série. */
type RecurrenceParent = {
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
  recurrenceMonths: number | null;
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
};

@Injectable()
export class RequisitionRecurrenceService {
  private readonly logger = new Logger(RequisitionRecurrenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly notifications: NotificationsService,
    private readonly converter: PurchaseOrderConverterService,
  ) {}

  /** Tick diário às 07:00 local — varre recorrentes aprovadas sem série. */
  @Cron('0 0 7 * * *')
  async tick() {
    try {
      const result = await this.run();
      if (result.generated > 0) {
        this.logger.log(
          `Recorrência — séries geradas=${result.generated} pedidos=${result.pedidos}`,
        );
      }
    } catch (err) {
      this.logger.error(`Tick falhou: ${(err as Error).message}`);
    }
  }

  /**
   * Varre as requisições RECORRENTES aprovadas cuja série ainda não foi
   * gerada e gera cada uma. Pode ser chamado direto (testes / endpoint admin).
   */
  async run() {
    let generated = 0;
    let pedidos = 0;

    const parents = await this.prisma.requisition.findMany({
      where: {
        recurring: true,
        status: RequisitionStatus.APPROVED,
        recurrenceMonths: { not: null },
        seriesGeneratedAt: null,
        deletedAt: null,
      },
      include: {
        items: { include: { rateios: true } },
        company: { select: { code: true } },
      },
    });

    for (const parent of parents) {
      try {
        const n = await this.generateSeries(parent);
        if (n > 0) {
          generated++;
          pedidos += n;
        }
      } catch (err) {
        this.logger.error(
          `Falha ao gerar série de ${parent.number}: ${(err as Error).message}`,
        );
      }
    }
    return { generated, pedidos };
  }

  /**
   * Gera a série de uma requisição recorrente aprovada: N filhas (uma por
   * mês) já aprovadas + converte cada uma em pedido com a ENTREGA do mês.
   * Marca `seriesGeneratedAt` no pai ao final (mesmo com falhas parciais —
   * meses que falharam ficam como filha aprovada não-convertida, pra
   * reprocessar/investigar, e não são regerados).
   */
  private async generateSeries(parent: RecurrenceParent): Promise<number> {
    const n = parent.recurrenceMonths ?? 0;
    if (n < 1) return 0;

    const user = await this.buildRequesterUser(
      parent.requesterId,
      parent.companyId,
    );
    // Mês 1 = agora; meses seguintes = +1 mês na ENTREGA (dirige o vencimento
    // na provisão: vencimento = ENTREGA + prazo da condição de pagamento).
    const base = new Date();
    let count = 0;

    for (let k = 1; k <= n; k++) {
      const entrega = this.addMonths(base, k - 1);
      let child: { id: string; number: string } | null = null;
      try {
        child = await this.cloneApprovedChild(parent, k, n);
        await this.converter.convert(user, {
          requisitionId: child.id,
          expectedDelivery: entrega.toISOString(),
          paymentCondition: parent.paymentConditionCode ?? undefined,
        });
        count++;
      } catch (err) {
        this.logger.error(
          `Série ${parent.number} mês ${k}/${n}: ${(err as Error).message}` +
            (child ? ` (filha ${child.number} ficou aprovada não-convertida)` : ''),
        );
      }
    }

    await this.prisma.requisition.update({
      where: { id: parent.id },
      data: { seriesGeneratedAt: new Date() },
    });

    if (count > 0) {
      await this.notifications
        .create({
          companyId: parent.companyId,
          userId: parent.requesterId,
          type: 'REQUISITION_RECURRED',
          title: `Recorrência: ${count} pedido(s) gerado(s)`,
          body: `A série da requisição ${parent.number} gerou ${count} de ${n} pedido(s) mensal(is). O cronograma aparece em Financeiro → Provisões.`,
          entityType: 'REQUISITION',
          entityId: parent.id,
          sendEmail: true,
        })
        .catch(() => undefined);
    }
    return count;
  }

  /** Monta o AuthenticatedUser do solicitante (passa no own-only do convert). */
  private async buildRequesterUser(
    requesterId: string,
    companyId: string,
  ): Promise<AuthenticatedUser> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: requesterId },
      select: {
        id: true,
        name: true,
        adUsername: true,
        username: true,
        email: true,
        profile: true,
        status: true,
        teamId: true,
        realm: true,
        externalCategory: true,
      },
    });
    const companies = await this.prisma.userCompany.findMany({
      where: { userId: requesterId },
      select: { companyId: true },
    });
    const companyIds = companies.map((c) => c.companyId);
    if (!companyIds.includes(companyId)) companyIds.push(companyId);
    return { ...u, companyIds } as unknown as AuthenticatedUser;
  }

  /**
   * Clona a requisição-pai como filha do mês k (de N), já APROVADA — copia
   * itens e rateios. A filha não recorre (só o pai) e aponta pro pai via
   * `recurrenceParentId`. Como o pai já foi aprovado na cadeia, a filha
   * herda a aprovação (nasce APPROVED, pronta pro convert).
   */
  private async cloneApprovedChild(
    parent: RecurrenceParent,
    k: number,
    n: number,
  ): Promise<{ id: string; number: string }> {
    const number = await this.numbering.next(parent.company.code, 'REQ');
    const now = new Date();
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
        title: `${parent.title} (recorrência ${k}/${n})`,
        justification: parent.justification,
        tipoNotaFiscal: parent.tipoNotaFiscal,
        // Nasce APROVADA (herda a aprovação do pai) — pronta pro convert.
        status: RequisitionStatus.APPROVED,
        submittedAt: now,
        approvedAt: now,
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
