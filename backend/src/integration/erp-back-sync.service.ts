import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { safeDbName } from '../common/erp/safe-db-name';
import { sanitizeErpErrorDetail } from '../common/erp/erp-error-sanitizer';
import {
  IntegrationLogStatus,
  PurchaseOrderStatus,
} from '../common/enums';

/**
 * "Mão de volta" do ERP — cron que lê o estado real dos pedidos no Linx
 * e atualiza o P2P em consequência.
 *
 * Por que existe:
 *   Quando o P2P grava um PC no Linx, o número do pedido (`erpPedido`)
 *   e o status `INTEGRATED` são salvos no P2P. A partir daí, o ciclo
 *   continua FORA do P2P: o financeiro recebe a NF, o almoxarifado
 *   confirma entrega, o pedido pode ser cancelado pelo comprador
 *   diretamente no Linx, etc. Sem este cron, o P2P fica congelado
 *   em INTEGRATED pra sempre, mesmo que o pedido já tenha sido recebido
 *   ou cancelado no ERP.
 *
 * O que faz:
 *   1. Pega todos os PCs do P2P em status APPROVED/INTEGRATED/
 *      PARTIALLY_RECEIVED que têm erpPedido preenchido.
 *   2. Pra cada um, consulta COMPRAS_CONSUMIVEL no Linx pegando
 *      QTDE_ORIGINAL, QTDE_ENTREGUE, QTDE_CANCEL_PEDIDO de cada item.
 *   3. Mapeia os items do PC P2P aos do Linx pelo itemErpCode (ordenado
 *      pra estabilidade) e:
 *      - Atualiza `purchase_order_items.receivedQty` (do P2P) com
 *        QTDE_ENTREGUE do Linx (fonte da verdade — Linx tem a baixa
 *        real via entrada de NF).
 *      - Atualiza `purchase_order_items.cancelledQty` com
 *        QTDE_CANCEL_PEDIDO.
 *   4. Recalcula o status do PC:
 *      - Se TODOS os items têm cancelledQty == quantity → CANCELLED
 *      - Senão se SUM(receivedQty + cancelledQty) >= SUM(quantity) → FULLY_RECEIVED
 *      - Senão se algum item tem receivedQty > 0 → PARTIALLY_RECEIVED
 *      - Senão mantém o status atual.
 *   5. Loga em integration_logs cada execução (sucesso/falha) pra
 *      auditoria — mesmo padrão dos outros jobs.
 *
 * Cadência: a cada 15 minutos (configurável). Cada execução roda em
 * batch sequencial pra não sobrecarregar o Linx — uma query por PC
 * com NOLOCK, agrupada por (PEDIDO, CONSUMIVEL).
 *
 * Limites/Bug-watch:
 *   - Idempotente: só atualiza o status se mudou.
 *   - Cancelamento parcial no Linx (QTDE_CANCEL_PEDIDO > 0 mas
 *     QTDE_CANCEL_PEDIDO < QTDE_ORIGINAL) NÃO move o PC pra CANCELLED;
 *     apenas reflete o `cancelledQty` no item.
 *   - PCs em DRAFT/REJECTED/CANCELLED no P2P são ignorados.
 *   - Falha numa empresa não derruba as outras — try/catch por empresa.
 */
