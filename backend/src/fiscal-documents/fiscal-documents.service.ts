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
import { safeDbName } from '../common/erp/safe-db-name';

/**
 * Match de CNPJ raiz contra uma company.
 * Compara contra `cnpj` (raiz dos 8 primeiros dígitos) E contra qualquer
 * raiz em `cnpjRaizes` (JSON array). Necessário porque a Guess (e outras
 * empresas) podem ter mais de uma raiz de CNPJ no grupo.
 */
function companyMatchesRaiz(
  c: { cnpj: string | null; cnpjRaizes: string | null },
  destRaiz: string,
): boolean {
  if (c.cnpj) {
    const primary = c.cnpj.replace(/\D/g, '').slice(0, 8);
    if (primary === destRaiz) return true;
  }
  if (c.cnpjRaizes) {
    try {
      const arr = JSON.parse(c.cnpjRaizes) as unknown;
      if (Array.isArray(arr)) {
        return arr.some(
          (x) =>
            typeof x === 'string' &&
            x.replace(/\D/g, '').slice(0, 8) === destRaiz,
        );
      }
    } catch {
      // ignora — coluna mal formada
    }
  }
  return false;
}

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

  // Limite por execução do cron — protege o cron de rodar 1h se a Qive
  // tiver acumulado muita coisa. Próxima execução pega o resto.
  //
  // A v2 ignora o Limit menor que ~500 e devolve em batches fixos
  // (~9MB/página). Pedimos 50, ela manda 500 mesmo. Trabalhamos com
  // isso: 60 páginas × ~500 = ~30k NFs/exec. Como a conta tem ~56k,
  // 2 execuções terminam o backfill completo.
  private readonly MAX_PAGES_PER_RUN = 60;
  private readonly PAGE_SIZE = 50;
  private readonly SLEEP_BETWEEN_PAGES_MS = 300;

  /**
   * Estado do sync em background, mapeado por companyId.
   * Cada empresa tem seu próprio paginator na Qive (filtra por cnpj[]
   * da empresa) — assim sincronizar Guess não afeta HRG3 e vice-versa.
   *
   * Como uma rodada pode demorar minutos (até 10k NFes), o trigger
   * manual não espera — dispara fire-and-forget e o front consulta
   * status periodicamente.
   */
  private syncStates = new Map<
    string,
    {
      running: boolean;
      startedAt: Date | null;
      totalOnQive: number | null;
      pagesProcessed: number;
      nfesInserted: number;
      nfesAlreadyExisted: number;
      nfesIgnored: number;
      lastError: string | null;
    }
  >();

  private getOrInitSyncState(companyId: string) {
    let st = this.syncStates.get(companyId);
    if (!st) {
      st = {
        running: false,
        startedAt: null,
        totalOnQive: null,
        pagesProcessed: 0,
        nfesInserted: 0,
        nfesAlreadyExisted: 0,
        nfesIgnored: 0,
        lastError: null,
      };
      this.syncStates.set(companyId, st);
    }
    return st;
  }

  async getSyncStatus(companyId?: string): Promise<{
    running: boolean;
    startedAt: Date | null;
    totalOnQive: number | null;
    pagesProcessed: number;
    nfesInserted: number;
    nfesAlreadyExisted: number;
    nfesIgnored: number;
    lastError: string | null;
    totalLocal: number;
    lastRun: { status: string; executedAt: Date; durationMs: number | null } | null;
  }> {
    const where: any = { deletedAt: null };
    if (companyId) where.companyId = companyId;
    const totalLocal = await this.prisma.fiscalDocument.count({ where });
    const lastRunRow = await this.prisma.integrationLog.findFirst({
      where: { jobType: 'QIVE_NFE_SYNC', ...(companyId ? { companyId } : {}) },
      orderBy: { executedAt: 'desc' },
      select: { status: true, executedAt: true, durationMs: true },
    });

    const st = companyId
      ? this.getOrInitSyncState(companyId)
      : // Sem companyId: agrega todos os syncs em andamento.
        Array.from(this.syncStates.values()).reduce(
          (acc, s) => ({
            running: acc.running || s.running,
            startedAt: s.startedAt ?? acc.startedAt,
            totalOnQive: (acc.totalOnQive ?? 0) + (s.totalOnQive ?? 0),
            pagesProcessed: acc.pagesProcessed + s.pagesProcessed,
            nfesInserted: acc.nfesInserted + s.nfesInserted,
            nfesAlreadyExisted: acc.nfesAlreadyExisted + s.nfesAlreadyExisted,
            nfesIgnored: acc.nfesIgnored + s.nfesIgnored,
            lastError: s.lastError ?? acc.lastError,
          }),
          {
            running: false,
            startedAt: null as Date | null,
            totalOnQive: 0,
            pagesProcessed: 0,
            nfesInserted: 0,
            nfesAlreadyExisted: 0,
            nfesIgnored: 0,
            lastError: null as string | null,
          },
        );

    return {
      ...st,
      totalLocal,
      lastRun: lastRunRow,
    };
  }

  /**
   * Dispara o sync em background pra UMA empresa (fire-and-forget).
   * Idempotente — se já tem um sync rodando pra essa empresa, devolve
   * `started: false`. Filtra a chamada Qive pelos CNPJs da empresa.
   */
  startBackgroundSync(companyId: string): { started: boolean; running: boolean } {
    const st = this.getOrInitSyncState(companyId);
    if (st.running) {
      return { started: false, running: true };
    }
    st.running = true;
    st.startedAt = new Date();
    st.totalOnQive = null;
    st.pagesProcessed = 0;
    st.nfesInserted = 0;
    st.nfesAlreadyExisted = 0;
    st.nfesIgnored = 0;
    st.lastError = null;
    this.syncAll('received', companyId).catch((err) => {
      this.logger.error(
        `startBackgroundSync(${companyId}): ${(err as Error).message}`,
      );
      st.lastError = (err as Error).message;
      st.running = false;
    });
    return { started: true, running: true };
  }

  /**
   * Cache do mapa CNPJ → companyId construído a partir de FILIAIS de
   * cada erpDb. Mais preciso que match por raiz — uma raiz pode estar
   * dividida entre 2 empresas do grupo, mas CNPJs de filial são únicos.
   * TTL 30min — FILIAIS muda raramente.
   */
  private cnpjMapCache: {
    map: Map<string, string> | null;
    expiresAt: number;
  } = { map: null, expiresAt: 0 };
  private readonly CNPJ_MAP_TTL_MS = 30 * 60 * 1000;

  /**
   * Constrói (ou devolve do cache) o mapa CNPJ → companyId consultando
   * `FILIAIS.CGC_CPF` de cada erpDb das empresas ativas.
   */
  private async getCnpjToCompanyMap(): Promise<Map<string, string>> {
    if (
      this.cnpjMapCache.map &&
      Date.now() < this.cnpjMapCache.expiresAt
    ) {
      return this.cnpjMapCache.map;
    }
    const companies = await this.prisma.company.findMany({
      where: { active: true, deletedAt: null },
      select: { id: true, code: true, erpDbName: true },
    });
    const map = new Map<string, string>();
    for (const c of companies) {
      let db: string;
      try {
        db = safeDbName(c.erpDbName);
      } catch {
        this.logger.warn(
          `getCnpjToCompanyMap: erpDbName de ${c.code} fora da allow-list, pulando`,
        );
        continue;
      }
      try {
        const rows = await this.prisma.$queryRawUnsafe<
          Array<{ cnpj: string }>
        >(`
          SELECT REPLACE(REPLACE(REPLACE(ISNULL(CGC_CPF,''),'.',''),'/',''),'-','') AS cnpj
            FROM [${db}].dbo.FILIAIS WITH (NOLOCK)
           WHERE LEN(REPLACE(REPLACE(REPLACE(ISNULL(CGC_CPF,''),'.',''),'/',''),'-','')) = 14
        `);
        rows.forEach((r) => {
          if (r.cnpj) map.set(r.cnpj, c.id);
        });
      } catch (err) {
        this.logger.warn(
          `getCnpjToCompanyMap: falha lendo FILIAIS de ${c.code} (${c.erpDbName}): ${(err as Error).message}`,
        );
      }
    }
    this.cnpjMapCache = {
      map,
      expiresAt: Date.now() + this.CNPJ_MAP_TTL_MS,
    };
    this.logger.log(
      `getCnpjToCompanyMap: ${map.size} CNPJs carregados (cache 30min)`,
    );
    return map;
  }

  /**
   * Resolve a Company destinatária de uma NF.
   * Estratégia: 1) match exato pelo CNPJ completo via FILIAIS (mais
   * preciso); 2) fallback pela raiz em Company.cnpjRaizes.
   */
  private async resolveCompanyForDest(
    destCnpj: string,
    companies: Array<{
      id: string;
      cnpj: string | null;
      cnpjRaizes: string | null;
    }>,
  ): Promise<{ id: string } | null> {
    const clean = destCnpj.replace(/\D/g, '');
    if (clean.length !== 14) return null;
    const cnpjMap = await this.getCnpjToCompanyMap();
    const exactCompanyId = cnpjMap.get(clean);
    if (exactCompanyId) return { id: exactCompanyId };
    // Fallback: match por raiz
    const raiz = clean.slice(0, 8);
    const c = companies.find((x) => companyMatchesRaiz(x, raiz));
    return c ? { id: c.id } : null;
  }

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
  async syncAll(
    role: 'received' = 'received',
    targetCompanyId?: string,
  ): Promise<{
    companiesProcessed: number;
    nfesInserted: number;
    nfesAlreadyExisted: number;
    nfesIgnored: number;
  }> {
    const started = Date.now();
    const allCompanies = await this.prisma.company.findMany({
      where: { active: true, deletedAt: null },
      select: {
        id: true,
        code: true,
        cnpj: true,
        cnpjRaizes: true,
        name: true,
        erpDbName: true,
      },
    });
    // Se foi passado targetCompanyId, sincroniza só essa. Senão (cron),
    // roda pra todas as empresas ativas, em sequência.
    const targets = targetCompanyId
      ? allCompanies.filter((c) => c.id === targetCompanyId)
      : allCompanies;

    let grandInserted = 0;
    let grandExisted = 0;
    let grandIgnored = 0;

    for (const anchorCompany of targets) {
      const result = await this.syncOneCompany(
        anchorCompany,
        allCompanies,
        role,
        started,
      );
      grandInserted += result.inserted;
      grandExisted += result.existed;
      grandIgnored += result.ignored;
    }
    return {
      companiesProcessed: targets.length,
      nfesInserted: grandInserted,
      nfesAlreadyExisted: grandExisted,
      nfesIgnored: grandIgnored,
    };
  }

  /**
   * Sincroniza UMA empresa com a Qive. Lê as CNPJs FILIAIS da empresa e
   * filtra a chamada Qive por cnpj[], garantindo que cada empresa puxe
   * só as NFes destinadas a ela.
   */
  private async syncOneCompany(
    anchorCompany: {
      id: string;
      code: string;
      cnpj: string | null;
      cnpjRaizes: string | null;
      name: string;
      erpDbName: string;
    },
    allCompanies: Array<{
      id: string;
      code: string;
      cnpj: string | null;
      cnpjRaizes: string | null;
      name: string;
    }>,
    role: 'received',
    started: number,
  ): Promise<{ inserted: number; existed: number; ignored: number }> {
    const st = this.getOrInitSyncState(anchorCompany.id);
    let totalInserted = 0;
    let totalExisted = 0;
    let totalIgnored = 0;

    // Carrega CNPJs (14 chars) da empresa pra filtrar a chamada Qive.
    // Fallback se FILIAIS não acessível: usa raiz da Company.cnpjRaizes.
    let cnpjFilter: string[] = [];
    const anchorDb = safeDbName(anchorCompany.erpDbName);
    try {
      const rows = await this.prisma.$queryRawUnsafe<Array<{ cnpj: string }>>(`
        SELECT REPLACE(REPLACE(REPLACE(ISNULL(CGC_CPF,''),'.',''),'/',''),'-','') AS cnpj
          FROM [${anchorDb}].dbo.FILIAIS WITH (NOLOCK)
         WHERE LEN(REPLACE(REPLACE(REPLACE(ISNULL(CGC_CPF,''),'.',''),'/',''),'-','')) = 14
      `);
      cnpjFilter = rows.map((r) => r.cnpj);
    } catch (err) {
      this.logger.warn(
        `syncOneCompany(${anchorCompany.code}): FILIAIS indisponível (${(err as Error).message.slice(0, 80)}), sem filtro de CNPJ`,
      );
    }
    this.logger.log(
      `syncOneCompany(${anchorCompany.code}): ${cnpjFilter.length} CNPJs no filtro`,
    );

    const state = await this.prisma.fiscalDocumentSyncState.upsert({
      where: {
        companyId_role: { companyId: anchorCompany.id, role },
      },
      create: { companyId: anchorCompany.id, role, lastCursor: 0 },
      update: {},
    });

    let paginator: string | null = state.lastPaginator ?? null;
    let pages = 0;
    let lastError: string | null = null;
    let totalSeen = 0;

    try {
      while (pages < this.MAX_PAGES_PER_RUN) {
        const res = await this.qive.listNfesV2({
          paginator,
          limit: this.PAGE_SIZE,
          // Filtra por CNPJs da empresa — assim cada company só puxa
          // as NFes que são dela. A v2 também exige Filters.CreatedAt
          // pra não responder 500, então enviamos janela ampla.
          createdAtFrom: '2010-01-01',
          createdAtTo: '2099-12-31',
          accessKeys: undefined,
          // cnpjs é o filtro de "owner" — quem é dono da NF na conta Qive.
          // Quando vazio (ex.: HRG3 em HML sem FILIAIS), não filtra.
          ...(cnpjFilter.length > 0 ? { cnpjs: cnpjFilter } : {}),
        } as any);
        const items = res.data ?? [];
        if (items.length === 0) break;
        totalSeen = res.total;
        st.totalOnQive = totalSeen;

        for (const item of items) {
          const parsed = parseNfeBase64(item.xml);
          if (!parsed) {
            this.logger.warn(
              `qive-nfe-sync(${anchorCompany.code}): XML não parseável (chave=${item.access_key})`,
            );
            totalIgnored++;
            st.nfesIgnored = totalIgnored;
            continue;
          }
          // upsertParsed devolve um sinal mais rico (created | existed | ignored)
          const outcome = await this.upsertParsedV2(
            parsed,
            item.xml,
            allCompanies,
          );
          if (outcome === 'created') {
            totalInserted++;
            st.nfesInserted = totalInserted;
          } else if (outcome === 'existed') {
            totalExisted++;
            st.nfesAlreadyExisted = totalExisted;
          } else {
            totalIgnored++;
            st.nfesIgnored = totalIgnored;
          }
        }

        // Salva paginator atual no DB pra próxima execução do cron
        // continuar daqui mesmo se a página seguinte falhar.
        await this.prisma.fiscalDocumentSyncState.update({
          where: {
            companyId_role: { companyId: anchorCompany.id, role },
          },
          data: { lastPaginator: res.paginator ?? null },
        });

        // Próximo paginator — null/empty = fim do walk.
        if (!res.paginator) {
          paginator = null;
          break;
        }
        paginator = res.paginator;
        pages++;
        st.pagesProcessed = pages;
        await this.sleep(this.SLEEP_BETWEEN_PAGES_MS);
      }
    } catch (err) {
      lastError = (err as Error).message;
      this.logger.error(`qive-nfe-sync(${anchorCompany.code}): ${lastError}`);
      st.lastError = lastError;
    }
    st.running = false;

    await this.prisma.fiscalDocumentSyncState.update({
      where: {
        companyId_role: { companyId: anchorCompany.id, role },
      },
      data: {
        lastPaginator: paginator,
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
        recordsProcessed: totalInserted + totalExisted + totalIgnored,
        durationMs: Date.now() - started,
        errorDetails: lastError?.slice(0, 1900) ?? null,
      },
    });

    this.logger.log(
      `qive-nfe-sync(${anchorCompany.code}) concluído: ${totalInserted} novas, ${totalExisted} já existiam, ${totalIgnored} ignoradas (Qive total=${totalSeen}, paginator=${paginator ? 'continua' : 'fim'}), em ${Date.now() - started}ms`,
    );

    return {
      inserted: totalInserted,
      existed: totalExisted,
      ignored: totalIgnored,
    };
  }

  /**
   * Versão refinada do upsertParsed que distingue:
   *  - 'created' — nova NF persistida
   *  - 'existed' — accessKey já estava no banco (idempotente)
   *  - 'ignored' — não conseguiu rotear (CNPJ não bate com Company)
   */
  private async upsertParsedV2(
    parsed: ParsedNfe,
    rawBase64: string,
    companies: Array<{
      id: string;
      code: string;
      cnpj: string | null;
      cnpjRaizes: string | null;
      name: string;
    }>,
  ): Promise<'created' | 'existed' | 'ignored'> {
    const existing = await this.prisma.fiscalDocument.findUnique({
      where: { accessKey: parsed.accessKey },
      select: { id: true },
    });
    if (existing) return 'existed';

    const destRaiz = parsed.dest.cnpj.slice(0, 8);
    const emitRaiz = parsed.emit.cnpj.slice(0, 8);
    const resolved = await this.resolveCompanyForDest(
      parsed.dest.cnpj,
      companies,
    );
    const company = resolved
      ? companies.find((c) => c.id === resolved.id)
      : undefined;
    if (!company) return 'ignored';
    const isInternal = emitRaiz === destRaiz;

    await this.prisma.fiscalDocument.create({
      data: {
        companyId: company.id,
        type: 'NFe',
        accessKey: parsed.accessKey,
        qiveCursor: null,
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
    return 'created';
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
      cnpjRaizes: string | null;
      name: string;
    }>,
  ): Promise<boolean> {
    // Já existe? pula.
    const existing = await this.prisma.fiscalDocument.findUnique({
      where: { accessKey: parsed.accessKey },
      select: { id: true },
    });
    if (existing) return false;

    // Roteamento: match exato por CNPJ completo via FILIAIS (preciso) →
    // fallback por raiz em Company.cnpjRaizes.
    const destRaiz = parsed.dest.cnpj.slice(0, 8);
    const emitRaiz = parsed.emit.cnpj.slice(0, 8);
    const resolved = await this.resolveCompanyForDest(
      parsed.dest.cnpj,
      companies,
    );
    const company = resolved
      ? companies.find((c) => c.id === resolved.id)
      : undefined;
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
      companyId?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const page = Math.max(opts.page ?? 1, 1);
    const pageSize = Math.min(Math.max(opts.pageSize ?? 50, 1), 200);
    // Se o front passou companyId (do switcher), restringe a essa empresa.
    // Sem isso, Admin via Guess no topo via NFs de HRG3 também (companyIds
    // inclui todas as empresas do escopo do user).
    const allowedCompanyIds = opts.companyId
      ? user.companyIds.filter((id) => id === opts.companyId)
      : user.companyIds;
    const where: any = {
      deletedAt: null,
      companyId: { in: allowedCompanyIds },
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

    // Sort: whitelist de colunas pra evitar SQL injection. Default
    // mantém a ordem antiga (emissao desc).
    const sortableCols = new Set([
      'emissao',
      'numero',
      'supplierName',
      'destName',
      'valorTotal',
      'status',
      'createdAt',
    ]);
    const sortBy = sortableCols.has(opts.sortBy ?? '')
      ? (opts.sortBy as string)
      : 'emissao';
    const sortDir = opts.sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy: any =
      sortBy === 'emissao'
        ? [{ emissao: sortDir }, { createdAt: 'desc' }]
        : [{ [sortBy]: sortDir }, { emissao: 'desc' }];

    const [total, rows] = await Promise.all([
      this.prisma.fiscalDocument.count({ where }),
      this.prisma.fiscalDocument.findMany({
        where,
        orderBy,
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

  /**
   * Procura pedidos legados (Linx) que tenham essa NF lançada — via
   * ENTRADAS.CHAVE_NFE → ENTRADAS_ITEM.REFERENCIA_PEDIDO → COMPRAS.
   * Filtra só pedidos consumível. Útil pra oferecer o vínculo automático
   * com pedido legado quando a NF veio pela cron (sem contexto).
   */
  async findLegacyCandidates(user: AuthenticatedUser, id: string) {
    const doc = await this.findOne(user, id);
    const company = await this.prisma.company.findFirst({
      where: { id: doc.companyId, deletedAt: null },
      select: { id: true, code: true, erpDbName: true, name: true },
    });
    if (!company) return [];
    const db = safeDbName(company.erpDbName);
    const chave = doc.accessKey;

    const chaveClean = chave.replace(/\D/g, '').slice(0, 44);
    type Row = {
      pedido: string;
      fornecedor: string;
      emissao: Date | null;
      totValorOriginal: number;
      totValorEntregar: number;
      tipoCompra: string | null;
      filialAEntregar: string | null;
      statusCompra: string | null;
      tabelaFilha: string | null;
    };

    // Consumível — vínculo via ENTRADAS_ITEM.REFERENCIA_PEDIDO
    const consumivel = await this.prisma.$queryRawUnsafe<Row[]>(`
      SELECT DISTINCT
        RTRIM(c.PEDIDO) AS pedido,
        RTRIM(c.FORNECEDOR) AS fornecedor,
        c.EMISSAO AS emissao,
        c.TOT_VALOR_ORIGINAL AS totValorOriginal,
        c.TOT_VALOR_ENTREGAR AS totValorEntregar,
        RTRIM(c.TIPO_COMPRA) AS tipoCompra,
        RTRIM(c.FILIAL_A_ENTREGAR) AS filialAEntregar,
        RTRIM(c.STATUS_COMPRA) AS statusCompra,
        RTRIM(c.TABELA_FILHA) AS tabelaFilha
      FROM [${db}].dbo.ENTRADAS e WITH (NOLOCK)
      JOIN [${db}].dbo.ENTRADAS_ITEM ei WITH (NOLOCK)
        ON RTRIM(ei.NF_ENTRADA) = RTRIM(e.NF_ENTRADA)
       AND RTRIM(ei.NOME_CLIFOR) = RTRIM(e.NOME_CLIFOR)
       AND RTRIM(ISNULL(ei.SERIE_NF_ENTRADA,'')) = RTRIM(ISNULL(e.SERIE_NF_ENTRADA,''))
      JOIN [${db}].dbo.COMPRAS c WITH (NOLOCK)
        ON RTRIM(c.PEDIDO) = RTRIM(ei.REFERENCIA_PEDIDO)
      WHERE RTRIM(e.CHAVE_NFE) = '${chaveClean}'
        AND RTRIM(c.TABELA_FILHA) = 'COMPRAS_CONSUMIVEL'
        AND LEN(RTRIM(ISNULL(c.PEDIDO,''))) > 0
        AND LEN(RTRIM(ISNULL(ei.REFERENCIA_PEDIDO,''))) > 0
    `);

    // PA — vínculo via ENTRADAS_PRODUTO.PEDIDO (tabela diferente)
    const produto = await this.prisma.$queryRawUnsafe<Row[]>(`
      SELECT DISTINCT
        RTRIM(c.PEDIDO) AS pedido,
        RTRIM(c.FORNECEDOR) AS fornecedor,
        c.EMISSAO AS emissao,
        c.TOT_VALOR_ORIGINAL AS totValorOriginal,
        c.TOT_VALOR_ENTREGAR AS totValorEntregar,
        RTRIM(c.TIPO_COMPRA) AS tipoCompra,
        RTRIM(c.FILIAL_A_ENTREGAR) AS filialAEntregar,
        RTRIM(c.STATUS_COMPRA) AS statusCompra,
        RTRIM(c.TABELA_FILHA) AS tabelaFilha
      FROM [${db}].dbo.ENTRADAS e WITH (NOLOCK)
      JOIN [${db}].dbo.ENTRADAS_PRODUTO ep WITH (NOLOCK)
        ON RTRIM(ep.NF_ENTRADA) = RTRIM(e.NF_ENTRADA)
       AND RTRIM(ep.NOME_CLIFOR) = RTRIM(e.NOME_CLIFOR)
       AND RTRIM(ISNULL(ep.SERIE_NF_ENTRADA,'')) = RTRIM(ISNULL(e.SERIE_NF_ENTRADA,''))
      JOIN [${db}].dbo.COMPRAS c WITH (NOLOCK)
        ON RTRIM(c.PEDIDO) = RTRIM(ep.PEDIDO)
      WHERE RTRIM(e.CHAVE_NFE) = '${chaveClean}'
        AND RTRIM(c.TABELA_FILHA) = 'COMPRAS_PRODUTO'
        AND LEN(RTRIM(ISNULL(c.PEDIDO,''))) > 0
        AND LEN(RTRIM(ISNULL(ep.PEDIDO,''))) > 0
    `);

    return [...consumivel, ...produto].map((r) => ({
      pedido: r.pedido,
      fornecedor: r.fornecedor,
      emissao: r.emissao,
      totValorOriginal: Number(r.totValorOriginal ?? 0),
      totValorEntregar: Number(r.totValorEntregar ?? 0),
      tipoCompra: r.tipoCompra,
      filialAEntregar: r.filialAEntregar,
      statusCompra: r.statusCompra,
      // 'CONSUMIVEL' | 'PA' — pro UI mostrar o badge certo
      tipoPedido:
        r.tabelaFilha === 'COMPRAS_PRODUTO' ? 'PA' : 'CONSUMIVEL',
      companyId: company.id,
      companyCode: company.code,
    }));
  }

  /**
   * Vincula esta NF a um pedido legado (Linx pré-P2P).
   * Diferente de linkToPo, não há PurchaseOrder no P2P — só registramos
   * o número do pedido + companyId pra rastreabilidade.
   */
  async linkToLegacy(
    user: AuthenticatedUser,
    id: string,
    legacyPedido: string,
    legacyCompanyId: string,
  ) {
    const doc = await this.findOne(user, id);
    if (doc.companyId !== legacyCompanyId) {
      throw new BadRequestException(
        'Empresa do pedido legado não bate com a empresa da NF',
      );
    }
    await this.prisma.fiscalDocument.update({
      where: { id },
      data: {
        legacyPedido: legacyPedido.replace(/[^0-9A-Za-z]/g, '').slice(0, 20),
        legacyCompanyId,
        purchaseOrderId: null,
        status: 'LEGACY_LINKED',
        linkedById: user.id,
        linkedAt: new Date(),
      },
    });
    return this.findOne(user, id);
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
        // Vinculou a PC do P2P: descarta vínculo com pedido legado.
        legacyPedido: null,
        legacyCompanyId: null,
        linkedById: user.id,
        linkedAt: new Date(),
      },
    });
    return this.findOne(user, id);
  }

  async unlinkFromPo(user: AuthenticatedUser, id: string) {
    const doc = await this.findOne(user, id);
    if (doc.status !== 'LINKED' && doc.status !== 'LEGACY_LINKED') {
      throw new BadRequestException('NF não está vinculada');
    }
    await this.prisma.fiscalDocument.update({
      where: { id },
      data: {
        purchaseOrderId: null,
        legacyPedido: null,
        legacyCompanyId: null,
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

  /**
   * Busca uma NFe na Qive pela chave (44 chars) e persiste no P2P
   * como FiscalDocument. Idempotente: se já existir, devolve o existente
   * sem chamar a Qive.
   *
   * Usado em:
   *   - Pedidos Legados: quando o user clica "Buscar na Qive" pra liberar
   *     XML/DANFe + ter o registro listado em Notas Fiscais.
   *   - Detalhe do PC: pode ser disparado depois pra ações similares.
   *
   * Permissão: qualquer usuário autenticado com escopo de pelo menos
   * uma empresa cujo CNPJ raiz bata com o destinatário da NF.
   */
  async fetchByChave(
    user: AuthenticatedUser,
    accessKey: string,
    opts: { legacyPedido?: string; legacyCompanyId?: string } = {},
  ): Promise<{ created: boolean; document: any }> {
    const k = accessKey.replace(/\D/g, '');
    if (k.length !== 44) {
      throw new BadRequestException('Chave NFe inválida (44 dígitos)');
    }

    // Já existe? aproveita pra gravar o vínculo com legado caso ainda
    // não tenha, e devolve.
    const existing = await this.prisma.fiscalDocument.findFirst({
      where: {
        accessKey: k,
        deletedAt: null,
        companyId: { in: user.companyIds },
      },
    });
    if (existing) {
      if (
        opts.legacyPedido &&
        opts.legacyCompanyId &&
        (!existing.legacyPedido || !existing.legacyCompanyId)
      ) {
        const updated = await this.prisma.fiscalDocument.update({
          where: { id: existing.id },
          data: {
            legacyPedido: opts.legacyPedido,
            legacyCompanyId: opts.legacyCompanyId,
            // Se ainda estava PENDING, marca como LEGACY_LINKED.
            ...(existing.status === 'PENDING'
              ? {
                  status: 'LEGACY_LINKED',
                  linkedById: user.id,
                  linkedAt: new Date(),
                }
              : {}),
          },
        });
        return { created: false, document: updated };
      }
      return { created: false, document: existing };
    }

    // Busca na Qive.
    const item = await this.qive.findNfeByAccessKey(k);
    if (!item) {
      throw new NotFoundException(
        'NFe não encontrada na Qive — a NF pode não estar associada a este ambiente da conta (verifique manifestação) ou ainda não foi liberada pela SEFAZ.',
      );
    }

    const parsed = parseNfeBase64(item.xml);
    if (!parsed) {
      throw new BadRequestException(
        'XML retornado pela Qive não foi parseável.',
      );
    }

    // Rota pela CNPJ destinatária. Aceita match contra Company.cnpj OU
    // contra qualquer raiz em Company.cnpjRaizes (JSON array). Uma
    // mesma empresa do grupo pode ter raízes diferentes (ex.: Guess
    // tem 3 raízes — ver migration 20260529100000_company_cnpj_raizes).
    const companies = await this.prisma.company.findMany({
      where: { active: true, deletedAt: null },
      select: {
        id: true,
        code: true,
        cnpj: true,
        cnpjRaizes: true,
        name: true,
      },
    });
    const destRaiz = parsed.dest.cnpj.slice(0, 8);
    const emitRaiz = parsed.emit.cnpj.slice(0, 8);
    const resolved = await this.resolveCompanyForDest(
      parsed.dest.cnpj,
      companies,
    );
    const company = resolved
      ? companies.find((c) => c.id === resolved.id)
      : undefined;
    if (!company) {
      throw new BadRequestException(
        `NF destinada a CNPJ ${parsed.dest.cnpj} — não corresponde a nenhuma empresa cadastrada no P2P.`,
      );
    }
    if (!user.companyIds.includes(company.id)) {
      throw new ForbiddenException(
        'Você não tem acesso à empresa destinatária dessa NF.',
      );
    }

    const isInternal = emitRaiz === destRaiz;
    const hasLegacy = !!(opts.legacyPedido && opts.legacyCompanyId);

    // Status:
    //  - INTERNAL  : transferência interna (sempre prevalece)
    //  - LEGACY_LINKED : trazida via pedido legado (já vinculada ao Linx)
    //  - PENDING   : default
    const initialStatus = isInternal
      ? 'INTERNAL'
      : hasLegacy
        ? 'LEGACY_LINKED'
        : 'PENDING';

    const created = await this.prisma.fiscalDocument.create({
      data: {
        companyId: company.id,
        type: 'NFe',
        accessKey: parsed.accessKey,
        qiveCursor: null,
        supplierCnpj: parsed.emit.cnpj,
        supplierName: parsed.emit.nome.slice(0, 255),
        destCnpj: parsed.dest.cnpj,
        destName: parsed.dest.nome?.slice(0, 255) ?? null,
        numero: parsed.numero,
        serie: parsed.serie,
        natOp: parsed.natOp?.slice(0, 255) ?? null,
        valorTotal: parsed.valorTotal,
        emissao: parsed.emissao ?? new Date(),
        status: initialStatus,
        legacyPedido: opts.legacyPedido ?? null,
        legacyCompanyId: opts.legacyCompanyId ?? null,
        linkedById: hasLegacy ? user.id : null,
        linkedAt: hasLegacy ? new Date() : null,
        rawXmlBase64: item.xml,
        itemsJson: JSON.stringify(parsed.items satisfies ParsedNfeItem[]),
      },
    });
    this.logger.log(
      `fetchByChave: NFe ${k} persistida (company=${company.code}, status=${created.status})`,
    );
    return { created: true, document: created };
  }

  /**
   * Re-parseia todas as NFs já persistidas a partir do `rawXmlBase64`.
   * Útil quando o parser ganha um fix (ex.: regex passou a aceitar
   * tags com atributos) e precisamos repopular `itemsJson` sem ter que
   * baixar de novo da Qive.
   *
   * Idempotente — escreve só quando o resultado difere do atual.
   * Retorna contadores por reason.
   */
  async reparseAll(
    user: AuthenticatedUser,
  ): Promise<{ scanned: number; updated: number; skipped: number }> {
    if (user.profile !== 'ADMIN') {
      throw new ForbiddenException('Apenas ADMIN pode reparsear');
    }
    let scanned = 0;
    let updated = 0;
    let skipped = 0;
    // Streaming em chunks pra não estourar memória.
    const PAGE = 200;
    let cursorAt = '';
    while (true) {
      const batch = await this.prisma.fiscalDocument.findMany({
        where: { deletedAt: null, accessKey: { gt: cursorAt } },
        orderBy: { accessKey: 'asc' },
        take: PAGE,
        select: {
          id: true,
          accessKey: true,
          rawXmlBase64: true,
          itemsJson: true,
        },
      });
      if (batch.length === 0) break;
      for (const doc of batch) {
        scanned++;
        const parsed = parseNfeBase64(doc.rawXmlBase64);
        if (!parsed) {
          skipped++;
          continue;
        }
        const newJson = JSON.stringify(parsed.items);
        if (newJson === (doc.itemsJson ?? '')) {
          skipped++;
          continue;
        }
        await this.prisma.fiscalDocument.update({
          where: { id: doc.id },
          data: { itemsJson: newJson },
        });
        updated++;
      }
      cursorAt = batch[batch.length - 1].accessKey;
    }
    this.logger.log(
      `reparseAll: scanned=${scanned}, updated=${updated}, skipped=${skipped}`,
    );
    return { scanned, updated, skipped };
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
