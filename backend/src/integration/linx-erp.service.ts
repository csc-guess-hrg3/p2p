import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PurchaseOrder, PurchaseOrderItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { IntegrationLogStatus } from '../common/enums';

/**
 * Grava o Pedido de Compra do P2P no ERP Linx.
 *
 * Fluxo (1 transação SQL):
 *  1) `LX_SEQUENCIAL('COMPRAS.PEDIDO')`  -> nº do pedido (5 dígitos)
 *  2) `INSERT  dbo.COMPRAS`              cabeçalho
 *  3) `INSERT  dbo.COMPRAS_CONSUMIVEL`   1 linha por item do PC
 *  4) `INSERT  dbo.COMPRAS_STATUS_LOG`   audit (status 'A ', usuário)
 *
 * O banco-alvo é o `erpDbName` da empresa (HML_GUESS / GUESS_PRODUCAO /
 * DB_HRG3). Hoje a alçada do Linx é bypassada (DECISIONS § 2.1) — quando
 * a tabela de alçada estiver definida no Linx, esta camada deve passar a
 * respeitá-la.
 *
 * Idempotência blindada:
 *  - `purchase_orders.erpStagingId` é gerado ANTES do INSERT (via método
 *    `prepareStagingId`) e persistido. Em caso de retry após falha entre o
 *    INSERT no Linx e o UPDATE do P2P, conseguimos detectar o pedido já
 *    gravado por meio do `OBS` ou de uma consulta de checagem.
 *  - Curto-circuito por `erpPedido` quando já preenchido.
 *
 * Toda execução grava em `integration_logs` (SUCCESS / FAILED) com a
 * duração e os detalhes do erro — atende ao PRD § 14.1 (retenção 90 dias).
 */
@Injectable()
export class LinxErpService {
  private readonly logger = new Logger(LinxErpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Pad esquerda com zeros até `len`. Linx armazena `PEDIDO` como char(8)
   * em algumas tabelas e o sequencial declarado tem `TAMANHO=5`; usamos 5
   * (o que a procedure devolve).
   */
  /**
   * Padrão do Linx em colunas char(N) numéricas: o valor fica
   * justificado à esquerda, completado com espaços (ex.: "60276   ").
   * Antes usávamos padStart com '0' o que produzia "00060276" —
   * inconsistente com o resto do banco. O SQL Server completa com
   * espaços automaticamente, mas mantemos a função pra ser explícito
   * e pra truncar se o número crescer além do tamanho da coluna.
   */
  private pad(value: string | number, len: number): string {
    return String(value).slice(0, len);
  }


  /**
   * Trunca para char(n) do Linx — emite warning quando corta, para o
   * operador ter visibilidade (PRD: campos como FORNECEDOR e
   * TRANSPORTADORA são varchar(25), o que pode cortar razões sociais).
   * Quando a equipe definir a política (DECISIONS § 5.4 — bloquear ou
   * truncar), trocar para BadRequest quando configurado.
   */
  private trunc(
    value: string | null | undefined,
    len: number,
    fieldName?: string,
  ): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    if (s.length > len) {
      this.logger.warn(
        `Truncamento Linx em ${fieldName ?? 'campo'} (${s.length} -> ${len}): "${s}" -> "${s.substring(0, len)}"`,
      );
    }
    return s.substring(0, len);
  }

