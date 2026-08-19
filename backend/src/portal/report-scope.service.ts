import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolve as chaves de escopo de um usuário EXTERNO SEMPRE do banco (nunca do
 * JWT), no momento da consulta. Assim, revogar/alterar o escopo tem efeito
 * imediato — não espera o token de 8h expirar.
 */
@Injectable()
export class ReportScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Chaves de escopo do usuário para um tipo (ex.: REP_ERP_CODE → códigos do
   * rep). Retorna [] se o usuário não tem escopo — o executor trata isso como
   * "nada a mostrar", NUNCA como "tudo".
   */
  async scopeKeys(userId: string, scopeType: string): Promise<string[]> {
    const rows = await this.prisma.externalScopeAssignment.findMany({
      where: { userId, scopeType },
      select: { scopeKey: true },
    });
    // dedup + remove vazios
    return [...new Set(rows.map((r) => r.scopeKey).filter((k) => !!k))];
  }
}
