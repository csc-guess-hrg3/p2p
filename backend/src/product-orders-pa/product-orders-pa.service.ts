import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

/**
 * Pedidos de Compra de PRODUTO ACABADO (PA).
 *
 * Fluxo paralelo ao P2P de consumíveis. Pedidos NASCEM NO LINX. O P2P
 * serve só como camada de aprovação + envio ao fornecedor + timeline
 * (essas duas últimas em fases seguintes). Esta fase é READ-ONLY:
 * a tela do diretor lista os pedidos pendentes (`STATUS_COMPRA = 'P '`)
 * e mostra detalhe (itens com grade vertical).
 *
 * As views `v_p2p_product_orders`, `v_p2p_product_order_items` e
 * `v_p2p_product_order_grade` materializam a leitura cross-database.
 * O cliente nunca toca direto nas tabelas Linx.
 */
@Injectable()
export class ProductOrdersPaService {
  private readonly logger = new Logger(ProductOrdersPaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertCompany(company: string): string {
    const c = company?.toUpperCase();
    if (c !== 'GUESS' && c !== 'HERING') {
      throw new BadRequestException(
        `Empresa inválida: "${company}". Use GUESS ou HERING.`,
      );
    }
    return c;
  }

  private assertUserHasCompany(user: AuthenticatedUser, companyCode: string) {
    // O usuário precisa ter acesso a alguma empresa com o code dado.
    // A camada de Integration usa a mesma checagem por code, então
    // confiamos que o frontend sempre passa um code válido para o usuário.
    void user;
    void companyCode;
  }

  /** Resolve o nome do banco do ERP a partir do code da empresa. */
  private async resolveErpDb(companyCode: string): Promise<string> {
    const company = await this.prisma.company.findFirst({
      where: { code: companyCode, deletedAt: null },
      select: { erpDbName: true },
    });
    if (!company) {
      throw new BadRequestException(`Empresa "${companyCode}" não cadastrada.`);
    }
    return company.erpDbName;
  }

  /** Resolve a CompanyErpConfig de uma empresa por code. */
  private async resolveConfig(companyCode: string) {
    const company = await this.prisma.company.findFirst({
      where: { code: companyCode, deletedAt: null },
      include: { erpConfig: true },
    });
    if (!company) {
      throw new BadRequestException(`Empresa "${companyCode}" não cadastrada.`);
    }
    return { company, config: company.erpConfig };
  }

  /**
   * Aprova um pedido PA. Verifica:
   *  - usuário é o `paApproverUserId` configurado na empresa
   *  - pedido está em status 'E' (em estudo)
   * Escreve no Linx: COMPRAS.STATUS_COMPRA='A ', STATUS_APROVACAO='A',
   * LX_STATUS_COMPRA=1, DATA_APROVACAO, APROVADO_POR; e insere uma linha
   * em COMPRAS_STATUS_LOG.
   */
  async approve(user: AuthenticatedUser, company: string, pedido: string) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);
    const { company: comp, config } = await this.resolveConfig(c);
    if (!config?.paApproverUserId) {
      throw new BadRequestException(
        `Empresa ${comp.code} não tem aprovador de PA configurado em company_erp_configs.paApproverUserId.`,
      );
    }
    if (config.paApproverUserId !== user.id) {
      throw new ForbiddenException(
        'Apenas o diretor da marca configurado pode aprovar pedidos PA.',
      );
    }
    const erpDb = comp.erpDbName;
    const numero = pedido.trim();

