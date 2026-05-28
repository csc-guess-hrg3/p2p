/**
 * Fase 2 da investigação:
 *   - Domínio CTB_LX_LANCAMENTO_TIPO (códigos IAD/ITP/SV/PROV…)
 *   - Colunas reais de CTB_LANCAMENTO (a base)
 *   - Definição completa da view W_CTB_A_PAGAR_PARCELA (entender filtros)
 *   - Definição da W_HRG3_CONTAS_PAGAR_PROVISAO (entender união com SV)
 *   - W_CTB_LANCAMENTO_ITEM_ABERTO_FINANCEIRO + W_CTB_LANCAMENTOS_FINANCEIRO
 *   - W_CTB_SOLICITACAO_VERBA_SALDO
 *   - CTB_SOLICITACAO_VERBA_MOV (saldo + realização)
 * SÓ LEITURA.
 */
import * as sql from 'mssql';
import * as fs from 'fs';

const DBS = ['GUESS_PRODUCAO'];

async function getDef(
  pool: sql.ConnectionPool,
  db: string,
  name: string,
): Promise<string> {
  const r = await pool.request().query(`
    SELECT TOP 1 m.definition
    FROM [${db}].sys.sql_modules m
    JOIN [${db}].sys.objects o ON o.object_id = m.object_id
    WHERE o.name = '${name}'
  `);
  return String(r.recordset[0]?.definition ?? '');
}

