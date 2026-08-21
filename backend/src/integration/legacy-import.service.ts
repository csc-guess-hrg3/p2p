import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { safeDbName } from '../common/erp/safe-db-name';

interface CompraRow {
  pedido: string;
  fornecedor: string;
  fornecedorNome: string | null;
  filial: string;
  condicaoPgto: string | null;
  transportadora: string | null;
  emissao: Date | null;
  totalValor: number | null;
  statusCompra: string | null;
  dataAprovacao: Date | null;
  requeridoPor: string | null;
  obs: string | null;
}

interface ConsumivelRow {
  pedido: string;
  consumivel: string | null;
  descConsumivel: string | null;
  unidade: string | null;
  qtdeOriginal: number | null;
  qtdeEntregue: number | null;
  qtdeCancel: number | null;
  custo: number | null;
  valorOriginal: number | null;
  contaContabil: string | null;
  rateioFilial: string | null;
  rateioCc: string | null;
}

/**
 * Cutover de pedidos — Fase 1: importa os pedidos de compra do Linx que NUNCA
 * passaram pelo P2P (externos) para dentro de `purchase_orders` com
 * `origin='EXTERNO'`, tornando a tabela própria a fonte única e aposentando o
 * read-through de `/legacy-orders`.
 *
 * Decisões (PO): só os EM ABERTO (saldo a entregar > 0); read-only (Fase 1, sem
 * controle de saldo — isso é D-01/Fase 2). Princípio de ouro: o import NÃO zera
 * saldo — `quantity=QTDE_ORIGINAL`, `receivedQty=QTDE_ENTREGUE`,
 * `cancelledQty=QTDE_CANCEL_PEDIDO`; a baixa segue via escrituração refletida
 * pelo erp-back-sync. Idempotente por (companyId, erpPedido): já importado =
 * pulado (o back-sync o mantém fresco).
 */
