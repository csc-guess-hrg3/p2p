import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Uma linha da view dbo.v_p2p_representantes (leitura ao vivo do Linx). */
export interface RepresentanteErp {
  empresa: string;
  cod_representante: string;
  nome: string;
  documento: string | null;
}

/**
 * Leitura dos representantes do ERP via a view `dbo.v_p2p_representantes`
 * (vive no P2P_DB, faz o cross-db no Linx — ver backend/prisma/erp-views.sql).
 * Só metadados de identidade: código (chave de login/escopo), nome, documento.
 */
@Injectable()
export class RepresentantesErpService {
  constructor(private readonly prisma: PrismaService) {}

  /** Empresas conhecidas — nunca interpola valor arbitrário no SQL. */
  private safeEmpresa(empresa: string): string | null {
    const e = (empresa ?? '').trim().toUpperCase();
    return e === 'GUESS' || e === 'HRG3' ? e : null;
  }

  /** Código do representante: só alfanumérico (defense-in-depth). */
  private safeCodigo(cod: string): string {
    return (cod ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 25);
  }

  async list(empresa?: string): Promise<RepresentanteErp[]> {
    const e = empresa ? this.safeEmpresa(empresa) : null;
    if (empresa && !e) return [];
    const where = e ? `WHERE empresa = '${e}'` : '';
    return this.prisma.$queryRawUnsafe<RepresentanteErp[]>(
      `SELECT empresa, cod_representante, nome, documento
         FROM dbo.v_p2p_representantes ${where}
        ORDER BY empresa, cod_representante`,
    );
  }

  async findOne(
    empresa: string,
    cod: string,
  ): Promise<RepresentanteErp | null> {
    const e = this.safeEmpresa(empresa);
    const c = this.safeCodigo(cod);
    if (!e || !c) return null;
    const rows = await this.prisma.$queryRawUnsafe<RepresentanteErp[]>(
      `SELECT TOP 1 empresa, cod_representante, nome, documento
         FROM dbo.v_p2p_representantes
        WHERE empresa = '${e}' AND cod_representante = '${c}'`,
    );
    return rows[0] ?? null;
  }
}