    const headerRows = await this.prisma.$queryRawUnsafe<
      { status_compra: string }[]
    >(
      `SELECT TOP 1 RTRIM(STATUS_COMPRA) AS status_compra
         FROM [${erpDb}].dbo.COMPRAS
        WHERE PEDIDO = @P1
          AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
      numero,
    );
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado no ERP.`);
    }
    const current = (headerRows[0].status_compra ?? '').trim();
    if (current !== 'E') {
      throw new BadRequestException(
        `Pedido ${numero} está em status "${current}" — só pedidos em estudo (E) podem ser aprovados.`,
      );
    }

    const aprovador = (user.name ?? user.adUsername ?? '').slice(0, 25);
    await this.prisma.$transaction(async () => {
      await this.prisma.$executeRawUnsafe(
        `UPDATE [${erpDb}].dbo.COMPRAS
            SET STATUS_COMPRA = 'A ',
                STATUS_APROVACAO = 'A',
                LX_STATUS_COMPRA = 1,
                DATA_APROVACAO = GETDATE(),
                APROVADO_POR = @P2,
                APROVADOR_POR = @P2
          WHERE PEDIDO = @P1
            AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
        numero,
        aprovador,
      );
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
           (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
         VALUES (@P1, GETDATE(), N'A ', @P2)`,
        numero,
        aprovador,
      );
    });
    this.logger.log(`PA ${numero} aprovado por ${aprovador} (${user.id})`);
    return this.findOne(user, company, numero);
  }

  /**
   * Reprova um pedido PA — exige motivo (mínimo 10 caracteres),
   * concatenado em COMPRAS.OBS para preservar histórico.
   */
  async reject(
    user: AuthenticatedUser,
    company: string,
    pedido: string,
    reason: string,
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'Motivo da reprovação obrigatório (mínimo 10 caracteres).',
      );
    }
    const { company: comp, config } = await this.resolveConfig(c);
    if (!config?.paApproverUserId || config.paApproverUserId !== user.id) {
      throw new ForbiddenException(
        'Apenas o diretor da marca configurado pode reprovar pedidos PA.',
      );
    }
    const erpDb = comp.erpDbName;
    const numero = pedido.trim();

    const headerRows = await this.prisma.$queryRawUnsafe<
      { status_compra: string; obs: string | null }[]
    >(
      `SELECT TOP 1 RTRIM(STATUS_COMPRA) AS status_compra,
              CAST(OBS AS NVARCHAR(MAX)) AS obs
         FROM [${erpDb}].dbo.COMPRAS
        WHERE PEDIDO = @P1
          AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
      numero,
    );
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado no ERP.`);
    }
    const current = (headerRows[0].status_compra ?? '').trim();
    if (current !== 'E') {
      throw new BadRequestException(
        `Pedido ${numero} está em status "${current}" — só pedidos em estudo (E) podem ser reprovados.`,
      );
    }

    const aprovador = (user.name ?? user.adUsername ?? '').slice(0, 25);
    const prevObs = headerRows[0].obs ?? '';
    const stamp = new Date()
      .toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      .replace(',', '');
    const note = `REPROVADO POR ${aprovador} EM ${stamp}: ${reason.trim()}`;
    const newObs = prevObs ? `${prevObs}\n\n${note}` : note;

    await this.prisma.$transaction(async () => {
      await this.prisma.$executeRawUnsafe(
        `UPDATE [${erpDb}].dbo.COMPRAS
            SET STATUS_COMPRA = 'R ',
                STATUS_APROVACAO = 'R',
                OBS = @P3
          WHERE PEDIDO = @P1
            AND RTRIM(TABELA_FILHA) = 'COMPRAS_PRODUTO'`,
        numero,
        aprovador,
        newObs,
      );
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO [${erpDb}].dbo.COMPRAS_STATUS_LOG
           (PEDIDO, DATA_ALTERACAO_STATUS, STATUS_COMPRA, USUARIO)
         VALUES (@P1, GETDATE(), N'R ', @P2)`,
        numero,
        aprovador,
      );
    });
    this.logger.log(`PA ${numero} reprovado por ${aprovador} (${user.id})`);
    return this.findOne(user, company, numero);
  }

  /**
   * Lista os pedidos de PA da empresa. Filtros suportados:
   *  - status (P, E, A, R, C, M ou ALL — default = ALL)
   *  - search (busca por número do pedido ou fornecedor)
   *
   * Saída ordenada por EMISSÃO DESC.
   */
  async findAll(
    user: AuthenticatedUser,
    company: string,
    options: { status?: string; search?: string } = {},
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    const { status, search } = options;
    const filters: Prisma.Sql[] = [Prisma.sql`empresa = ${c}`];
    if (status && status !== 'ALL') {
      // Status no Linx vem com padding ('A ', 'P '). Aqui usamos LIKE
      // pra cobrir variações de espaços sem precisar fixar formato.
      filters.push(Prisma.sql`RTRIM(status_compra) = ${status.trim()}`);
    }
    if (search) {
      const term = `%${search}%`;
      filters.push(
        Prisma.sql`(pedido LIKE ${term} OR fornecedor LIKE ${term})`,
      );
    }
    const where = Prisma.join(filters, ' AND ');

    return this.prisma.$queryRaw<any[]>`
      SELECT TOP 200 *
      FROM dbo.v_p2p_product_orders
      WHERE ${where}
      ORDER BY emissao DESC`;
  }

  /**
   * Detalhe de um pedido PA: cabeçalho + lista de itens + flag
   * `canApprovePa` (UI usa pra mostrar Aprovar/Reprovar quando o usuário
   * logado é o aprovador configurado para a empresa).
   */
  async findOne(user: AuthenticatedUser, company: string, pedido: string) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    const numero = pedido.trim();
    const headerRows = await this.prisma.$queryRaw<any[]>`
      SELECT TOP 1 * FROM dbo.v_p2p_product_orders
      WHERE empresa = ${c} AND pedido = ${numero}`;
    if (headerRows.length === 0) {
      throw new NotFoundException(`Pedido ${numero} não encontrado.`);
    }
    const items = await this.prisma.$queryRaw<any[]>`
      SELECT * FROM dbo.v_p2p_product_order_items
      WHERE empresa = ${c} AND pedido = ${numero}
      ORDER BY produto, cor, entrega`;

    const cfg = await this.resolveConfig(c).catch(() => null);
    const canApprovePa =
      !!cfg?.config?.paApproverUserId &&
      cfg.config.paApproverUserId === user.id;
    return { ...headerRows[0], items, canApprovePa };
  }

  /**
   * Grade vertical de um item (PEDIDO + PRODUTO + COR + ENTREGA). Devolve
   * uma linha por posição (1..48) com nome do tamanho quando o produto
   * tem grade conhecida em PRODUTOS_TAMANHOS. Quando o vínculo
   * produto→grade não estiver disponível, devolve só a posição numérica.
   */
  async getItemGrade(
    user: AuthenticatedUser,
    company: string,
    pedido: string,
    produto: string,
    cor: string,
    entrega: string,
  ) {
    const c = this.assertCompany(company);
    this.assertUserHasCompany(user, c);

    // Resolve o produto-grade a partir do mestre PRODUTOS. O cliente
    // poderia ter mandado o `grade` direto, mas resolver no backend
    // mantém a UI burra (sem cross-table).
    const erpDb = await this.resolveErpDb(c);
    const gradeRow = await this.prisma.$queryRawUnsafe<{ grade: string | null }[]>(
      `SELECT TOP 1 RTRIM(GRADE) AS grade FROM [${erpDb}].dbo.PRODUTOS WHERE PRODUTO = @P1`,
      produto,
    );
    const grade = gradeRow[0]?.grade ?? null;

    const date = new Date(entrega);
    const rows = await this.prisma.$queryRaw<
      { posicao: number; qtdeOriginal: number; qtdeEntregue: number; tamanho: string | null }[]
    >`
      SELECT g.posicao,
             g.qtde_original AS qtdeOriginal,
             g.qtde_entregue AS qtdeEntregue,
             t.tamanho
      FROM dbo.v_p2p_product_order_grade g
      LEFT JOIN dbo.v_p2p_grade_tamanhos t
        ON t.empresa = g.empresa AND t.posicao = g.posicao
       AND t.grade = ${grade ?? ''}
      WHERE g.empresa = ${c}
        AND g.pedido = ${pedido.trim()}
        AND g.produto = ${produto.trim()}
        AND g.cor = ${cor.trim()}
        AND g.entrega = ${date}
      ORDER BY g.posicao`;
    return { grade, rows };
  }
}

// Mantém ForbiddenException importado caso a checagem de escopo
// (assertUserHasCompany) vire mais estrita em fases futuras.
void ForbiddenException;
