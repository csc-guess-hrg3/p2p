import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DocType = 'REQ' | 'OC' | 'SV' | 'REC';

/**
 * Numeração de documentos via SQL Server SEQUENCE nativa.
 *
 * Cada combinação empresa+tipo+ano tem sua própria SEQUENCE
 * (ex.: seq_REQ_GUESS_2026), criada sob demanda. O SELECT NEXT VALUE FOR
 * é atômico — sem race condition mesmo com criações simultâneas.
 *
 * Formato do número: REQ-2026-000123
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    companyCode: string,
    docType: DocType,
    year: number = new Date().getFullYear(),
  ): Promise<string> {
    const company = companyCode.toUpperCase();
    if (!/^[A-Z]+$/.test(company)) {
      throw new BadRequestException('Código de empresa inválido.');
    }
    if (!['REQ', 'OC', 'SV', 'REC'].includes(docType)) {
      throw new BadRequestException('Tipo de documento inválido.');
    }

    const seqName = `seq_${docType}_${company}_${year}`;

    // Cria a SEQUENCE se ainda não existir (CREATE SEQUENCE via EXEC,
    // pois precisa ser a 1ª instrução do batch).
    await this.prisma.$executeRawUnsafe(
      `IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = '${seqName}')
         EXEC('CREATE SEQUENCE dbo.${seqName} AS INT START WITH 1 INCREMENT BY 1')`,
    );

    const rows = await this.prisma.$queryRawUnsafe<{ v: number }[]>(
      `SELECT NEXT VALUE FOR dbo.${seqName} AS v`,
    );
    const seq = Number(rows[0].v);

    return `${docType}-${year}-${String(seq).padStart(6, '0')}`;
  }
}
