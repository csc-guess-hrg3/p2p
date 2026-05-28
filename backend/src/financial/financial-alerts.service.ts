import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../common/enums';

/**
 * Alertas automáticos do módulo Financeiro (RN-FIN-01..03 do PRD).
 *
 *  - RN-FIN-01: ITP em aberto há mais de 90 dias após o vencimento
 *               (título antigo não liquidado).
 *  - RN-FIN-02: Provisão (SV/PEDCOM) sem entrada de NF há mais de
 *               60 dias contados da emissão.
 *  - RN-FIN-03: DDA pendente de conciliação cujo vencimento é D-1
 *               (vence amanhã).
 *
 * Roda 1x por dia (07:00, próximo de quando o financeiro abre o dia),
 * varre cada empresa do P2P, consulta os totais via cross-DB query
 * sobre as views já mapeadas, e cria 1 notificação por equipe FINANCE
 * com o resumo (lista detalhada fica na própria tela).
 *
 * Idempotência: a tabela `notifications` já registra `entityType +
 * entityId` — usamos `entityId='RN-FIN-XX:<yyyy-mm-dd>:<companyId>'`
 * pra que rodar 2x no mesmo dia não duplique. O `notifications.create`
 * faz upsert por (userId, entityType, entityId).
 */
@Injectable()
export class FinancialAlertsService {
  private readonly logger = new Logger(FinancialAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private safeDbName(erpDbName: string): boolean {
    return ['GUESS_PRODUCAO', 'HML_GUESS', 'DB_HRG3'].includes(erpDbName);
  }

  /** Tick principal — todo dia às 07:00. */
  @Cron('0 0 7 * * *')
  async tick() {
    try {
      const result = await this.run();
      if (result.alerts > 0) {
        this.logger.log(
          `Alertas financeiros — empresas=${result.companies} ` +
            `alertas=${result.alerts}`,
        );
      }
    } catch (err) {
      this.logger.error(`Tick falhou: ${(err as Error).message}`);
    }
  }

  /** Varredura completa (também exposto pra ser chamado sob demanda). */
  async run() {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null, active: true },
    });
    let alerts = 0;
    let processed = 0;

    for (const company of companies) {
      if (!this.safeDbName(company.erpDbName)) continue;
      processed++;
      try {
        const summary = await this.collectSummary(company.erpDbName);
        if (
          summary.itp90Count === 0 &&
          summary.prov60Count === 0 &&
          summary.ddaD1Count === 0
        ) {
          continue;
        }
        const sent = await this.dispatchToFinanceTeams(company.id, summary);
        alerts += sent;
      } catch (err) {
        this.logger.error(
          `Empresa ${company.code} falhou: ${(err as Error).message}`,
        );
      }
    }
    return { companies: processed, alerts };
  }

  /**
   * Roda as 3 queries de alerta contra a base do Linx da empresa.
   * Retorna apenas contadores agregados — a lista detalhada o operador
   * consulta nas próprias telas filtrando por data.
   */
  private async collectSummary(erpDbName: string): Promise<{
    itp90Count: number;
    itp90Total: number;
    prov60Count: number;
    prov60Total: number;
    ddaD1Count: number;
    ddaD1Total: number;
  }> {
    const db = erpDbName;
    const today = new Date();
    const d90 = new Date(today);
    d90.setDate(d90.getDate() - 90);
    const d60 = new Date(today);
    d60.setDate(d60.getDate() - 60);
    const dPlus1 = new Date(today);
    dPlus1.setDate(dPlus1.getDate() + 1);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    // RN-FIN-01: ITP vencido há mais de 90 dias e ainda com saldo > 0.
    const r1 = await this.prisma.$queryRawUnsafe<
      Array<{ qtd: number; total: number | string }>
    >(`
      SELECT COUNT(*) AS qtd, COALESCE(SUM(SALDO_PRINCIPAL_DEVIDO), 0) AS total
      FROM [${db}].dbo.W_CTB_A_PAGAR_PARCELA
      WHERE EMPRESA = 1
        AND SALDO_PRINCIPAL_DEVIDO > 0
        AND VENCIMENTO_REAL < '${iso(d90)}'
    `);

    // RN-FIN-02: Provisão SV/PEDCOM sem entrada há mais de 60 dias
    // (emissão antiga, ainda valendo na view de provisões).
    const r2 = await this.prisma.$queryRawUnsafe<
      Array<{ qtd: number; total: number | string }>
    >(`
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VALOR_ENTREGAR), 0) AS total
      FROM [${db}].dbo.W_HRG3_CONTAS_PAGAR_PROVISAO
      WHERE EMISSAO < '${iso(d60)}'
    `);

    // RN-FIN-03: DDA pendente que vence D+1 (amanhã).
    const r3 = await this.prisma.$queryRawUnsafe<
      Array<{ qtd: number; total: number | string }>
    >(`
      SELECT COUNT(*) AS qtd, COALESCE(SUM(VALOR_TITULO), 0) AS total
      FROM [${db}].dbo.W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO
      WHERE (LANCAMENTO IS NULL OR LANCAMENTO = 0)
        AND CONVERT(date, VENCIMENTO) = '${iso(dPlus1)}'
    `);

    return {
      itp90Count: Number(r1[0]?.qtd ?? 0),
      itp90Total: Number(r1[0]?.total ?? 0),
      prov60Count: Number(r2[0]?.qtd ?? 0),
      prov60Total: Number(r2[0]?.total ?? 0),
      ddaD1Count: Number(r3[0]?.qtd ?? 0),
      ddaD1Total: Number(r3[0]?.total ?? 0),
    };
  }

  /**
   * Resolve as equipes da empresa com módulo FINANCE liberado, pega
   * seus membros ativos e cria notificações.
   */
  private async dispatchToFinanceTeams(
    companyId: string,
    summary: {
      itp90Count: number;
      itp90Total: number;
      prov60Count: number;
      prov60Total: number;
      ddaD1Count: number;
      ddaD1Total: number;
    },
  ): Promise<number> {
    // Equipes com FINANCE — vai usar isso como base; ainda incluímos
    // admins ativos com acesso à empresa, porque a coordenação
    // tipicamente é admin do sistema mesmo.
    const teams = await this.prisma.teamModuleAccess.findMany({
      where: { module: 'FINANCE' },
      select: { teamId: true },
    });
    const teamIds = teams.map((t) => t.teamId);

    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        companies: { some: { companyId } },
        OR: [
          { profile: 'ADMIN' },
          ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
        ],
      },
      select: { id: true },
    });
    if (users.length === 0) return 0;

    const today = new Date().toISOString().slice(0, 10);
    const fmt = (n: number) =>
      n.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });

    let count = 0;
    const tasks: Promise<unknown>[] = [];

    if (summary.itp90Count > 0) {
      for (const u of users) {
        tasks.push(
          this.notifications.create({
            companyId,
            userId: u.id,
            type: NotificationType.OVERDUE,
            title: `${summary.itp90Count} título(s) em aberto há +90 dias`,
            body: `Total ${fmt(summary.itp90Total)} em ITPs vencidos há mais de 90 dias (RN-FIN-01).`,
            entityType: 'FINANCE_ALERT',
            entityId: `RN-FIN-01:${today}:${companyId}`,
            sendEmail: false,
          }),
        );
        count++;
      }
    }
    if (summary.prov60Count > 0) {
      for (const u of users) {
        tasks.push(
          this.notifications.create({
            companyId,
            userId: u.id,
            type: NotificationType.OVERDUE,
            title: `${summary.prov60Count} provisão(ões) sem entrada há +60 dias`,
            body: `Total ${fmt(summary.prov60Total)} em provisões aguardando NF (RN-FIN-02).`,
            entityType: 'FINANCE_ALERT',
            entityId: `RN-FIN-02:${today}:${companyId}`,
            sendEmail: false,
          }),
        );
        count++;
      }
    }
    if (summary.ddaD1Count > 0) {
      for (const u of users) {
        tasks.push(
          this.notifications.create({
            companyId,
            userId: u.id,
            type: NotificationType.GENERAL,
            title: `${summary.ddaD1Count} DDA(s) vencem amanhã`,
            body: `Total ${fmt(summary.ddaD1Total)} em boletos DDA pendentes de conciliação com vencimento amanhã (RN-FIN-03).`,
            entityType: 'FINANCE_ALERT',
            entityId: `RN-FIN-03:${today}:${companyId}`,
            sendEmail: false,
          }),
        );
        count++;
      }
    }

    await Promise.allSettled(tasks);
    return count;
  }
}
