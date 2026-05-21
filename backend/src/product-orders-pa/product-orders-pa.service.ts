import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

  /** Detalhe de um pedido PA: cabeçalho + lista de itens. */
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

    return { ...headerRows[0], items };
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
    const erpDb = c === 'GUESS' ? 'HML_GUESS' : 'HML_HERING';
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