@Injectable()
export class LegacyImportService {
  private readonly logger = new Logger(LegacyImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Mapa STATUS_COMPRA do Linx → status canônico do P2P. */
  private mapStatus(statusCompra: string | null): string {
    switch ((statusCompra ?? '').trim().toUpperCase()) {
      case 'C':
        return 'CANCELLED';
      case 'E':
        return 'FULLY_RECEIVED';
      // 'A' (ativo, com saldo) e demais → INTEGRATED: entra no filtro do
      // erp-back-sync, que refina p/ PARTIALLY_RECEIVED conforme os recebimentos.
      default:
        return 'INTEGRATED';
    }
  }

  async importExternos(
    companyId: string,
  ): Promise<{ created: number; skipped: number; itemsCreated: number }> {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, erpDbName: true },
    });
    if (!company) throw new BadRequestException('Empresa inválida.');
    const db = safeDbName(company.erpDbName);

    // Capas EM ABERTO (saldo a entregar > 0), de consumível, que não são P2P
    // (o write-path grava OBS='P2P PC <número>').
    const capas = await this.prisma.$queryRawUnsafe<CompraRow[]>(`
      SELECT RTRIM(c.PEDIDO) AS pedido, RTRIM(c.FORNECEDOR) AS fornecedor,
             cf.NOME_CLIFOR AS fornecedorNome, RTRIM(c.FILIAL_A_ENTREGAR) AS filial,
             c.CONDICAO_PGTO AS condicaoPgto, c.TRANSPORTADORA AS transportadora,
             c.EMISSAO AS emissao, c.TOT_VALOR_ORIGINAL AS totalValor,
             RTRIM(c.STATUS_COMPRA) AS statusCompra, c.DATA_APROVACAO AS dataAprovacao,
             RTRIM(c.REQUERIDO_POR) AS requeridoPor, c.OBS AS obs
        FROM [${db}].dbo.COMPRAS c WITH (NOLOCK)
        LEFT JOIN [${db}].dbo.FORNECEDORES fo WITH (NOLOCK)
          ON RTRIM(fo.FORNECEDOR) = RTRIM(c.FORNECEDOR)
        LEFT JOIN [${db}].dbo.CADASTRO_CLI_FOR cf WITH (NOLOCK)
          ON RTRIM(cf.CLIFOR) = RTRIM(fo.CLIFOR)
       WHERE c.TABELA_FILHA = 'COMPRAS_CONSUMIVEL'
         AND c.TOT_QTDE_ENTREGAR > 0
         AND (c.OBS IS NULL OR c.OBS NOT LIKE 'P2P PC%')
    `);
    if (capas.length === 0) {
      return { created: 0, skipped: 0, itemsCreated: 0 };
    }

    // Já importados (idempotência por erpPedido na empresa).
    const pedidos = capas.map((c) => c.pedido);
    const existing = await this.prisma.purchaseOrder.findMany({
      where: { companyId, erpPedido: { in: pedidos } },
      select: { erpPedido: true },
    });
    const existingSet = new Set(existing.map((e) => e.erpPedido));
    const toImport = capas.filter((c) => !existingSet.has(c.pedido));
    if (toImport.length === 0) {
      return { created: 0, skipped: capas.length, itemsCreated: 0 };
    }

    // Itens de todos os pedidos a importar (1 query em lote).
    const inList = toImport.map((c) => `'${c.pedido.replace(/'/g, "''")}'`).join(',');
    const itensRows = await this.prisma.$queryRawUnsafe<ConsumivelRow[]>(`
      SELECT RTRIM(i.PEDIDO) AS pedido, RTRIM(i.CONSUMIVEL) AS consumivel,
             i.DESC_CONSUMIVEL AS descConsumivel, RTRIM(i.UNIDADE) AS unidade,
             i.QTDE_ORIGINAL AS qtdeOriginal, i.QTDE_ENTREGUE AS qtdeEntregue,
             i.QTDE_CANCEL_PEDIDO AS qtdeCancel, i.CUSTO AS custo,
             i.VALOR_ORIGINAL AS valorOriginal, RTRIM(i.CONTA_CONTABIL) AS contaContabil,
             RTRIM(i.RATEIO_FILIAL) AS rateioFilial, RTRIM(i.RATEIO_CENTRO_CUSTO) AS rateioCc
        FROM [${db}].dbo.COMPRAS_CONSUMIVEL i WITH (NOLOCK)
       WHERE RTRIM(i.PEDIDO) IN (${inList})
    `);
    const itensByPedido = new Map<string, ConsumivelRow[]>();
    for (const it of itensRows) {
      const arr = itensByPedido.get(it.pedido) ?? [];
      arr.push(it);
      itensByPedido.set(it.pedido, arr);
    }

    // Resolve REQUERIDO_POR (login AD) → User; sem match, buyerId=null.
    const logins = [
      ...new Set(
        toImport.map((c) => (c.requeridoPor ?? '').trim().toLowerCase()).filter(Boolean),
      ),
    ];
    const users = logins.length
      ? await this.prisma.user.findMany({
          where: { adUsername: { in: logins } },
          select: { id: true, adUsername: true },
        })
      : [];
    const userByLogin = new Map(users.map((u) => [u.adUsername ?? '', u.id]));

    let created = 0;
    let itemsCreated = 0;
    for (const c of toImport) {
      const itens = itensByPedido.get(c.pedido) ?? [];
      const emissao = c.emissao ?? new Date();
      const buyerId =
        userByLogin.get((c.requeridoPor ?? '').trim().toLowerCase()) ?? null;
      try {
        await this.prisma.purchaseOrder.create({
          data: {
            number: `EXT-${c.pedido}`.slice(0, 20),
            origin: 'EXTERNO',
            requisitionId: null,
            teamId: null,
            companyId,
            branchErpCode: c.filial || '',
            branchName: c.filial || '(sem filial)',
            supplierErpCode: c.fornecedor || '',
            supplierName: (c.fornecedorNome ?? '').trim() || c.fornecedor || '(sem fornecedor)',
            buyerId,
            status: this.mapStatus(c.statusCompra),
            paymentCondition: c.condicaoPgto?.trim() || null,
            transportadora: c.transportadora?.trim()?.slice(0, 25) || null,
            totalAmount: c.totalValor ?? 0,
            notes: c.obs?.trim() || null,
            erpPedido: c.pedido,
            integratedAt: emissao,
            approvedAt: c.dataAprovacao ?? null,
            createdAt: emissao,
            items: {
              create: itens.map((it) => ({
                itemErpCode: it.consumivel || null,
                itemDescription: it.descConsumivel?.trim() || '(sem descrição)',
                unit: it.unidade?.trim() || 'UN',
                quantity: it.qtdeOriginal ?? 0,
                receivedQty: it.qtdeEntregue ?? 0,
                cancelledQty: it.qtdeCancel ?? 0,
                unitPrice: it.custo ?? 0,
                totalPrice: it.valorOriginal ?? 0,
                accountingAccount: it.contaContabil?.trim() || '',
                branchRateioCode: it.rateioFilial?.trim() || '',
                costCenterRateioCode: it.rateioCc?.trim() || '',
              })),
            },
          },
        });
        created++;
        itemsCreated += itens.length;
      } catch (err) {
        this.logger.error(
          `Falha ao importar pedido externo ${c.pedido}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Import externos ${db}: ${created} criados, ${capas.length - toImport.length} já existiam, ${itemsCreated} itens.`,
    );
    return {
      created,
      skipped: capas.length - toImport.length,
      itemsCreated,
    };
  }
}