@Injectable()
export class ErpBackSyncService {
  private readonly logger = new Logger(ErpBackSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Roda a cada 15 minutos. Em PROD pode ser puxado pra 5min se a
   * operação exigir reflexão mais rápida do Linx → P2P; tem que medir
   * o load no Linx primeiro (cada execução faz N queries cross-db).
   */
  /**
   * Consulta read-through pro estado atual de um PC no Linx — não toca
   * em nada do P2P, só lê e devolve. Usado pela UI do detalhe do PC
   * quando o user clica "Atualizar do Linx" pra ver o estado real
   * sem esperar o cron de 30min.
   */
  async readErpStatusByPedido(
    erpDbName: string,
    erpPedido: string,
  ): Promise<{
    items: Array<{
      codigo: string | null;
      consumivel: string | null;
      qtde_original: number;
      qtde_entregue: number;
      qtde_cancel_pedido: number;
      qtde_entregar: number;
      valor_original: number;
      valor_entregue: number;
      valor_entregar: number;
    }>;
    cabecalho: {
      status_compra: string | null;
      status_aprovacao: string | null;
      lx_status_compra: number | null;
      data_aprovacao: Date | null;
      aprovado_por: string | null;
    } | null;
  }> {
    const db = safeDbName(erpDbName);
    // Sanitiza o pedido: só dígitos/letras (PEDIDO Linx é alfanumérico
    // curto, ex.: '60246'). Defense-in-depth contra interpolação direta.
    const pedido = erpPedido.replace(/[^0-9A-Za-z]/g, '').slice(0, 20);
    const items = await this.prisma.$queryRawUnsafe<
      Array<{
        codigo: string | null;
        consumivel: string | null;
        qtde_original: number;
        qtde_entregue: number;
        qtde_cancel_pedido: number;
        qtde_entregar: number;
        valor_original: number;
        valor_entregue: number;
        valor_entregar: number;
      }>
    >(
      `SELECT CODIGO_ITEM AS codigo, CONSUMIVEL AS consumivel,
              SUM(QTDE_ORIGINAL) AS qtde_original,
              SUM(QTDE_ENTREGUE) AS qtde_entregue,
              SUM(QTDE_CANCEL_PEDIDO) AS qtde_cancel_pedido,
              SUM(QTDE_ENTREGAR) AS qtde_entregar,
              SUM(VALOR_ORIGINAL) AS valor_original,
              SUM(VALOR_ENTREGUE) AS valor_entregue,
              SUM(VALOR_ENTREGAR) AS valor_entregar
         FROM [${db}].dbo.COMPRAS_CONSUMIVEL WITH (NOLOCK)
        WHERE PEDIDO = '${pedido}'
        GROUP BY CODIGO_ITEM, CONSUMIVEL`,
    );
    const cabecalho = await this.prisma.$queryRawUnsafe<
      Array<{
        status_compra: string | null;
        status_aprovacao: string | null;
        lx_status_compra: number | null;
        data_aprovacao: Date | null;
        aprovado_por: string | null;
      }>
    >(
      `SELECT TOP 1
              RTRIM(STATUS_COMPRA) AS status_compra,
              RTRIM(STATUS_APROVACAO) AS status_aprovacao,
              LX_STATUS_COMPRA AS lx_status_compra,
              DATA_APROVACAO AS data_aprovacao,
              RTRIM(APROVADOR_POR) AS aprovado_por
         FROM [${db}].dbo.COMPRAS WITH (NOLOCK)
        WHERE PEDIDO = '${pedido}'`,
    );
    return {
      items,
      cabecalho: cabecalho[0] ?? null,
    };
  }

  @Cron(CronExpression.EVERY_30_MINUTES, { name: 'erp-back-sync' })
  async syncAll(): Promise<void> {
    const started = Date.now();
    const open = await this.prisma.purchaseOrder.findMany({
      where: {
        deletedAt: null,
        erpPedido: { not: null },
        status: {
          in: [
            PurchaseOrderStatus.APPROVED,
            PurchaseOrderStatus.INTEGRATED,
            PurchaseOrderStatus.PARTIALLY_RECEIVED,
          ],
        },
      },
      include: {
        items: true,
        company: { select: { id: true, code: true, erpDbName: true } },
      },
    });

    if (open.length === 0) {
      this.logger.debug('erp-back-sync: nenhum PC pra sincronizar');
      return;
    }

    let updated = 0;
    let errors = 0;
    // Agrupa por empresa pra dar pra fazer log granular e isolar falhas.
    type OpenPo = (typeof open)[number];
    const byCompany = new Map<string, OpenPo[]>();
    for (const po of open) {
      const arr = byCompany.get(po.companyId) ?? [];
      arr.push(po);
      byCompany.set(po.companyId, arr);
    }

    for (const [companyId, pos] of byCompany) {
      const company = pos[0].company;
      try {
        for (const po of pos) {
          try {
            const wasUpdated = await this.syncOne(po, company.erpDbName);
            if (wasUpdated) updated++;
          } catch (err) {
            errors++;
            this.logger.warn(
              `erp-back-sync ${company.code}: falha em PC ${po.number} (erpPedido=${po.erpPedido}): ${(err as Error).message}`,
            );
          }
        }
        await this.prisma.integrationLog.create({
          data: {
            companyId,
            source: company.code === 'HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
            jobType: 'BACK_SYNC',
            status:
              errors === 0
                ? IntegrationLogStatus.SUCCESS
                : IntegrationLogStatus.PARTIAL,
            recordsProcessed: pos.length,
            durationMs: Date.now() - started,
            errorDetails:
              errors > 0
                ? `${errors} pedido(s) falharam (ver warns no log)`
                : null,
          },
        });
      } catch (err) {
        this.logger.error(
          `erp-back-sync ${company.code}: falha geral — ${(err as Error).message}`,
        );
        await this.prisma.integrationLog.create({
          data: {
            companyId,
            source: company.code === 'HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
            jobType: 'BACK_SYNC',
            status: IntegrationLogStatus.FAILED,
            recordsProcessed: 0,
            durationMs: Date.now() - started,
            errorDetails: sanitizeErpErrorDetail(err),
          },
        });
      }
    }

    this.logger.log(
      `erp-back-sync concluído: ${open.length} PC analisado(s), ${updated} atualizado(s), ${errors} falha(s) em ${Date.now() - started}ms`,
    );
  }

  /**
   * Sincroniza um PC. Retorna true se algo mudou (status do PC ou
   * receivedQty/cancelledQty de algum item).
   */
  private async syncOne(
    po: {
      id: string;
      number: string;
      erpPedido: string | null;
      status: string;
      items: Array<{
        id: string;
        itemErpCode: string | null;
        quantity: { toString(): string };
        receivedQty: { toString(): string };
        cancelledQty: { toString(): string };
      }>;
    },
    erpDbName: string,
  ): Promise<boolean> {
    if (!po.erpPedido) return false;
    const db = safeDbName(erpDbName);
    // Linx armazena PEDIDO como char(8) com padding. Compara como string.
    // Sanitiza pedido pra defense-in-depth (interpolação direta).
    const pedido = po.erpPedido.replace(/[^0-9A-Za-z]/g, '').slice(0, 20);

    // Soma do Linx por itemErpCode (cobre caso de múltiplas linhas pro
    // mesmo item, raríssimo mas possível no Linx). NOLOCK pra não
    // travar com a operação do Linx.
    const linxRows = await this.prisma.$queryRawUnsafe<
      Array<{
        codigo: string | null;
        consumivel: string | null;
        qtde_original: number;
        qtde_entregue: number;
        qtde_cancel_pedido: number;
      }>
    >(
      `SELECT CODIGO_ITEM AS codigo, CONSUMIVEL AS consumivel,
              SUM(QTDE_ORIGINAL) AS qtde_original,
              SUM(QTDE_ENTREGUE) AS qtde_entregue,
              SUM(QTDE_CANCEL_PEDIDO) AS qtde_cancel_pedido
         FROM [${db}].dbo.COMPRAS_CONSUMIVEL WITH (NOLOCK)
        WHERE PEDIDO = '${pedido}'
        GROUP BY CODIGO_ITEM, CONSUMIVEL`,
    );

    if (linxRows.length === 0) {
      // Pedido sumiu do Linx — não deveria acontecer normalmente.
      this.logger.warn(
        `erp-back-sync: PC ${po.number} (erpPedido=${pedido}) sem linhas em COMPRAS_CONSUMIVEL.`,
      );
      return false;
    }

    let anyItemChanged = false;
    // Mapeia por itemErpCode (e fallback por CONSUMIVEL = código do P2P).
    for (const it of po.items) {
      if (!it.itemErpCode) continue; // item sem código no ERP — não dá pra sync
      const row =
        linxRows.find((r) => r.codigo === it.itemErpCode) ??
        linxRows.find((r) => r.consumivel === it.itemErpCode);
      if (!row) continue;
      const newReceived = Number(row.qtde_entregue ?? 0).toFixed(4);
      const newCancelled = Number(row.qtde_cancel_pedido ?? 0).toFixed(4);
      const oldReceived = Number(it.receivedQty.toString()).toFixed(4);
      const oldCancelled = Number(it.cancelledQty.toString()).toFixed(4);
      if (newReceived !== oldReceived || newCancelled !== oldCancelled) {
        await this.prisma.purchaseOrderItem.update({
          where: { id: it.id },
          data: {
            receivedQty: newReceived,
            cancelledQty: newCancelled,
          },
        });
        anyItemChanged = true;
      }
    }

    // Recalcula status do PC com base nos novos números (lê de novo pra
    // pegar os valores recém-atualizados — barato porque já está em
    // cache da transação).
    const itemsNow = await this.prisma.purchaseOrderItem.findMany({
      where: { purchaseOrderId: po.id },
      select: { quantity: true, receivedQty: true, cancelledQty: true },
    });
    const sumQty = itemsNow.reduce((s, x) => s + Number(x.quantity), 0);
    const sumReceived = itemsNow.reduce(
      (s, x) => s + Number(x.receivedQty),
      0,
    );
    const sumCancelled = itemsNow.reduce(
      (s, x) => s + Number(x.cancelledQty),
      0,
    );

    let newStatus: string | null = null;
    if (sumQty > 0 && sumCancelled >= sumQty) {
      newStatus = PurchaseOrderStatus.CANCELLED;
    } else if (sumQty > 0 && sumReceived + sumCancelled >= sumQty) {
      newStatus = PurchaseOrderStatus.FULLY_RECEIVED;
    } else if (sumReceived > 0) {
      newStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
    }

    let statusChanged = false;
    if (newStatus && newStatus !== po.status) {
      await this.prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: newStatus },
      });
      statusChanged = true;
      this.logger.log(
        `erp-back-sync: PC ${po.number} ${po.status} → ${newStatus} (recebido=${sumReceived}/${sumQty}, cancelado=${sumCancelled})`,
      );
    }

    return anyItemChanged || statusChanged;
  }
}
