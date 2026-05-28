import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { QiveClientService } from '../integration/qive-client.service';
import { parseNfeBase64, ParsedNfe, ParsedNfeItem } from '../integration/nfe-parser';
import { IntegrationLogStatus } from '../common/enums';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Domínio de documentos fiscais (NFe) — MVP só vincula manualmente ao PC.
 *
 * Pipeline:
 *  1) Cron horário puxa NFes "received" da Qive (paginado por cursor).
 *  2) Parser leve extrai os campos essenciais (chave, emit, dest, vNF, itens).
 *  3) Roteia pela CNPJ destinatária → Company (match por raiz — 8 chars).
 *  4) Marca status INTERNAL quando emitente é da própria empresa
 *     (transferência interna entre filiais — não vira PC).
 *  5) Operador olha a lista PENDING e vincula manualmente ao PC,
 *     ou marca IGNORED.
 *
 * Integração futura com o robô de escrituração: o XML cru fica salvo em
 * rawXmlBase64; basta exportar pra fila do robô quando o status virar
 * LINKED + manifestação OK. Não é escopo do MVP.
 */
@Injectable()
export class FiscalDocumentsService {
  private readonly logger = new Logger(FiscalDocumentsService.name);

  // Limite por execução do cron — protege o cron de rodar 2h se a Qive
  // tiver acumulado muita coisa. Próxima execução pega o resto.
  private readonly MAX_PAGES_PER_RUN = 20;
  private readonly PAGE_SIZE = 50;
  private readonly SLEEP_BETWEEN_PAGES_MS = 200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly qive: QiveClientService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // CRON — sincronização periódica com a Qive
  // ──────────────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR, { name: 'qive-nfe-sync' })
  async syncAllScheduled(): Promise<void> {
    try {
      await this.syncAll();
    } catch (err) {
      this.logger.error(
        `qive-nfe-sync falhou: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Roda uma rodada completa de sync — uma execução por (companyId, role).
   * Idempotente: NFes já gravadas (accessKey UNIQUE) são puladas.
   */
  async syncAll(role: 'received' = 'received'): Promise<{
    companiesProcessed: number;
    nfesInserted: number;
    nfesSkipped: number;
  }> {
    const started = Date.now();
    const companies = await this.prisma.company.findMany({
      where: { active: true, deletedAt: null, cnpj: { not: null } },
      select: { id: true, code: true, cnpj: true, name: true },
    });

    let totalInserted = 0;
    let totalSkipped = 0;

    // Estratégia: uma única chamada à Qive pega NFes de TODOS os CNPJs
    // da conta (não passamos cnpj[] no filtro). Roteamos no P2P pela
    // raiz do CNPJ destinatário (8 primeiros chars).
    // Cursor é por role (compartilhado entre empresas) — usamos um
    // "syncState global" gravado na primeira company (pra simplificar).
    const anchorCompany = companies[0];
    if (!anchorCompany) {
      this.logger.warn('qive-nfe-sync: nenhuma empresa ativa com CNPJ');
      return { companiesProcessed: 0, nfesInserted: 0, nfesSkipped: 0 };
    }

    const state = await this.prisma.fiscalDocumentSyncState.upsert({
      where: {
        companyId_role: { companyId: anchorCompany.id, role },
      },
      create: { companyId: anchorCompany.id, role, lastCursor: 0 },
      update: {},
    });

    let cursor = state.lastCursor ?? 0;
    let pages = 0;
    let lastError: string | null = null;

    try {
      while (pages < this.MAX_PAGES_PER_RUN) {
        const res = await this.qive.listNfes({
          role,
          cursor,
          limit: this.PAGE_SIZE,
        });
        const items = res.data ?? [];
        if (items.length === 0) break;

        for (const item of items) {
          const parsed = parseNfeBase64(item.xml);
          if (!parsed) {
            this.logger.warn(
              `qive-nfe-sync: XML não parseável (chave=${item.access_key})`,
            );
            totalSkipped++;
            continue;
          }
          const inserted = await this.upsertParsed(
            parsed,
            item.xml,
            cursor,
            companies,
          );
          if (inserted) totalInserted++;
          else totalSkipped++;
        }

        // Próximo cursor: vem em page.next como URL completa — extraímos.
        const nextCursor = this.extractCursor(res.page?.next);
        if (nextCursor == null || nextCursor === cursor) break;
        cursor = nextCursor;
        pages++;
        await this.sleep(this.SLEEP_BETWEEN_PAGES_MS);
      }
    } catch (err) {
      lastError = (err as Error).message;
      this.logger.error(`qive-nfe-sync: ${lastError}`);
    }

    await this.prisma.fiscalDocumentSyncState.update({
      where: {
        companyId_role: { companyId: anchorCompany.id, role },
      },
      data: {
        lastCursor: cursor,
        lastSyncAt: new Date(),
        lastError: lastError?.slice(0, 1900) ?? null,
      },
    });

    await this.prisma.integrationLog.create({
      data: {
        companyId: anchorCompany.id,
        source: 'QIVE',
        jobType: 'QIVE_NFE_SYNC',
        status: lastError
          ? IntegrationLogStatus.FAILED
          : IntegrationLogStatus.SUCCESS,
        recordsProcessed: totalInserted + totalSkipped,
        durationMs: Date.now() - started,
        errorDetails: lastError?.slice(0, 1900) ?? null,
      },
    });

    this.logger.log(
      `qive-nfe-sync concluído: ${totalInserted} novas, ${totalSkipped} puladas, cursor=${cursor}, em ${Date.now() - started}ms`,
    );

    return {
      companiesProcessed: companies.length,
      nfesInserted: totalInserted,
      nfesSkipped: totalSkipped,
    };
  }

  /** Roteamento + persistência de uma NFe individual. Idempotente por accessKey. */
  private async upsertParsed(
    parsed: ParsedNfe,
    rawBase64: string,
    cursor: number,
    companies: Array<{
      id: string;
      code: string;
      cnpj: string | null;
      name: string;
    }>,
  ): Promise<boolean> {
    // Já existe? pula.
    const existing = await this.prisma.fiscalDocument.findUnique({
      where: { accessKey: parsed.accessKey },
      select: { id: true },
    });
    if (existing) return false;

    // Match por raiz de CNPJ (8 primeiros chars).
    const destRaiz = parsed.dest.cnpj.slice(0, 8);
    const emitRaiz = parsed.emit.cnpj.slice(0, 8);
    const company = companies.find((c) => {
      if (!c.cnpj) return false;
      const raiz = c.cnpj.replace(/\D/g, '').slice(0, 8);
      return raiz === destRaiz;
    });
    if (!company) {
      this.logger.warn(
        `qive-nfe-sync: NFe ${parsed.accessKey} — destCnpj ${parsed.dest.cnpj} não bate com nenhuma Company`,
      );
      return false;
    }

    const isInternal = emitRaiz === destRaiz;

    await this.prisma.fiscalDocument.create({
      data: {
        companyId: company.id,
        type: 'NFe',
        accessKey: parsed.accessKey,
        qiveCursor: cursor,
        supplierCnpj: parsed.emit.cnpj,
        supplierName: parsed.emit.nome.slice(0, 255),
        destCnpj: parsed.dest.cnpj,
        destName: parsed.dest.nome?.slice(0, 255) ?? null,
        numero: parsed.numero,
        serie: parsed.serie,
        natOp: parsed.natOp?.slice(0, 255) ?? null,
        valorTotal: parsed.valorTotal,
        emissao: parsed.emissao ?? new Date(),
        status: isInternal ? 'INTERNAL' : 'PENDING',
        rawXmlBase64: rawBase64,
        itemsJson: JSON.stringify(parsed.items satisfies ParsedNfeItem[]),
      },
    });
    return true;
  }

  private extractCursor(nextUrl?: string): number | null {
    if (!nextUrl) return null;
    const m = nextUrl.match(/[?&]cursor=(\d+)/);
    return m ? Number(m[1]) : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ──────────────────────────────────────────────────────────────────
  // QUERIES
  // ──────────────────────────────────────────────────────────────────

  async findAll(
    user: AuthenticatedUser,
    opts: {
      status?: string;
      supplierCnpj?: string;
      search?: string;
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(opts.page ?? 1, 1);
    const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
    const where: any = {
      deletedAt: null,
      companyId: { in: user.companyIds },
    };
    if (opts.status) where.status = opts.status;
    if (opts.supplierCnpj)
      where.supplierCnpj = opts.supplierCnpj.replace(/\D/g, '');
    if (opts.search) {
      const s = opts.search.trim();
      where.OR = [
        { numero: { contains: s } },
        { accessKey: { contains: s } },
        { supplierName: { contains: s } },
      ];
    }
    if (opts.from || opts.to) {
      where.emissao = {};
      if (opts.from) where.emissao.gte = new Date(opts.from);
      if (opts.to) where.emissao.lte = new Date(opts.to);
    }

    const [total, rows] = await Promise.all([
      this.prisma.fiscalDocument.count({ where }),
      this.prisma.fiscalDocument.findMany({
        where,
        orderBy: [{ emissao: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          type: true,
          accessKey: true,
          numero: true,
          serie: true,
          natOp: true,
          supplierCnpj: true,
          supplierName: true,
          destCnpj: true,
          destName: true,
          valorTotal: true,
          emissao: true,
          status: true,
          purchaseOrderId: true,
          linkedAt: true,
          company: { select: { id: true, code: true, name: true } },
          purchaseOrder: {
            select: { id: true, number: true, status: true },
          },
        },
      }),
    ]);

    return { total, page, pageSize, rows };
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, deletedAt: null, companyId: { in: user.companyIds } },
      include: {
        company: { select: { id: true, code: true, name: true } },
        purchaseOrder: {
          select: {
            id: true,
            number: true,
            status: true,
            supplierName: true,
            totalAmount: true,
          },
        },
        linkedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!doc) throw new NotFoundException('NF não encontrada');
    return {
      ...doc,
      items: doc.itemsJson ? this.safeParseJson(doc.itemsJson) : [],
    };
  }

  private safeParseJson(s: string): unknown {
    try {
      return JSON.parse(s);
    } catch {
      return [];
    }
  }

  /**
   * Lista PCs candidatos a vincular — heurística: mesma company,
   * mesmo fornecedor (match por nome aproximado ou raiz CNPJ via
   * supplierErpCode — limitação: o PC não armazena CNPJ do fornecedor),
   * em status onde aceitar NF faz sentido.
   *
   * MVP: filtra por company + status e devolve os 50 PCs mais recentes;
   * o operador escolhe. Refino com matching automático fica pra depois.
   */
  async candidatesForLink(user: AuthenticatedUser, id: string) {
    const doc = await this.findOne(user, id);
    const candidates = await this.prisma.purchaseOrder.findMany({
      where: {
        companyId: doc.companyId,
        deletedAt: null,
        status: {
          in: ['INTEGRATED', 'PARTIALLY_RECEIVED', 'APPROVED'],
        },
        OR: [
          { supplierName: { contains: doc.supplierName.slice(0, 20) } },
          { fiscalDocuments: { some: { id } } }, // já vinculado a esta NF
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        number: true,
        status: true,
        supplierName: true,
        supplierErpCode: true,
        totalAmount: true,
        expectedDelivery: true,
        createdAt: true,
        erpPedido: true,
      },
    });
    return candidates;
  }

  async linkToPo(
    user: AuthenticatedUser,
    id: string,
    purchaseOrderId: string,
  ) {
    const doc = await this.findOne(user, id);
    if (doc.status === 'LINKED' && doc.purchaseOrderId === purchaseOrderId) {
      return doc;
    }
    const po = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: purchaseOrderId,
        deletedAt: null,
        companyId: doc.companyId,
      },
      select: { id: true },
    });
    if (!po) throw new BadRequestException('PC inválido para vínculo');

    await this.prisma.fiscalDocument.update({
      where: { id },
      data: {
        purchaseOrderId,
        status: 'LINKED',
        linkedById: user.id,
        linkedAt: new Date(),
      },
    });
    return this.findOne(user, id);
  }

  async unlinkFromPo(user: AuthenticatedUser, id: string) {
    const doc = await this.findOne(user, id);
    if (doc.status !== 'LINKED') {
      throw new BadRequestException('NF não está vinculada');
    }
    await this.prisma.fiscalDocument.update({
      where: { id },
      data: {
        purchaseOrderId: null,
        status: 'PENDING',
        linkedById: null,
        linkedAt: null,
      },
    });
    return this.findOne(user, id);
  }

  async markIgnored(user: AuthenticatedUser, id: string, reason?: string) {
    const doc = await this.findOne(user, id);
    if (doc.status === 'LINKED') {
      throw new BadRequestException(
        'NF está vinculada a um PC — desvincule primeiro',
      );
    }
    await this.prisma.fiscalDocument.update({
      where: { id },
      data: {
        status: 'IGNORED',
        notes: reason ?? doc.notes,
      },
    });
    return this.findOne(user, id);
  }

  async restorePending(user: AuthenticatedUser, id: string) {
    const doc = await this.findOne(user, id);
    if (doc.status === 'LINKED') {
      throw new BadRequestException('NF está vinculada — desvincule primeiro');
    }
    await this.prisma.fiscalDocument.update({
      where: { id },
      data: { status: 'PENDING' },
    });
    return this.findOne(user, id);
  }

  /** Devolve o XML cru (decodificado) pra download. */
  async getXml(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ xml: string; filename: string }> {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, deletedAt: null, companyId: { in: user.companyIds } },
      select: { rawXmlBase64: true, accessKey: true },
    });
    if (!doc) throw new NotFoundException('NF não encontrada');
    const xml = Buffer.from(doc.rawXmlBase64, 'base64').toString('utf8');
    return { xml, filename: `${doc.accessKey}.xml` };
  }

  /** Read-through pra Qive: gera DANFe em PDF (não cacheamos — é grande). */
  async getDanfe(
    user: AuthenticatedUser,
    id: string,
  ): Promise<{ pdf: Buffer; filename: string }> {
    const doc = await this.prisma.fiscalDocument.findFirst({
      where: { id, deletedAt: null, companyId: { in: user.companyIds } },
      select: { accessKey: true },
    });
    if (!doc) throw new NotFoundException('NF não encontrada');
    const base64 = await this.qive.getDanfeBase64(doc.accessKey);
    return {
      pdf: Buffer.from(base64, 'base64'),
      filename: `DANFe-${doc.accessKey}.pdf`,
    };
  }

  /** Usada na página do PC pra listar as NFs vinculadas. */
  async findByPurchaseOrder(user: AuthenticatedUser, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId: { in: user.companyIds } },
      select: { id: true },
    });
    if (!po) throw new ForbiddenException();
    return this.prisma.fiscalDocument.findMany({
      where: {
        purchaseOrderId: poId,
        deletedAt: null,
      },
      orderBy: { emissao: 'desc' },
      select: {
        id: true,
        accessKey: true,
        numero: true,
        serie: true,
        supplierCnpj: true,
        supplierName: true,
        valorTotal: true,
        emissao: true,
        status: true,
        linkedAt: true,
        linkedBy: { select: { id: true, name: true } },
      },
    });
  }
}