  /**
   * Pré-gera o `erpStagingId` do PO no banco do P2P, dentro da mesma
   * transação que vai chamar o Linx. Idempotente: se já existir, devolve
   * o valor atual. Usado para conseguirmos detectar duplicatas em retries
   * mesmo quando o `erpPedido` ainda não foi persistido.
   */
  async prepareStagingId(purchaseOrderId: string): Promise<string> {
    const po = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: purchaseOrderId },
      select: { erpStagingId: true },
    });
    if (po.erpStagingId) return po.erpStagingId;
    const stagingId = `PO-${purchaseOrderId}`;
    await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { erpStagingId: stagingId, pendingErpSince: new Date() },
    });
    return stagingId;
  }

  /**
   * Procura no Linx um pedido já gravado para este staging id (busca pelo
   * texto registrado no OBS). Usado para recuperação de falhas: se o P2P
   * crashou após o INSERT mas antes do UPDATE local, conseguimos achar o
   * número do PEDIDO já criado e re-acoplar sem duplicar.
   */
  private async findExistingPedidoByOBS(
    erpDb: string,
    obs: string,
  ): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<
        { PEDIDO: string }[]
      >(
        `SELECT TOP 1 PEDIDO FROM [${erpDb}].dbo.COMPRAS WHERE OBS = @P1 ORDER BY EMISSAO DESC`,
        obs,
      );
      const existing = rows[0]?.PEDIDO?.trim();
      return existing ?? null;
    } catch (err) {
      this.logger.warn(
        `Falha ao pesquisar PEDIDO pré-existente no Linx: ${(err as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Volta um pedido aprovado pra "em estudo" no Linx — usado quando o
   * comprador edita o PC e o fluxo de aprovação precisa rodar de novo.
   * Grava entrada em COMPRAS_STATUS_LOG pra rastreio.
   */
  async markPedidoEmEstudo(
    po: { id: string; companyId: string; erpPedido: string | null; number: string },
    reason: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!po.erpPedido) return;
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });
    const erpDb = company.erpDbName;
    const usuario = (user.adUsername ?? user.name ?? '').slice(0, 25);
    await this.prisma.$executeRawUnsafe(
      `UPDATE [${erpDb}].dbo.COMPRAS
          SET STATUS_COMPRA = 'E ',
              STATUS_APROVACAO = 'E',
              LX_STATUS_COMPRA = 0
        WHERE PEDIDO = @P1`,
      po.erpPedido,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
         (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
       VALUES (@P1, GETDATE(), N'E ', @P2)`,
      po.erpPedido,
      usuario,
    );
    this.logger.log(
      `PC ${po.number} (Linx ${po.erpPedido}) voltou para 'em estudo' — ${reason}`,
    );
  }

  /**
   * Marca o pedido aprovado no Linx após reaprovação no P2P
   * (oposto de markPedidoEmEstudo). Volta `STATUS_COMPRA='A '` +
   * registra em COMPRAS_STATUS_LOG.
   */
  async markPedidoAprovado(
    po: { id: string; companyId: string; erpPedido: string | null; number: string },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!po.erpPedido) return;
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });
    const erpDb = company.erpDbName;
    const usuario = (user.adUsername ?? user.name ?? '').slice(0, 25);
    await this.prisma.$executeRawUnsafe(
      `UPDATE [${erpDb}].dbo.COMPRAS
          SET STATUS_COMPRA = 'A ',
              STATUS_APROVACAO = 'A',
              LX_STATUS_COMPRA = 1,
              DATA_APROVACAO = GETDATE(),
              APROVADO_POR = @P2,
              APROVADOR_POR = @P2
        WHERE PEDIDO = @P1`,
      po.erpPedido,
      usuario,
    );
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
         (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
       VALUES (@P1, GETDATE(), N'A ', @P2)`,
      po.erpPedido,
      usuario,
    );
    this.logger.log(
      `PC ${po.number} (Linx ${po.erpPedido}) voltou para 'aprovado' após reaprovação`,
    );
  }

  /**
   * Grava o PC no Linx. Devolve o número de PEDIDO gerado.
   * Idempotência: se `purchaseOrder.erpPedido` já existir, nada é feito;
   * se o INSERT já ocorreu mas o UPDATE local falhou, recuperamos via OBS.
   */
  async gravarPedidoCompra(
    po: PurchaseOrder & { items: PurchaseOrderItem[] },
    user: AuthenticatedUser,
  ): Promise<{ pedido: string }> {
    if (po.erpPedido) {
      this.logger.log(`PO ${po.id} já integrada (Linx PEDIDO=${po.erpPedido})`);
      return { pedido: po.erpPedido };
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
      include: { erpConfig: true },
    });
    if (!company.erpConfig) {
      throw new BadRequestException(
        `Empresa ${company.code} sem configuração de integração Linx ` +
          `(company_erp_configs). Configure antes de enviar pedidos ao ERP.`,
      );
    }

    // Resolve requisição para puxar os campos fiscais (tipoCompra/CTB/natureza).
    const req = await this.prisma.requisition.findUnique({
      where: { id: po.requisitionId },
    });
    if (!req) throw new NotFoundException('Requisição de origem não encontrada.');

    const cfg = company.erpConfig;
    const erpDb = company.erpDbName; // HML_GUESS | GUESS_PRODUCAO | DB_HRG3
    const tipoCompra = req.tipoCompra ?? cfg.tipoCompraDefault;
    const ctb = req.ctbTipoOperacao ?? cfg.ctbTipoOperacaoDefault;
    const natureza = req.naturezaEntrada ?? cfg.naturezaEntradaDefault;

    // Idempotência blindada: grava staging id antes de tocar o Linx.
    await this.prepareStagingId(po.id);
    const obsTag = `P2P PC ${po.number}`;

    // Recovery: se já gravamos no Linx em um retry anterior mas o UPDATE
    // local falhou, encontramos o PEDIDO pelo OBS e seguimos sem duplicar.
    const recovered = await this.findExistingPedidoByOBS(erpDb, obsTag);
    if (recovered) {
      this.logger.warn(
        `PO ${po.number}: PEDIDO ${recovered} já existe no Linx — re-acoplando sem duplicar.`,
      );
      return { pedido: recovered };
    }

    const aprovador = user.name ?? user.adUsername ?? '';
    // REQUERIDO_POR é login do usuário no Linx — não o nome amigável.
    // Coincide com o LOGIN da tabela LINX_USERS (mesmo formato do AD).
    const requeridoPor = user.adUsername ?? user.name ?? '';
    const total = Number(po.totalAmount);
    const start = Date.now();

    try {
      // Sem prisma.$transaction: as triggers padrão do Linx em COMPRAS
      // (LXI_COMPRAS / LXU_COMPRAS / LXUDT_COMPRAS — presentes tanto em
      // GUESS quanto em HML_GUESS / DB_HRG3) abrem/encerram sua própria
      // transação. Envolver tudo em $transaction dispara "The transaction
      // ended in the trigger. The batch has been aborted." Cada INSERT
      // vai isolado; idempotência via OBS (`P2P-${po.number}`) e checagem
      // de pedido existente protegem de duplicidade em retry.
      const pedido = await (async () => {
        const tx = this.prisma;
        // 1) Gera o nº do PEDIDO via LX_SEQUENCIAL (OUTPUT param). Procedure
        //    vive em <erpDb>.dbo.LX_SEQUENCIAL.
        const seqResult = await tx.$queryRawUnsafe<
          { sequencia: string }[]
        >(
          `DECLARE @seq VARCHAR(20);
           EXEC [${erpDb}].dbo.LX_SEQUENCIAL @TABELA_COLUNA = N'COMPRAS.PEDIDO',
                                             @SEQUENCIA = @seq OUTPUT;
           SELECT @seq AS sequencia;`,
        );
        const pedidoNum = seqResult[0]?.sequencia?.trim();
        if (!pedidoNum) {
          throw new InternalServerErrorException(
            'LX_SEQUENCIAL não devolveu número de PEDIDO.',
          );
        }
        const pedido = this.pad(pedidoNum, 8); // PEDIDO em COMPRAS é char(8)

        // 2) Cabeçalho.
        await tx.$executeRawUnsafe(
          // PEDIDO_UX é IDENTITY no Linx (auto-incremento) — não pode
          // ir explicitamente no INSERT (erro IDENTITY_INSERT off).
          `INSERT INTO [${erpDb}].dbo.COMPRAS
             (PEDIDO, FORNECEDOR, FILIAL_A_ENTREGAR, FILIAL_COBRANCA,
              FILIAL_A_FATURAR, CONDICAO_PGTO, TRANSPORTADORA, MOEDA,
              COD_TRANSACAO, EMISSAO, CADASTRAMENTO, APROVADO_POR,
              PEDIDO_FORNECEDOR, TOT_QTDE_ORIGINAL, TOT_VALOR_ORIGINAL,
              TABELA_FILHA, OBS, REQUERIDO_POR, TIPO_COMPRA,
              STATUS_APROVACAO, DATA_APROVACAO, STATUS_COMPRA,
              NATUREZA_ENTRADA, APROVADOR_POR, LX_STATUS_COMPRA,
              CTB_TIPO_OPERACAO, DATA_PARA_TRANSFERENCIA,
              ORIGEM_DA_COMPRA)
           VALUES
             (@P1, @P2, @P3, @P3, @P3, @P4, @P15, N'R$',
              @P5, GETDATE(), GETDATE(), @P6,
              N' ', @P7, @P8,
              @P9, @P10, @P11, @P12,
              N'A', GETDATE(), N'A ',
              @P13, @P6, 1,
              @P14, GETDATE(),
              @P16)`,
          pedido,
          this.trunc(po.supplierName, 25, 'FORNECEDOR') ?? '',
          this.trunc(po.branchName, 25, 'FILIAL') ?? '',
          this.trunc(po.paymentCondition, 3, 'CONDICAO_PGTO') ?? '',
          this.trunc(cfg.codTransacao, 23, 'COD_TRANSACAO'),
          this.trunc(aprovador, 25, 'APROVADO_POR'),
          this.sumQty(po.items),
          total,
          this.trunc(cfg.tabelaFilha, 18, 'TABELA_FILHA'),
          obsTag, // OBS: rastreio P2P (≤ 60 chars usual)
          this.trunc(requeridoPor, 25, 'REQUERIDO_POR'),
          this.trunc(tipoCompra, 25, 'TIPO_COMPRA'),
          this.trunc(natureza, 15, 'NATUREZA_ENTRADA'),
          ctb,
          // @P15 — TRANSPORTADORA. Trigger LXI_COMPRAS valida FK em
          // TRANSPORTADORAS; sem valor o trigger faz rollback (dá
          // "The transaction ended in the trigger"). O PO já valida
          // existência no convert() — fallback pro default da empresa
          // se o PO não tiver escolha explícita.
          this.trunc(
            po.transportadora ?? cfg.transportadoraPadrao,
            25,
            'TRANSPORTADORA',
          ) ?? '',
          // @P16 — ORIGEM_DA_COMPRA (varchar(15)): rastreio P2P↔Linx
          // com o número P2P completo (ex.: "OC-2026-000123" — 14 chars).
          this.trunc(po.number, 15, 'ORIGEM_DA_COMPRA') ?? '',
        );

        // 3) Itens.
        for (const it of po.items) {
          const qty = Number(it.quantity);
          const unit = Number(it.unitPrice);
          const totalIt = Number(it.totalPrice);
          await tx.$executeRawUnsafe(
            `INSERT INTO [${erpDb}].dbo.COMPRAS_CONSUMIVEL
               (CONSUMIVEL, ENTREGA, PEDIDO, DESC_CONSUMIVEL,
                LIMITE_ENTREGA, CUSTO, UNIDADE, QTDE_ORIGINAL,
                QTDE_ENTREGAR, VALOR_ORIGINAL, VALOR_ENTREGAR,
                RATEIO_FILIAL, RATEIO_CENTRO_CUSTO, CONTA_CONTABIL,
                CODIGO_ITEM, REFERENCIA)
             VALUES
               (@P1, @P2, @P3, @P4,
                @P2, @P5, @P6, @P7,
                @P7, @P8, @P8,
                @P9, @P10, @P11,
                @P1, @P1)`,
            this.trunc(it.itemErpCode ?? it.itemDescription, 50, 'CONSUMIVEL') ?? '',
            po.expectedDelivery ?? new Date(),
            pedido,
            this.trunc(it.itemDescription, 250, 'DESC_CONSUMIVEL') ?? '',
            unit,
            this.trunc(it.unit, 5, 'UNIDADE') ?? 'UN',
            qty,
            totalIt,
            this.trunc(it.branchRateioCode, 15, 'RATEIO_FILIAL') ?? '',
            this.trunc(it.costCenterRateioCode, 15, 'RATEIO_CENTRO_CUSTO') ?? '',
            this.trunc(it.accountingAccount, 20, 'CONTA_CONTABIL') ?? '',
          );
        }

        // 4) Log de status.
        await tx.$executeRawUnsafe(
          `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
             (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
           VALUES (@P1, GETDATE(), N'A ', @P2)`,
          pedido,
          this.trunc(aprovador, 25, 'USUARIO') ?? '',
        );

        return pedido;
      })();

      await this.writeIntegrationLog({
        companyId: po.companyId,
        erpDbName: erpDb,
        jobType: 'SEND_PO',
        status: IntegrationLogStatus.SUCCESS,
        recordsProcessed: 1 + po.items.length + 1, // cabeçalho + itens + log
        durationMs: Date.now() - start,
      });

      this.logger.log(`PC ${po.number} gravado no Linx como PEDIDO=${pedido}`);
      return { pedido };
    } catch (err) {
      const errorMsg = (err as Error).message;
      await this.writeIntegrationLog({
        companyId: po.companyId,
        erpDbName: erpDb,
        jobType: 'SEND_PO',
        status: IntegrationLogStatus.FAILED,
        recordsProcessed: 0,
        durationMs: Date.now() - start,
        errorDetails: errorMsg,
      });
      this.logger.error(
        `Falha ao gravar PC ${po.number} no Linx (${erpDb}): ${errorMsg}`,
      );
      throw new InternalServerErrorException(
        `Falha na gravação no ERP: ${errorMsg}`,
      );
    }
  }

  /** Soma as quantidades dos itens (TOT_QTDE_ORIGINAL do cabeçalho). */
  private sumQty(items: PurchaseOrderItem[]): number {
    return items.reduce((s, it) => s + Number(it.quantity), 0);
  }

  /**
   * Grava log do envio de e-mail em `COMPRAS_EMAIL_LOG`. Substituímos o
   * antigo `ISNULL(MAX(ID_LOG), 0) + 1` (race condition) pelo sequencial
   * nativo do Linx — `LX_SEQUENCIAL('COMPRAS_EMAIL_LOG.ID_LOG')`. Se o
   * sequencial não existir no ambiente, caímos no MAX+1 como fallback e
   * registramos um warning para o DBA criar o sequencial.
   * Não joga exceção: log é melhor-esforço.
   */
  async logEmail(
    erpDbName: string,
    pedido: string,
    destinatario: string,
    usuario: string,
    obs?: string,
  ): Promise<void> {
    try {
      let idLog: number | null = null;
      try {
        const seq = await this.prisma.$queryRawUnsafe<
          { sequencia: string }[]
        >(
          `DECLARE @seq VARCHAR(20);
           EXEC [${erpDbName}].dbo.LX_SEQUENCIAL @TABELA_COLUNA = N'COMPRAS_EMAIL_LOG.ID_LOG',
                                                 @SEQUENCIA = @seq OUTPUT;
           SELECT @seq AS sequencia;`,
        );
        const raw = seq[0]?.sequencia?.trim();
        idLog = raw ? Number(raw) : null;
      } catch (err) {
        this.logger.warn(
          `LX_SEQUENCIAL('COMPRAS_EMAIL_LOG.ID_LOG') indisponível — ` +
            `usando MAX+1 (sujeito a race). Pedir ao DBA do Linx para criar o sequencial. ` +
            `Detalhe: ${(err as Error).message}`,
        );
      }

      if (idLog != null && !Number.isNaN(idLog)) {
        await this.prisma.$executeRawUnsafe(
          `INSERT INTO [${erpDbName}].dbo.COMPRAS_EMAIL_LOG
             (ID_LOG, PEDIDO, DESTINATARIO, DATA_HORA, OBS_STATUS, USUARIO)
           VALUES (@P5, @P1, @P2, GETDATE(), @P3, @P4)`,
          this.trunc(pedido, 8, 'PEDIDO') ?? '',
          this.trunc(destinatario, 255, 'DESTINATARIO') ?? '',
          this.trunc(obs ?? 'Envio P2P', 255, 'OBS_STATUS') ?? '',
          this.trunc(usuario, 50, 'USUARIO') ?? '',
          idLog,
        );
      } else {
        // Fallback: MAX+1 dentro de uma transação isolada para reduzir o
        // intervalo entre SELECT e INSERT. Não elimina race, só atenua.
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `INSERT INTO [${erpDbName}].dbo.COMPRAS_EMAIL_LOG
               (ID_LOG, PEDIDO, DESTINATARIO, DATA_HORA, OBS_STATUS, USUARIO)
             VALUES (
               (SELECT ISNULL(MAX(ID_LOG), 0) + 1 FROM [${erpDbName}].dbo.COMPRAS_EMAIL_LOG WITH (TABLOCKX, HOLDLOCK)),
               @P1, @P2, GETDATE(), @P3, @P4
             )`,
            this.trunc(pedido, 8, 'PEDIDO') ?? '',
            this.trunc(destinatario, 255, 'DESTINATARIO') ?? '',
            this.trunc(obs ?? 'Envio P2P', 255, 'OBS_STATUS') ?? '',
            this.trunc(usuario, 50, 'USUARIO') ?? '',
          );
        });
      }
    } catch (err) {
      this.logger.warn(
        `Falha ao registrar COMPRAS_EMAIL_LOG (${pedido}): ${(err as Error).message}`,
      );
    }
  }

  /**
   * Grava registro em `integration_logs`. Best-effort — se falhar, apenas
   * loga no console. A falha não invalida a operação principal.
   */
  private async writeIntegrationLog(params: {
    companyId: string;
    erpDbName: string;
    jobType: string;
    status: string;
    recordsProcessed: number;
    durationMs: number;
    errorDetails?: string;
  }): Promise<void> {
    try {
      // Source segue a convenção SPEC § 1 (ERP_GUESS / ERP_HRG3).
      const source = params.erpDbName.includes('HRG3')
        ? 'ERP_HRG3'
        : 'ERP_GUESS';
      await this.prisma.integrationLog.create({
        data: {
          companyId: params.companyId,
          source,
          jobType: params.jobType,
          status: params.status,
          recordsProcessed: params.recordsProcessed,
          durationMs: params.durationMs,
          errorDetails: params.errorDetails ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar integration_log: ${(err as Error).message}`,
      );
    }
  }
}
