import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FundRequest,
  FundRequestItem,
  PurchaseOrder,
  PurchaseOrderItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { IntegrationLogStatus } from '../common/enums';
import { safeDbName } from '../common/erp/safe-db-name';
import { KeyedMutex } from '../common/util/keyed-mutex';
import {
  publicErpErrorMessage,
  sanitizeErpErrorDetail,
} from '../common/erp/erp-error-sanitizer';

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
  /**
   * Serializa o cadastro de fornecedor por `${erpDb}:${cnpj}` — o
   * check-then-insert no master data do Linx não é atômico; sem isso, dois
   * converts concorrentes do mesmo fornecedor novo criariam CLIFOR
   * duplicado. Escopo: processo único (pm2 fork). Ver KeyedMutex.
   */
  private readonly supplierLock = new KeyedMutex();

  /**
   * Cache lazy da moeda padrão por banco — `dbo.MOEDAS.INDICA_PADRAO=1`.
   * O Linx armazena moeda como `char(6)` com padding à direita, mas as
   * outras colunas que usam moeda (COMPRAS.MOEDA, CTB_*.MOEDA etc.)
   * aceitam o valor já trimado, então cachamos o código limpo.
   *
   * TTL de 1h — moeda padrão muda raramente; em caso de mudança, basta
   * reiniciar o backend.
   */
  private readonly moedaPadraoCache = new Map<
    string,
    { code: string; at: number }
  >();
  private readonly MOEDA_CACHE_TTL_MS = 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devolve o código da moeda padrão do Linx (R$ no caso GUESS/HRG3).
   * Lê de `dbo.MOEDAS WHERE INDICA_PADRAO=1` com cache em memória.
   * Em caso de qualquer falha, devolve 'R$' como fallback seguro —
   * 100% das empresas brasileiras Linx usam Real como padrão.
   */
  private async getDefaultMoeda(erpDb: string): Promise<string> {
    const safeDb = safeDbName(erpDb);
    const cached = this.moedaPadraoCache.get(safeDb);
    if (cached && Date.now() - cached.at < this.MOEDA_CACHE_TTL_MS) {
      return cached.code;
    }
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ MOEDA: string }[]>(
        `SELECT TOP 1 MOEDA FROM [${safeDb}].dbo.MOEDAS WITH (NOLOCK)
         WHERE INDICA_PADRAO = 1`,
      );
      const code = (rows[0]?.MOEDA ?? 'R$').trim() || 'R$';
      this.moedaPadraoCache.set(safeDb, { code, at: Date.now() });
      return code;
    } catch (e) {
      this.logger.warn(
        `Falha lendo MOEDA padrão de ${erpDb}: ${(e as Error).message} — usando 'R$'`,
      );
      return 'R$';
    }
  }

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
    const safeDb = safeDbName(erpDb);
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ PEDIDO: string }[]>(
        `SELECT TOP 1 PEDIDO FROM [${safeDb}].dbo.COMPRAS WHERE OBS = @P1 ORDER BY EMISSAO DESC`,
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
    po: {
      id: string;
      companyId: string;
      erpPedido: string | null;
      number: string;
    },
    reason: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!po.erpPedido) return;
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });
    const erpDb = safeDbName(company.erpDbName);
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
    po: {
      id: string;
      companyId: string;
      erpPedido: string | null;
      number: string;
    },
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!po.erpPedido) return;
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });
    const erpDb = safeDbName(company.erpDbName);
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
    if (!req)
      throw new NotFoundException('Requisição de origem não encontrada.');

    const cfg = company.erpConfig;
    const erpDb = safeDbName(company.erpDbName); // HML_GUESS | GUESS_PRODUCAO | DB_HRG3
    const tipoCompra = req.tipoCompra ?? cfg.tipoCompraDefault;
    const ctb = req.ctbTipoOperacao ?? cfg.ctbTipoOperacaoDefault;
    const natureza = req.naturezaEntrada ?? cfg.naturezaEntradaDefault;

    // COMPRAS.FORNECEDOR é FK para FORNECEDORES.FORNECEDOR (o NOME gravado
    // no cadastro, NÃO o clifor — ver trigger LXI_COMPRAS). Buscamos o
    // nome canônico pelo CLIFOR (supplierErpCode) para garantir o match
    // do FK — senão a razão social do PC pode divergir do nome curto
    // gravado em FORNECEDORES e o trigger rejeita. Fallback: nome do PC.
    let fornecedorNome = po.supplierName;
    if (po.supplierErpCode) {
      const fornRows = await this.prisma.$queryRawUnsafe<
        Array<{ FORNECEDOR: string }>
      >(
        `SELECT TOP 1 FORNECEDOR FROM [${erpDb}].dbo.FORNECEDORES WHERE CLIFOR = @P1`,
        po.supplierErpCode,
      );
      if (fornRows[0]?.FORNECEDOR) {
        fornecedorNome = String(fornRows[0].FORNECEDOR).trim();
      }
    }

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

    // C7 — compensação por falha parcial: rastreamos `pedidoCriado`
    // após o INSERT do cabeçalho. Se qualquer INSERT de item falhar,
    // o bloco catch apaga os itens parciais e o cabeçalho do Linx antes
    // de relançar — próximo retry começa do zero sem pedido manco.
    let pedidoCriado: string | null = null;

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
        const seqResult = await tx.$queryRawUnsafe<{ sequencia: string }[]>(
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

        // 2) Cabeçalho. Moeda lida da tabela MOEDAS (cache lazy) em
        //    vez de hardcode — protege contra empresa que altera o
        //    padrão (raro, mas barato de fazer certo).
        const moeda = await this.getDefaultMoeda(erpDb);
        await tx.$executeRawUnsafe(
          // PEDIDO_UX é IDENTITY no Linx (auto-incremento) — não pode
          // ir explicitamente no INSERT (erro IDENTITY_INSERT off).
          // Após este ponto: pedidoCriado é marcado, compensação ativa.
          `INSERT INTO [${erpDb}].dbo.COMPRAS
             (PEDIDO, FORNECEDOR, FILIAL_A_ENTREGAR, FILIAL_COBRANCA,
              FILIAL_A_FATURAR, CONDICAO_PGTO, TRANSPORTADORA, MOEDA,
              COD_TRANSACAO, EMISSAO, CADASTRAMENTO, APROVADO_POR,
              PEDIDO_FORNECEDOR, TOT_QTDE_ORIGINAL, TOT_QTDE_ENTREGAR,
              TOT_VALOR_ORIGINAL, TOT_VALOR_ENTREGAR,
              TABELA_FILHA, OBS, REQUERIDO_POR, TIPO_COMPRA,
              STATUS_APROVACAO, DATA_APROVACAO, STATUS_COMPRA,
              NATUREZA_ENTRADA, APROVADOR_POR, LX_STATUS_COMPRA,
              CTB_TIPO_OPERACAO, DATA_PARA_TRANSFERENCIA,
              ORIGEM_DA_COMPRA)
           VALUES
             (@P1, @P2, @P3, @P3, @P3, @P4, @P15, @P17,
              @P5, GETDATE(), GETDATE(), @P6,
              N' ', @P7, @P7, @P8, @P8,
              @P9, @P10, @P11, @P12,
              N'A', GETDATE(), N'A ',
              @P13, @P6, 1,
              @P14, GETDATE(),
              @P16)`,
          pedido,
          this.trunc(fornecedorNome, 25, 'FORNECEDOR') ?? '',
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
          // @P17 — MOEDA padrão da empresa (lida de dbo.MOEDAS).
          moeda,
        );
        pedidoCriado = pedido; // cabeçalho confirmado — compensação ativa

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
            this.trunc(
              it.itemErpCode ?? it.itemDescription,
              50,
              'CONSUMIVEL',
            ) ?? '',
            po.expectedDelivery ?? new Date(),
            pedido,
            this.trunc(it.itemDescription, 250, 'DESC_CONSUMIVEL') ?? '',
            unit,
            this.trunc(it.unit, 5, 'UNIDADE') ?? 'UN',
            qty,
            totalIt,
            this.trunc(it.branchRateioCode, 15, 'RATEIO_FILIAL') ?? '',
            this.trunc(it.costCenterRateioCode, 15, 'RATEIO_CENTRO_CUSTO') ??
              '',
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

        pedidoCriado = null; // tudo confirmado — compensação desativada
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
      const safeErrorMsg = sanitizeErpErrorDetail(err);

      // C7 — compensação: se o cabeçalho entrou mas algo depois falhou
      // (item parcial), desfazemos no Linx para que o próximo retry parta
      // do zero sem pedido manco. Itens primeiro (FK), cabeçalho depois.
      // O fluxo da IIFE acima faz o TS estreitar `pedidoCriado` a `never`
      // aqui; relemos via uma cópia tipada explicitamente como string.
      const pedidoParaCompensar = pedidoCriado as string | null;
      if (pedidoParaCompensar) {
        const pedidoStr: string = pedidoParaCompensar;
        try {
          await this.prisma.$executeRawUnsafe(
            `DELETE FROM [${erpDb}].dbo.COMPRAS_CONSUMIVEL WHERE PEDIDO = @P1`,
            pedidoStr,
          );
          await this.prisma.$executeRawUnsafe(
            `DELETE FROM [${erpDb}].dbo.COMPRAS WHERE PEDIDO = @P1`,
            pedidoStr,
          );
          this.logger.warn(
            `C7: compensação aplicada — PEDIDO ${pedidoStr} removido do Linx após falha parcial em ${po.number}`,
          );
        } catch (compErr) {
          // Falha na compensação: loga com urgência — requer intervenção manual.
          this.logger.error(
            `C7: falha na compensação do PEDIDO ${pedidoStr} (${erpDb}) — pedido parcial pendente de limpeza manual: ${(compErr as Error).message}`,
          );
        }
      }

      await this.writeIntegrationLog({
        companyId: po.companyId,
        erpDbName: erpDb,
        jobType: 'SEND_PO',
        status: IntegrationLogStatus.FAILED,
        recordsProcessed: 0,
        durationMs: Date.now() - start,
        errorDetails: safeErrorMsg,
      });
      this.logger.error(
        `Falha ao gravar PC ${po.number} no Linx (${erpDb}): ${errorMsg}`,
      );
      throw new InternalServerErrorException(publicErpErrorMessage(err));
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
    const safeDb = safeDbName(erpDbName);
    try {
      let idLog: number | null = null;
      try {
        const seq = await this.prisma.$queryRawUnsafe<{ sequencia: string }[]>(
          `DECLARE @seq VARCHAR(20);
           EXEC [${safeDb}].dbo.LX_SEQUENCIAL @TABELA_COLUNA = N'COMPRAS_EMAIL_LOG.ID_LOG',
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
          `INSERT INTO [${safeDb}].dbo.COMPRAS_EMAIL_LOG
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
            `INSERT INTO [${safeDb}].dbo.COMPRAS_EMAIL_LOG
               (ID_LOG, PEDIDO, DESTINATARIO, DATA_HORA, OBS_STATUS, USUARIO)
             VALUES (
               (SELECT ISNULL(MAX(ID_LOG), 0) + 1 FROM [${safeDb}].dbo.COMPRAS_EMAIL_LOG WITH (TABLOCKX, HOLDLOCK)),
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

  /*
   * ============================================================
   * TODO: createSupplier — cadastro automático no Linx
   * ============================================================
   *
   * Disparado quando uma cotação vencedora tem `supplierErpCode = null`
   * e o admin/cron decide processar (`requisition.needsSupplierErpCreation`).
   * Schema descoberto via inspeção (scripts/inspect-linx-supplier*.ts).
   *
   * PASSO 1 — Sequencial:
   *
   *   DECLARE @CLIFOR CHAR(6);
   *   EXEC dbo.LX_SEQUENCIAL 'FORNECEDORES.CLIFOR', NULL, @CLIFOR OUTPUT;
   *
   *   Tamanho = 6, padding com zero à esquerda (já formatado pela proc).
   *   O pool é compartilhado com CLIENTES_ATACADO.CLIFOR e FILIAIS.CLIFOR
   *   — mesmo espaço de IDs do CADASTRO_CLI_FOR.
   *
   * PASSO 2 — INSERT em `dbo.CADASTRO_CLI_FOR` (mestre cliente/fornecedor):
   *
   *   NOT NULL sem default que PRECISAMOS preencher:
   *     CLIFOR             char(6)      ← @CLIFOR
   *     NOME_CLIFOR        varchar(25)  ← nome curto (truncar pra 25!)
   *     RAZAO_SOCIAL       varchar(90)  ← supplierName (BrasilAPI)
   *     CGC_CPF            varchar(19)  ← supplierCnpj
   *     RG_IE              varchar(19)  ← 'ISENTO' (não temos IE do CNPJ)
   *     UF                 char(2)      ← supplierUf
   *     COBRANCA_UF        char(2)      ← = UF
   *     ENTREGA_UF         char(2)      ← = UF
   *     COBRANCA_CGC       varchar(19)  ← = CGC_CPF
   *     ENTREGA_CGC        varchar(19)  ← = CGC_CPF
   *     COBRANCA_IE        varchar(19)  ← = RG_IE
   *     ENTREGA_IE         varchar(19)  ← = RG_IE
   *     CADASTRAMENTO      datetime     ← GETDATE()
   *
   *   Flags NOT NULL com default 0 que PRECISAMOS sobrescrever:
   *     PJ_PF              bit          ← 1 (PJ) se cnpj.length === 14
   *     INDICA_FORNECEDOR  bit          ← 1 (este registro é fornecedor)
   *
   *   Opcionais (do que veio da BrasilAPI):
   *     ENDERECO, NUMERO (não tem coluna — vai no ENDERECO), BAIRRO,
   *     CIDADE, CEP, TELEFONE1, DDD1, e os equivalentes COBRANCA_* e
   *     ENTREGA_* (copiar do principal).
   *
   * PASSO 3 — INSERT em `dbo.FORNECEDORES` (dados específicos):
   *
   *   NOT NULL sem default:
   *     COD_FORNECEDOR     char(6)      ← = @CLIFOR
   *     CLIFOR             char(6)      ← = @CLIFOR (FK)
   *     FORNECEDOR         varchar(25)  ← nome curto (= NOME_CLIFOR)
   *     CGC_CPF            varchar(19)  ← = CGC_CPF da master
   *     CONDICAO_PGTO      char(3)      ← q.paymentConditionCode (3 chars!)
   *
   *   Flags NOT NULL com default 0 que vale a pena sobrescrever:
   *     FORNECE_MAT_CONSUMO bit         ← 1 (P2P é compra de consumível)
   *     INATIVO            bit          ← 0 (já é o default mas explicitar)
   *
   * PASSO 4 — Atualiza P2P:
   *     UPDATE quotations SET supplierErpCode = @CLIFOR WHERE id = ...
   *     UPDATE requisitions SET supplierErpCode = @CLIFOR,
   *                             needsSupplierErpCreation = 0
   *      WHERE id = (req da cotação)
   *
   * PASSO 5 — integration_logs (jobType = 'CREATE_SUPPLIER'),
   *           status SUCCESS / FAILED, duração e erro detalhado.
   *
   * IDEMPOTÊNCIA: antes do INSERT, checar se já existe
   *   SELECT 1 FROM CADASTRO_CLI_FOR
   *    WHERE REPLACE(REPLACE(REPLACE(CGC_CPF,'.',''),'/',''),'-','') = @cnpj
   * — se existir, usar aquele CLIFOR e pular o INSERT (cobre o caso onde
   * outro processo cadastrou em paralelo).
   *
   * EXPOSIÇÃO: provavelmente um endpoint admin manual
   * `POST /admin/suppliers/from-quotation/:id` é o caminho mais seguro
   * pro MVP — admin valida na listagem de pendências e dispara um
   * por vez. Em uma fase 2, @Cron noturno que processa `needsSupplierErpCreation`.
   *
   * Dados disponíveis no `quotation` row (vieram da BrasilAPI):
   *   supplierCnpj, supplierName, supplierFantasia, supplierEmail,
   *   supplierTelefone, supplierLogradouro, supplierNumero, supplierBairro,
   *   supplierCidade, supplierUf, supplierCep, supplierCnae,
   *   paymentConditionCode.
   */

  /**
   * Insere os itens da SV em CTB_SOLICITACAO_VERBA_ITEM. Compartilhado
   * pela integração nova e pela recuperação (capa que ficou sem itens
   * por falha anterior). COD_CLIFOR vai NULL (nunca '') — o trigger
   * LXI valida FK em CADASTRO_CLI_FOR e aceita só NULL ou clifor real.
   */
  private async insertSvItems(
    erpDb: string,
    solicitacao: number,
    items: FundRequestItem[],
    codClifor: string | null,
  ): Promise<void> {
    const moedaSV = await this.getDefaultMoeda(erpDb);
    let idx = 1;
    for (const it of items) {
      const idItem = String(idx).padStart(4, '0');
      const valor = Number(it.amount);
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.CTB_SOLICITACAO_VERBA_ITEM
           (EMPRESA, SOLICITACAO_VERBA, ID_SOLICITACAO_ITEM,
            CONTA_CONTABIL, DESC_SOLICITACAO_VERBA_ITEM,
            VALOR_SOLICITADO, VALOR_SOLICITADO_PADRAO,
            VALOR_ORIGINAL, VALOR_ORIGINAL_PADRAO, VALOR_A_PAGAR,
            VENCIMENTO, VENCIMENTO_REAL, MOEDA,
            COD_CLIFOR, COD_FILIAL,
            RATEIO_FILIAL, RATEIO_CENTRO_CUSTO,
            BENEFICIARIO, BENEFICIARIO_BANCO,
            BENEFICIARIO_AGENCIA, BENEFICIARIO_CONTA_CORRENTE,
            LX_TIPO_LANCAMENTO, LX_VERBA_STATUS,
            TIPO_MOVIMENTO, INDICA_FLUXO, CAMBIO_NA_DATA_EMISSAO)
         VALUES
           (1, @P1, @P2, @P3, @P4,
            @P5, @P5, @P5, @P5, @P5,
            @P6, @P6, @P15,
            @P7, @P8,
            @P9, @P10,
            @P11, @P12, @P13, @P14,
            N'ITP', N'A',
            1, 1, 1)`,
        solicitacao,
        idItem,
        this.trunc(it.accountingAccount, 20, 'CONTA_CONTABIL') ?? '',
        this.trunc(it.description, 40, 'DESC_SV_ITEM') ?? '',
        valor,
        it.dueDate,
        // COD_CLIFOR = clifor do fornecedor do pedido (a SV é paga a ele).
        // O trigger LXI_CTB_SOLICITACAO_VERBA_ITEM valida FK em
        // CADASTRO_CLI_FOR e aceita só um clifor existente OU NULL — NUNCA
        // string vazia (daria "The transaction ended in the trigger").
        // Sem fornecedor cadastrado, cai em NULL (fallback aceito).
        this.trunc(codClifor, 6, 'COD_CLIFOR'),
        this.trunc(it.branchRateioCode, 6, 'COD_FILIAL') ?? '',
        this.trunc(it.branchRateioCode, 15, 'RATEIO_FILIAL') ?? '',
        this.trunc(it.costCenterRateioCode, 15, 'RATEIO_CENTRO_CUSTO') ?? '',
        this.trunc(it.beneficiaryName, 50, 'BENEFICIARIO') ?? '',
        this.trunc(it.beneficiaryBank, 4, 'BENEFICIARIO_BANCO') ?? '',
        this.trunc(it.beneficiaryAgency, 6, 'BENEFICIARIO_AGENCIA') ?? '',
        this.trunc(it.beneficiaryAccount, 20, 'BENEFICIARIO_CC') ?? '',
        moedaSV, // @P15
      );
      idx++;
    }
  }

  /**
   * Grava a Solicitação de Verba (SV / FundRequest) no Linx.
   *
   * Schema validado via inspeção do banco real (GUESS_PRODUCAO):
   *   - Sequencial `SOLICITACAO_VERBA` tamanho 6
   *   - Cabeçalho `CTB_SOLICITACAO_VERBA`: EMPRESA + SOLICITACAO_VERBA
   *   - Itens `CTB_SOLICITACAO_VERBA_ITEM`: EMPRESA + CONTA_CONTABIL +
   *     ID_SOLICITACAO_ITEM (char(4) zero-paddeado) + SOLICITACAO_VERBA
   *     + VALOR_SOLICITADO + VENCIMENTO + INDICA_FLUXO
   *
   * Idempotência: curto-circuito por `erpSolicitacao`; staging id em
   * `erpStagingId`; recovery via `VERBA_OBS LIKE 'P2P SV <number>%'`.
   */
  async gravarSolicitacaoVerba(
    sv: FundRequest & { items: FundRequestItem[] },
  ): Promise<{ solicitacao: string }> {
    if (sv.erpSolicitacao) {
      this.logger.log(
        `SV ${sv.number} já integrada (Linx SOLICITACAO=${sv.erpSolicitacao})`,
      );
      return { solicitacao: sv.erpSolicitacao };
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: sv.companyId },
    });
    // erpDb já validado pela allow-list central (safeDbName).
    const erpDb = safeDbName(company.erpDbName);

    // Clifor do fornecedor do pedido que originou a SV — vai em COD_CLIFOR
    // dos itens (a SV é paga ao fornecedor). String vazia/ausente → NULL
    // (o trigger só aceita clifor existente ou NULL). supplierErpCode é o
    // próprio código CLIFOR no Linx.
    const linkedPo = sv.purchaseOrderId
      ? await this.prisma.purchaseOrder.findUnique({
          where: { id: sv.purchaseOrderId },
          select: { supplierErpCode: true },
        })
      : null;
    const codClifor = linkedPo?.supplierErpCode || null;

    if (!sv.erpStagingId) {
      await this.prisma.fundRequest.update({
        where: { id: sv.id },
        data: { erpStagingId: `SV-${sv.id}`, pendingErpSince: new Date() },
      });
    }
    // OBS rastreio P2P. `sv.number` já vem com prefixo "SV-AAAA-NNNNNN"
    // (definido no schema do P2P), então só "P2P " é suficiente. Espelha
    // o padrão do PC ("P2P OC-2026-000001"). Usado também pelo recovery
    // idempotente (`findExistingSvByObs` faz LIKE 'P2P SV-…%').
    const obsTag = `P2P ${sv.number}`;

    const recovered = await this.findExistingSvByObs(erpDb, obsTag);
    if (recovered) {
      this.logger.warn(
        `SV ${sv.number}: SOLICITACAO ${recovered} já existe no Linx — re-acoplando.`,
      );
      // A capa pode ter ficado SEM itens se uma integração anterior
      // falhou no insert do item (o bug do COD_CLIFOR=''). Ao reintegrar,
      // completa os itens que faltam em vez de só re-acoplar a capa órfã.
      try {
        const itemRows = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
          `SELECT COUNT(*) AS n
             FROM [${erpDb}].dbo.CTB_SOLICITACAO_VERBA_ITEM
            WHERE EMPRESA = 1 AND SOLICITACAO_VERBA = @P1`,
          Number(recovered),
        );
        const existingItems = Number(itemRows[0]?.n ?? 0);
        if (existingItems === 0 && sv.items.length > 0) {
          this.logger.warn(
            `SV ${sv.number}: capa ${recovered} estava sem itens — inserindo ${sv.items.length}.`,
          );
          await this.insertSvItems(
            erpDb,
            Number(recovered),
            sv.items,
            codClifor,
          );
        }
      } catch (err) {
        const safeMsg = sanitizeErpErrorDetail(err);
        await this.prisma.fundRequest.update({
          where: { id: sv.id },
          data: {
            lastErpError: safeMsg.slice(0, 4000),
            lastErpAttemptAt: new Date(),
          },
        });
        throw err;
      }
      await this.prisma.fundRequest.update({
        where: { id: sv.id },
        data: {
          erpSolicitacao: recovered,
          integratedAt: new Date(),
          lastErpError: null,
          lastErpAttemptAt: new Date(),
        },
      });
      return { solicitacao: recovered };
    }

    const requester = await this.prisma.user.findUniqueOrThrow({
      where: { id: sv.requesterId },
      select: { adUsername: true, name: true },
    });
    const emitente = requester.name ?? requester.adUsername ?? '';
    const usuario = requester.adUsername ?? requester.name ?? '';
    const start = Date.now();

    try {
      const seqResult = await this.prisma.$queryRawUnsafe<
        { sequencia: string }[]
      >(
        `DECLARE @seq VARCHAR(20);
         EXEC [${erpDb}].dbo.LX_SEQUENCIAL @TABELA_COLUNA = N'SOLICITACAO_VERBA',
                                           @SEQUENCIA = @seq OUTPUT;
         SELECT @seq AS sequencia;`,
      );
      const raw = seqResult[0]?.sequencia?.trim();
      if (!raw) {
        throw new InternalServerErrorException(
          'LX_SEQUENCIAL não devolveu número de SOLICITACAO_VERBA.',
        );
      }
      const solicitacao = String(parseInt(raw, 10));

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.CTB_SOLICITACAO_VERBA
           (EMPRESA, SOLICITACAO_VERBA, DESC_SOLICITACAO_VERBA,
            VERBA_EMISSAO, VERBA_EMITENTE, USUARIO, VERBA_OBS,
            LX_VERBA_APROVACAO)
         VALUES
           (1, @P1, @P2, GETDATE(), @P3, @P4, @P5, N'A')`,
        Number(solicitacao),
        this.trunc(sv.title, 40, 'DESC_SOLICITACAO_VERBA') ?? '',
        this.trunc(emitente, 50, 'VERBA_EMITENTE') ?? '',
        this.trunc(usuario, 25, 'USUARIO') ?? '',
        // VERBA_OBS é varchar(250) — rastreio do P2P no Linx.
        // Quem olhar a SV no Linx vê direto qual número P2P originou.
        this.trunc(obsTag, 250, 'VERBA_OBS') ?? '',
      );

      await this.insertSvItems(erpDb, Number(solicitacao), sv.items, codClifor);

      await this.prisma.fundRequest.update({
        where: { id: sv.id },
        data: {
          erpSolicitacao: solicitacao,
          integratedAt: new Date(),
          // Limpa o flag de erro — se tentativas anteriores falharam, a UI
          // não pode continuar mostrando o aviso vermelho de "falha".
          lastErpError: null,
          lastErpAttemptAt: new Date(),
        },
      });

      await this.prisma.integrationLog.create({
        data: {
          companyId: sv.companyId,
          source: erpDb === 'DB_HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
          jobType: 'SEND_SV',
          status: IntegrationLogStatus.SUCCESS,
          recordsProcessed: 1 + sv.items.length,
          durationMs: Date.now() - start,
        },
      });
      this.logger.log(
        `SV ${sv.number} integrada (Linx SOLICITACAO=${solicitacao}, ${sv.items.length} item(s))`,
      );
      return { solicitacao };
    } catch (err) {
      const safeMsg = sanitizeErpErrorDetail(err);
      // Persiste o erro na própria SV — assim a UI consegue mostrar
      // "Falha na integração" com tooltip explicativo em vez de só "—"
      // silencioso na coluna Nº Linx. Best-effort: se o update falhar
      // (db down, etc.), pelo menos o integrationLog abaixo registra.
      try {
        await this.prisma.fundRequest.update({
          where: { id: sv.id },
          data: {
            lastErpError: safeMsg.slice(0, 4000),
            lastErpAttemptAt: new Date(),
          },
        });
      } catch (updErr) {
        this.logger.error(
          `SV ${sv.number}: falha ao salvar lastErpError — ${(updErr as Error).message}`,
        );
      }
      await this.prisma.integrationLog.create({
        data: {
          companyId: sv.companyId,
          source: erpDb === 'DB_HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
          jobType: 'SEND_SV',
          status: IntegrationLogStatus.FAILED,
          durationMs: Date.now() - start,
          errorDetails: `SV ${sv.number}: ${safeMsg}`,
        },
      });
      throw err;
    }
  }

  /**
   * Cadastra (ou reaproveita) um fornecedor no Linx a partir de dados
   * genéricos — fonte única usada pela cotação E pela requisição.
   * Idempotente por CNPJ (reaproveita CLIFOR existente). Insere em
   * CADASTRO_CLI_FOR + FORNECEDORES. NÃO atualiza o P2P nem grava
   * integration_log — isso fica com o chamador (que sabe o contexto).
   *
   * Retorna o CLIFOR e o nome gravado em FORNECEDORES.FORNECEDOR — esse
   * nome é a FK consumida por COMPRAS.FORNECEDOR (trigger LXI_COMPRAS),
   * então o chamador do pedido deve usá-lo, não a razão social.
   */
  private async ensureSupplierRegistered(
    erpDb: string,
    data: {
      cnpj: string | null;
      name: string;
      fantasia?: string | null;
      uf?: string | null;
      logradouro?: string | null;
      numero?: string | null;
      bairro?: string | null;
      cidade?: string | null;
      cep?: string | null;
      telefone?: string | null;
      paymentConditionCode?: string | null;
    },
  ): Promise<{ clifor: string; reused: boolean; fornecedorNome: string }> {
    const cnpj = (data.cnpj ?? '').replace(/\D/g, '');
    if (cnpj.length !== 14 && cnpj.length !== 11) {
      throw new BadRequestException(
        `CNPJ/CPF inválido (${cnpj.length} dígitos): ${data.cnpj ?? '(vazio)'}`,
      );
    }
    const isPJ = cnpj.length === 14;
    const nomeCurto =
      this.trunc(data.fantasia ?? data.name, 25, 'NOME_CLIFOR') ?? '';

    // Serializa por CNPJ: o check-then-insert abaixo NÃO é atômico no master
    // data do ERP; sem isso, dois converts concorrentes do mesmo fornecedor
    // novo criariam CLIFOR duplicado em CADASTRO_CLI_FOR. O lock in-process
    // basta no processo único (pm2 fork) — ver KeyedMutex.
    return this.supplierLock.run(`${erpDb}:${cnpj}`, async () => {
      // Idempotência cross-DB por CGC (armazenado com máscara no Linx).
      // CNPJ via @P1 (já é dígitos por replace(/\D/g), mas segue o padrão
      // parametrizado do resto do arquivo).
      const existing = await this.prisma.$queryRawUnsafe<
        Array<{ CLIFOR: string }>
      >(
        `SELECT TOP 1 CLIFOR FROM [${erpDb}].dbo.CADASTRO_CLI_FOR
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(CGC_CPF,'.',''),'/',''),'-',''),' ','') = @P1`,
        cnpj,
      );
      if (existing[0]?.CLIFOR) {
        const clifor = String(existing[0].CLIFOR).trim();
        // Nome real gravado em FORNECEDORES (pra alinhar COMPRAS.FORNECEDOR).
        const fornRows = await this.prisma.$queryRawUnsafe<
          Array<{ FORNECEDOR: string }>
        >(
          `SELECT TOP 1 FORNECEDOR FROM [${erpDb}].dbo.FORNECEDORES WHERE CLIFOR = @P1`,
          clifor,
        );
        const fornecedorNome = fornRows[0]?.FORNECEDOR
          ? String(fornRows[0].FORNECEDOR).trim()
          : nomeCurto;
        this.logger.warn(
          `Fornecedor CNPJ ${cnpj} já existia no Linx — reaproveitando CLIFOR ${clifor}`,
        );
        return { clifor, reused: true, fornecedorNome };
      }

      const seqResult = await this.prisma.$queryRawUnsafe<
        { sequencia: string }[]
      >(
        `DECLARE @seq VARCHAR(20);
       EXEC [${erpDb}].dbo.LX_SEQUENCIAL @TABELA_COLUNA = N'FORNECEDORES.CLIFOR',
                                         @SEQUENCIA = @seq OUTPUT;
       SELECT @seq AS sequencia;`,
      );
      const raw = seqResult[0]?.sequencia?.trim();
      if (!raw) {
        throw new InternalServerErrorException(
          'LX_SEQUENCIAL não devolveu CLIFOR.',
        );
      }
      const clifor = raw.padStart(6, '0').slice(0, 6);

      const uf = this.trunc(data.uf, 2, 'UF') ?? 'SP';
      const razao = this.trunc(data.name, 90, 'RAZAO_SOCIAL');
      const cgcMasked = isPJ
        ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
        : `${cnpj.slice(0, 3)}.${cnpj.slice(3, 6)}.${cnpj.slice(6, 9)}-${cnpj.slice(9)}`;
      const endereco = this.trunc(
        data.logradouro
          ? `${data.logradouro}${data.numero ? ', ' + data.numero : ''}`
          : null,
        60,
        'ENDERECO',
      );
      const bairro = this.trunc(data.bairro, 25, 'BAIRRO');
      const cidade = this.trunc(data.cidade, 25, 'CIDADE');
      const cep = this.trunc((data.cep ?? '').replace(/\D/g, ''), 9, 'CEP');
      const tel = this.trunc(
        (data.telefone ?? '').replace(/\D/g, ''),
        15,
        'TELEFONE1',
      );

      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.CADASTRO_CLI_FOR
         (CLIFOR, NOME_CLIFOR, RAZAO_SOCIAL, CGC_CPF, RG_IE,
          UF, COBRANCA_UF, ENTREGA_UF,
          COBRANCA_CGC, ENTREGA_CGC, COBRANCA_IE, ENTREGA_IE,
          ENDERECO, BAIRRO, CIDADE, CEP, TELEFONE1,
          COBRANCA_ENDERECO, COBRANCA_BAIRRO, COBRANCA_CIDADE, COBRANCA_CEP,
          CADASTRAMENTO, PJ_PF, INDICA_FORNECEDOR, INDICA_CLIENTE)
       VALUES
         (@P1, @P2, @P3, @P4, N'ISENTO',
          @P5, @P5, @P5,
          @P4, @P4, N'ISENTO', N'ISENTO',
          @P6, @P7, @P8, @P9, @P10,
          @P6, @P7, @P8, @P9,
          GETDATE(), @P11, 1, 0)`,
        clifor,
        nomeCurto,
        razao ?? '',
        cgcMasked,
        uf,
        endereco ?? '',
        bairro ?? '',
        cidade ?? '',
        cep ?? '',
        tel ?? '',
        isPJ ? 1 : 0,
      );

      const condPgto =
        this.trunc(data.paymentConditionCode, 3, 'CONDICAO_PGTO') ?? '030';
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.FORNECEDORES
         (COD_FORNECEDOR, CLIFOR, FORNECEDOR, CGC_CPF, CONDICAO_PGTO,
          FORNECE_MAT_CONSUMO, INATIVO)
       VALUES
         (@P1, @P1, @P2, @P3, @P4, 1, 0)`,
        clifor,
        nomeCurto,
        cgcMasked,
        condPgto,
      );

      this.logger.log(
        `Fornecedor cadastrado no Linx: CLIFOR=${clifor} CNPJ=${cnpj} nome="${nomeCurto}"`,
      );
      return { clifor, reused: false, fornecedorNome: nomeCurto };
    });
  }

  /**
   * Garante o cadastro do fornecedor de uma REQUISIÇÃO no Linx e devolve
   * o CLIFOR. Idempotente: se a req já tem `supplierErpCode`, devolve.
   * Usa os campos `supplier*` da própria requisição (CNPJ + endereço),
   * preenchidos quando o solicitante escolhe um fornecedor externo —
   * cobre inclusive o fluxo de DISPENSA de cotação (sem Quotation).
   */
  async ensureSupplierForRequisition(requisitionId: string): Promise<string> {
    const req = await this.prisma.requisition.findUniqueOrThrow({
      where: { id: requisitionId },
      include: { company: true },
    });
    if (req.supplierErpCode) return req.supplierErpCode;

    const erpDb = safeDbName(req.company.erpDbName);
    const start = Date.now();
    try {
      const { clifor, reused } = await this.ensureSupplierRegistered(erpDb, {
        cnpj: req.supplierCnpj,
        name: req.supplierName,
        fantasia: req.supplierFantasia,
        uf: req.supplierUf,
        logradouro: req.supplierLogradouro,
        numero: req.supplierNumero,
        bairro: req.supplierBairro,
        cidade: req.supplierCidade,
        cep: req.supplierCep,
        telefone: req.supplierTelefone,
        paymentConditionCode: req.paymentConditionCode,
      });
      await this.prisma.requisition.update({
        where: { id: req.id },
        data: { supplierErpCode: clifor, needsSupplierErpCreation: false },
      });
      await this.prisma.integrationLog.create({
        data: {
          companyId: req.companyId,
          source: erpDb === 'DB_HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
          jobType: 'CREATE_SUPPLIER',
          status: IntegrationLogStatus.SUCCESS,
          recordsProcessed: reused ? 0 : 2,
          durationMs: Date.now() - start,
        },
      });
      return clifor;
    } catch (err) {
      const safeMsg = sanitizeErpErrorDetail(err);
      await this.prisma.integrationLog.create({
        data: {
          companyId: req.companyId,
          source: erpDb === 'DB_HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
          jobType: 'CREATE_SUPPLIER',
          status: IntegrationLogStatus.FAILED,
          durationMs: Date.now() - start,
          errorDetails: `req ${req.number}: ${safeMsg}`,
        },
      });
      throw err;
    }
  }

  /**
   * Cadastra um fornecedor novo no Linx a partir de uma cotação
   * vencedora cujo `supplierErpCode` ainda está null.
   *
   * Schema validado via INFORMATION_SCHEMA (CADASTRO_CLI_FOR +
   * FORNECEDORES). Sequencial: `FORNECEDORES.CLIFOR` (tamanho 6).
   *
   * Fluxo:
   *  1) Idempotência por CNPJ: se já existe em CADASTRO_CLI_FOR com
   *     mesmo CGC_CPF (limpando máscara), reaproveita o CLIFOR.
   *  2) `LX_SEQUENCIAL('FORNECEDORES.CLIFOR')` → novo CLIFOR de 6 chars.
   *  3) INSERT em CADASTRO_CLI_FOR (mestre cli/for) com todos os
   *     campos NOT NULL preenchidos. PJ_PF=1 (PJ), INDICA_FORNECEDOR=1.
   *  4) INSERT em FORNECEDORES (dados específicos). FORNECE_MAT_CONSUMO=1.
   *  5) UPDATE quotations.supplierErpCode + requisitions.supplierErpCode
   *     + needsSupplierErpCreation=false.
   *  6) Log em integration_logs (jobType='CREATE_SUPPLIER').
   *
   * Dispara: chamado pelo fluxo de aprovação da requisição quando a
   * cotação vencedora tem `supplierErpCode=null`. Também exposto via
   * endpoint admin `POST /admin/suppliers/from-quotation/:id` pra
   * reprocessamento manual.
   */
  async criarFornecedorDeQuotation(
    quotationId: string,
  ): Promise<{ clifor: string; reused: boolean }> {
    const quotation = await this.prisma.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      include: { requisition: true },
    });

    // Idempotência no P2P: cotação já tem fornecedor? só devolve.
    if (quotation.supplierErpCode) {
      return { clifor: quotation.supplierErpCode, reused: true };
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: quotation.companyId },
      include: { erpConfig: true },
    });
    // erpDb já validado pela allow-list central (safeDbName).
    const erpDb = safeDbName(company.erpDbName);
    const start = Date.now();

    try {
      // Cadastro/idempotência centralizados em ensureSupplierRegistered
      // (mesma lógica usada pela requisição). Aqui só passamos os dados
      // da cotação e tratamos os updates do P2P + log.
      const { clifor, reused } = await this.ensureSupplierRegistered(erpDb, {
        cnpj: quotation.supplierCnpj,
        name: quotation.supplierName,
        fantasia: quotation.supplierFantasia,
        uf: quotation.supplierUf,
        logradouro: quotation.supplierLogradouro,
        numero: quotation.supplierNumero,
        bairro: quotation.supplierBairro,
        cidade: quotation.supplierCidade,
        cep: quotation.supplierCep,
        telefone: quotation.supplierTelefone,
        paymentConditionCode: quotation.paymentConditionCode,
      });

      // 5) Atualiza P2P — cotação + requisição.
      await this.prisma.quotation.update({
        where: { id: quotationId },
        data: { supplierErpCode: clifor },
      });
      if (quotation.requisition.needsSupplierErpCreation) {
        await this.prisma.requisition.update({
          where: { id: quotation.requisitionId },
          data: {
            supplierErpCode: clifor,
            needsSupplierErpCreation: false,
          },
        });
      }

      await this.prisma.integrationLog.create({
        data: {
          companyId: quotation.companyId,
          source: erpDb === 'DB_HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
          jobType: 'CREATE_SUPPLIER',
          status: IntegrationLogStatus.SUCCESS,
          recordsProcessed: reused ? 0 : 2,
          durationMs: Date.now() - start,
        },
      });
      return { clifor, reused };
    } catch (err) {
      const safeMsg = sanitizeErpErrorDetail(err);
      await this.prisma.integrationLog.create({
        data: {
          companyId: quotation.companyId,
          source: erpDb === 'DB_HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
          jobType: 'CREATE_SUPPLIER',
          status: IntegrationLogStatus.FAILED,
          durationMs: Date.now() - start,
          errorDetails: `quotation ${quotationId}: ${safeMsg}`,
        },
      });
      throw err;
    }
  }

  /**
   * Procura SV no Linx pela marca OBS — usado pra retry idempotente.
   */
  private async findExistingSvByObs(
    erpDb: string,
    obsTag: string,
  ): Promise<string | null> {
    const safeDb = safeDbName(erpDb);
    // Escapa quote, %, _, [ (operadores LIKE) e fecha com ESCAPE '\\'
    // para que o sufixo % continue sendo wildcard mas o obsTag não vire
    // padrão. Sem isso, marcas com % ou _ no obsTag matchariam coisas
    // erradas (audit A9 — defesa adicional).
    const obsEscaped = obsTag
      .replace(/[\\%_[]/g, (m) => '\\' + m)
      .replace(/'/g, "''");
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ SOLICITACAO_VERBA: number }>
    >(
      `SELECT TOP 1 SOLICITACAO_VERBA FROM [${safeDb}].dbo.CTB_SOLICITACAO_VERBA
       WHERE VERBA_OBS LIKE N'${obsEscaped}%' ESCAPE '\\'
       ORDER BY SOLICITACAO_VERBA DESC`,
    );
    return rows[0]?.SOLICITACAO_VERBA
      ? String(rows[0].SOLICITACAO_VERBA)
      : null;
  }
}