async function getCols(
  pool: sql.ConnectionPool,
  db: string,
  name: string,
): Promise<{ COLUMN_NAME: string; DATA_TYPE: string; len: number | null }[]> {
  const r = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS len
    FROM [${db}].INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${name}'
    ORDER BY ORDINAL_POSITION
  `);
  return r.recordset;
}

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: 'master',
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 300000,
  }).connect();

  const out: string[] = [];
  const log = (s = '') => {
    console.log(s);
    out.push(s);
  };

  for (const db of DBS) {
    log(`\n#### ${db} ####\n`);

    // (1) Domínio LX_LANCAMENTO_TIPO
    log('## CTB_LX_LANCAMENTO_TIPO — domínio de TIPOs');
    const cols1 = await getCols(pool, db, 'CTB_LX_LANCAMENTO_TIPO');
    log(`Colunas: ${cols1.map((c) => c.COLUMN_NAME).join(', ')}`);
    const tipos = await pool.request().query(`
      SELECT TOP 30 * FROM [${db}].dbo.CTB_LX_LANCAMENTO_TIPO
      ORDER BY LX_TIPO_LANCAMENTO
    `);
    log(`\nLinhas (até 30):`);
    tipos.recordset.forEach((r) => {
      const keys = Object.keys(r);
      log(
        '  ' +
          keys
            .slice(0, 8)
            .map((k) => `${k}=${String(r[k]).slice(0, 40)}`)
            .join(' | '),
      );
    });

    // (2) Colunas de CTB_LANCAMENTO base
    log('\n## CTB_LANCAMENTO (base) — colunas relevantes:');
    const cols2 = await getCols(pool, db, 'CTB_LANCAMENTO');
    cols2
      .filter((c) =>
        ['LX_TIPO', 'TIPO', 'PROVISAO', 'EMPRESA', 'SOLICITACAO_VERBA', 'CLIFOR'].some(
          (s) => c.COLUMN_NAME.toUpperCase().includes(s),
        ),
      )
      .forEach((c) =>
        log(
          `  ${c.COLUMN_NAME.padEnd(32)} ${c.DATA_TYPE}${c.len ? '(' + c.len + ')' : ''}`,
        ),
      );

    // (3) Definição completa W_CTB_A_PAGAR_PARCELA — procurar 'ITP'/'IAD'/PROVISAO
    log('\n## W_CTB_A_PAGAR_PARCELA — definição completa');
    const def1 = await getDef(pool, db, 'W_CTB_A_PAGAR_PARCELA');
    log(`(${def1.length} chars — escrevendo em arquivo)`);

    // (4) W_CTB_SOLICITACAO_VERBA_SALDO (existe em GUESS, talvez não em HRG3)
    log('\n## W_CTB_SOLICITACAO_VERBA_SALDO');
    try {
      const cols3 = await getCols(pool, db, 'W_CTB_SOLICITACAO_VERBA_SALDO');
      log(`Colunas: ${cols3.map((c) => c.COLUMN_NAME).join(', ')}`);
      const total = await pool
        .request()
        .query(`SELECT COUNT(*) c FROM [${db}].dbo.W_CTB_SOLICITACAO_VERBA_SALDO`);
      log(`Total linhas: ${total.recordset[0].c}`);
      const sample = await pool
        .request()
        .query(
          `SELECT TOP 2 * FROM [${db}].dbo.W_CTB_SOLICITACAO_VERBA_SALDO`,
        );
      sample.recordset.forEach((r, i) => {
        log(`Sample ${i + 1}:`);
        Object.entries(r).forEach(([k, v]) =>
          log(`  ${k.padEnd(32)} = ${String(v).slice(0, 60)}`),
        );
      });
    } catch (e) {
      log(`ERRO: ${(e as Error).message}`);
    }

    // (5) CTB_SOLICITACAO_VERBA_MOV — movimentação (realizações da SV)
    log('\n## CTB_SOLICITACAO_VERBA_MOV — colunas (mov da SV)');
    const cols4 = await getCols(pool, db, 'CTB_SOLICITACAO_VERBA_MOV');
    cols4.forEach((c) =>
      log(
        `  ${c.COLUMN_NAME.padEnd(32)} ${c.DATA_TYPE}${c.len ? '(' + c.len + ')' : ''}`,
      ),
    );
    const movSample = await pool
      .request()
      .query(
        `SELECT TOP 3 * FROM [${db}].dbo.CTB_SOLICITACAO_VERBA_MOV ORDER BY SOLICITACAO_VERBA DESC`,
      );
    log(`Sample (3):`);
    movSample.recordset.forEach((r, i) => {
      log(`  --- mov ${i + 1} ---`);
      Object.entries(r).forEach(([k, v]) =>
        log(`    ${k.padEnd(32)} = ${String(v).slice(0, 60)}`),
      );
    });

    // (6) Definição da W_HRG3_CONTAS_PAGAR_PROVISAO — vê como SV/PEDCOM se juntam
    log('\n## W_HRG3_CONTAS_PAGAR_PROVISAO — definição');
    const def2 = await getDef(pool, db, 'W_HRG3_CONTAS_PAGAR_PROVISAO');
    log(`(${def2.length} chars)`);

    // (7) W_CTB_LANCAMENTOS_FINANCEIRO + W_CTB_LANCAMENTO_ITEM_ABERTO_FINANCEIRO
    log('\n## W_CTB_LANCAMENTOS_FINANCEIRO — colunas (preview)');
    const cols5 = await getCols(pool, db, 'W_CTB_LANCAMENTOS_FINANCEIRO');
    cols5
      .filter((c) =>
        ['LX_TIPO', 'TIPO', 'PROVISAO', 'EMPRESA', 'SV', 'IAD', 'ITP', 'CLIFOR', 'SOLIC'].some(
          (s) => c.COLUMN_NAME.toUpperCase().includes(s),
        ),
      )
      .forEach((c) =>
        log(
          `  ${c.COLUMN_NAME.padEnd(32)} ${c.DATA_TYPE}${c.len ? '(' + c.len + ')' : ''}`,
        ),
      );

    // (8) Sequenciais (LX_SEQUENCIAL.TAMANHO) relacionados
    log('\n## Sequenciais (SOLICITACAO_VERBA, LANCAMENTO):');
    const seq = await pool.request().query(`
      SELECT TABELA_COLUNA, DESCRICAO, SEQUENCIA, TAMANHO
      FROM [${db}].dbo.SEQUENCIAIS
      WHERE TABELA_COLUNA IN ('SOLICITACAO_VERBA','CTB_LANCAMENTO.LANCAMENTO','LANCAMENTO')
    `);
    seq.recordset.forEach((r) =>
      log(
        `  ${r.TABELA_COLUNA.padEnd(32)} seq=${r.SEQUENCIA} tam=${r.TAMANHO}`,
      ),
    );

    // Escreve as 2 grandes definições em arquivos pra leitura calma
    fs.writeFileSync(
      `I:/p2p/backend/scripts/_out_W_CTB_A_PAGAR_PARCELA_${db}.sql`,
      def1,
    );
    fs.writeFileSync(
      `I:/p2p/backend/scripts/_out_W_HRG3_CONTAS_PAGAR_PROVISAO_${db}.sql`,
      def2,
    );
  }

  await pool.close();
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
