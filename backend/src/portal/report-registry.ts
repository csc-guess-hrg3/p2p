import { ExternalCategory, ExternalScopeType } from '../common/enums';

/**
 * Catálogo de relatórios da Área Externa (portal).
 *
 * Cada relatório declara SÓ metadados + a FONTE (view no ERP) e a coluna de
 * escopo. Os identificadores da fonte (db/schema/table/scopeColumn) são
 * CONSTANTES do código — nunca entram valores do usuário na montagem do SQL;
 * o único dado dinâmico é a chave de escopo do rep logado, e ela é
 * parametrizada/sanitizada no executor.
 *
 * Esta é a costura do "plug-and-play": trocar o binding (ex.: view por rep,
 * proc parametrizada, outra base) é editar a `source` aqui — o motor, o
 * controller e o front não mudam.
 */
export interface ReportSource {
  /** Banco onde a view vive (as views de relatório são nativas do ERP). */
  db: string;
  schema: string;
  /** Nome da view — filtrada pelo motor via `scopeColumn IN (@codes)`. */
  table: string;
  /** Coluna que carrega a chave de escopo do rep (ex.: cod_representante). */
  scopeColumn: string;
}

export interface ReportDef {
  /** Chave usada na URL (/portal/reports/:key). */
  key: string;
  /** Categoria externa dona do relatório (só ela enxerga/roda). */
  category: string;
  /** Tipo de escopo que amarra o relatório ao usuário externo. */
  scopeType: string;
  title: string;
  description: string;
  source: ReportSource;
}

const GUESS = { db: 'GUESS_PRODUCAO', schema: 'dbo' } as const;

/**
 * Relatórios do REPRESENTANTE. As 3 views genéricas vivem em GUESS_PRODUCAO.dbo
 * e expõem `cod_representante` (código REAL do rep) — ver
 * backend/prisma/erp-report-views.sql.
 */
export const REPORT_REGISTRY: ReportDef[] = [
  {
    key: 'clientes',
    category: ExternalCategory.REPRESENTANTE,
    scopeType: ExternalScopeType.REP_ERP_CODE,
    title: 'Meus clientes',
    description: 'Clientes do seu território (por UF).',
    source: {
      ...GUESS,
      table: 'v_p2p_rep_clientes',
      scopeColumn: 'cod_representante',
    },
  },
  {
    key: 'faturamentos',
    category: ExternalCategory.REPRESENTANTE,
    scopeType: ExternalScopeType.REP_ERP_CODE,
    title: 'Faturamentos',
    description: 'Notas de saída faturadas nas suas vendas.',
    source: {
      ...GUESS,
      table: 'v_p2p_rep_faturamentos',
      scopeColumn: 'cod_representante',
    },
  },
  {
    key: 'financeiro',
    category: ExternalCategory.REPRESENTANTE,
    scopeType: ExternalScopeType.REP_ERP_CODE,
    title: 'Financeiro',
    description: 'Títulos a receber das suas vendas (posição por vencimento).',
    source: {
      ...GUESS,
      table: 'v_p2p_rep_financeiro',
      scopeColumn: 'cod_representante',
    },
  },
];

/** Relatórios visíveis para uma categoria externa. */
export function reportsForCategory(category: string | null): ReportDef[] {
  return REPORT_REGISTRY.filter((r) => r.category === category);
}

/**
 * Categorias externas que TÊM relatório (derivado do catálogo). O controller
 * usa isto no @ExternalOnly, então uma categoria nova com relatório libera o
 * acesso sozinha — sem editar o guard à mão.
 */
export function reportCategories(): string[] {
  return [...new Set(REPORT_REGISTRY.map((r) => r.category))];
}

/** Um relatório específico DENTRO da categoria (evita cross-category). */
export function findReport(
  category: string | null,
  key: string,
): ReportDef | undefined {
  return REPORT_REGISTRY.find((r) => r.category === category && r.key === key);
}
