import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrder, PurchaseOrderItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

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
 * DB_HRG3). O P2P chega no Linx APROVADO — a alçada do Linx é bypassada
 * (`STATUS_APROVACAO='A'`, `STATUS_COMPRA='A '`, `LX_STATUS_COMPRA=1`).
 *
 * Os defaults do Linx (TIPO_COMPRA, COD_TRANSACAO, CTB_TIPO_OPERACAO,
 * NATUREZA_ENTRADA) vêm de `company_erp_configs`. O solicitante pode ter
 * sobrescrito o tipo de compra, e o fiscal o CTB/NATUREZA — esses valores
 * (já no registro da requisição) prevalecem sobre os defaults.
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
  private pad(value: string | number, len: number): string {
    return String(value).padStart(len, '0');
  }

  /** Trunca e normaliza para char(n) do Linx (sem ultrapassar tamanho). */
  private trunc(value: string | null | undefined, len: number): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s.substring(0, len);
  }

  /**
   * Grava o PC no Linx. Devolve o número de PEDIDO gerado.
   * Idempotência: se `purchaseOrder.erpPedido` já existir, nada é feito.
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

    // 1) Gera o nº do PEDIDO via LX_SEQUENCIAL (OUTPUT param).
    //    Procedure vive em <erpDb>.dbo.LX_SEQUENCIAL. EXEC com OUTPUT exige
    //    queryRawUnsafe porque interpolamos o nome do DB (não é parâmetro).
    const seqResult = await this.prisma.$queryRawUnsafe<{ sequencia: string }[]>(
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

    // 2/3/4) Insert do cabeçalho + itens + log, tudo em uma transação.
    const aprovador = user.name ?? user.adUsername ?? '';
    const requeridoPor = aprovador; // ajustar se vier solicitante diferente
    const total = Number(po.totalAmount);

    try {
      await this.prisma.$transaction(async (tx) => {
        // COMPRAS — cabeçalho
        await tx.$executeRawUnsafe(
          `INSERT INTO [${erpDb}].dbo.COMPRAS
             (PEDIDO, FORNECEDOR, FILIAL_A_ENTREGAR, FILIAL_COBRANCA,
              FILIAL_A_FATURAR, CONDICAO_PGTO, TRANSPORTADORA, MOEDA,
              COD_TRANSACAO, EMISSAO, CADASTRAMENTO, APROVADO_POR,
              PEDIDO_FORNECEDOR, TOT_QTDE_ORIGINAL, TOT_VALOR_ORIGINAL,
              TABELA_FILHA, OBS, REQUERIDO_POR, TIPO_COMPRA,
              STATUS_APROVACAO, DATA_APROVACAO, STATUS_COMPRA,
              NATUREZA_ENTRADA, APROVADOR_POR, LX_STATUS_COMPRA,
              CTB_TIPO_OPERACAO, PEDIDO_UX, DATA_PARA_TRANSFERENCIA)
           VALUES
             (@P1, @P2, @P3, @P3, @P3, @P4, N'', N'R$',
              @P5, GETDATE(), GETDATE(), @P6,
              N' ', @P7, @P8,
              @P9, @P10, @P11, @P12,
              N'A', GETDATE(), N'A ',
              @P13, @P6, 1,
              @P14, 0, GETDATE())`,
          pedido,
          this.trunc(po.supplierName, 25) ?? '',
          this.trunc(po.branchName, 25) ?? '',
          this.trunc(po.paymentCondition, 3) ?? '',
          this.trunc(cfg.codTransacao, 23),
          this.trunc(aprovador, 25),
          this.sumQty(po.items),
          total,
          this.trunc(cfg.tabelaFilha, 18),
          `P2P PC ${po.number}`, // OBS: rastreio
          this.trunc(requeridoPor, 25),
          this.trunc(tipoCompra, 25),
          this.trunc(natureza, 15),
          ctb,
        );

        // COMPRAS_CONSUMIVEL — uma linha por item
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
            this.trunc(it.itemErpCode ?? it.itemDescription, 50) ?? '',
            po.expectedDelivery ?? new Date(),
            pedido,
            this.trunc(it.itemDescription, 250) ?? '',
            unit,
            this.trunc(it.unit, 5) ?? 'UN',
            qty,
            totalIt,
            this.trunc(it.branchRateioCode, 15) ?? '',
            this.trunc(it.costCenterRateioCode, 15) ?? '',
            this.trunc(it.accountingAccount, 20) ?? '',
          );
        }

        // COMPRAS_STATUS_LOG — auditoria
        await tx.$executeRawUnsafe(
          `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
             (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
           VALUES (@P1, GETDATE(), N'A ', @P2)`,
          pedido,
          this.trunc(aprovador, 25) ?? '',
        );
      });
    } catch (err) {
      this.logger.error(
        `Falha ao gravar PC ${po.number} no Linx (${erpDb}): ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        `Falha na gravação no ERP: ${(err as Error).message}`,
      );
    }

    this.logger.log(`PC ${po.number} gravado no Linx como PEDIDO=${pedido}`);
    return { pedido };
  }

  /** Soma as quantidades dos itens (TOT_QTDE_ORIGINAL do cabeçalho). */
  private sumQty(items: PurchaseOrderItem[]): number {
    return items.reduce((s, it) => s + Number(it.quantity), 0);
  }

  /**
   * Grava log do envio de e-mail em `COMPRAS_EMAIL_LOG` no Linx — usado
   * tanto pelo envio inicial quanto pelo reenvio. Não joga exceção: log
   * é melhor-esforço, falha aqui não invalida o envio do e-mail.
   */
  async logEmail(
    erpDbName: string,
    pedido: string,
    destinatario: string,
    usuario: string,
    obs?: string,
  ): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDbName}].dbo.COMPRAS_EMAIL_LOG
           (ID_LOG, PEDIDO, DESTINATARIO, DATA_HORA, OBS_STATUS, USUARIO)
         VALUES (
           (SELECT ISNULL(MAX(ID_LOG), 0) + 1 FROM [${erpDbName}].dbo.COMPRAS_EMAIL_LOG),
           @P1, @P2, GETDATE(), @P3, @P4
         )`,
        this.trunc(pedido, 8) ?? '',
        this.trunc(destinatario, 255) ?? '',
        this.trunc(obs ?? 'Envio P2P', 255) ?? '',
        this.trunc(usuario, 50) ?? '',
      );
    } catch (err) {
      this.logger.warn(
        `Falha ao registrar COMPRAS_EMAIL_LOG (${pedido}): ${(err as Error).message}`,
      );
    }
  }
}

// (silenciar unused: o Prisma é exportado pelo arquivo para tipagem futura)
void Prisma;
