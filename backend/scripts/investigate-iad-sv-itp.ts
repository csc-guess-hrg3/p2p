/**
 * Investigação profunda: como SV (provisão) vira IAD (adiantamento)
 * vira ITP (título) no Linx? Vasculha tabelas, views, procedures e
 * triggers ligadas a essas siglas + LX_TIPO_LANCAMENTO.
 *
 * SÓ LEITURA. Cobre GUESS_PRODUCAO e DB_HRG3.
 */
import * as sql from 'mssql';

const DBS = ['GUESS_PRODUCAO', 'DB_HRG3'];

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: 'master',
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 180000,
  }).connect();

  for (const db of DBS) {
    console.log(`\n##########################################`);
    console.log(`# ${db}`);
    console.log(`##########################################`);

    // (1) Colunas de LX_TIPO_LANCAMENTO — onde elas vivem?
    console.log('\n## (1) Tabelas/views com coluna LX_TIPO_LANCAMENTO:');
    const cols = await pool.request().query(`
      SELECT TABLE_TYPE, c.TABLE_NAME
      FROM [${db}].INFORMATION_SCHEMA.COLUMNS c
      JOIN [${db}].INFORMATION_SCHEMA.TABLES t
        ON t.TABLE_NAME = c.TABLE_NAME
      WHERE c.COLUMN_NAME = 'LX_TIPO_LANCAMENTO'
      ORDER BY t.TABLE_TYPE, c.TABLE_NAME
    `);
    cols.recordset.forEach((r) =>
      console.log(`   ${r.TABLE_TYPE.padEnd(11)} ${r.TABLE_NAME}`),
    );

    // (2) Catálogo de LX_TIPO_LANCAMENTO — existe alguma tabela DOMINIO?
    console.log('\n## (2) Tabelas/views com nome DOMINIO/TIPO_LANCAMENTO:');
    const dom = await pool.request().query(`
      SELECT TABLE_TYPE, TABLE_NAME
      FROM [${db}].INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%TIPO_LANC%'
         OR TABLE_NAME LIKE '%LX_TIPO%'
         OR TABLE_NAME LIKE '%DOMINIO%LANC%'
      ORDER BY TABLE_TYPE, TABLE_NAME
    `);
    dom.recordset.forEach((r) =>
      console.log(`   ${r.TABLE_TYPE.padEnd(11)} ${r.TABLE_NAME}`),
    );

    // (3) Distinct de TIPO em CTB_LANCAMENTO (base) — ali deve estar IAD
    console.log('\n## (3) Distinct TIPO em CTB_LANCAMENTO (base):');
    try {
      const tipos = await pool.request().query(`
        SELECT TIPO, COUNT(*) qtd
        FROM [${db}].dbo.CTB_LANCAMENTO
        GROUP BY TIPO
        ORDER BY qtd DESC
      `);
      tipos.recordset.forEach((r) =>
        console.log(`   TIPO=${r.TIPO} qtd=${r.qtd}`),
      );
    } catch (e) {
      console.log(`   ERRO: ${(e as Error).message}`);
    }

    // (4) Distinct de TIPO_LANCAMENTO em CTB_A_PAGAR_PARCELA — talvez
    //     a coluna se chame diferente na base vs na view
    console.log('\n## (4) Colunas da BASE CTB_A_PAGAR_PARCELA:');
    const baseCols = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE,
             CHARACTER_MAXIMUM_LENGTH AS len
      FROM [${db}].INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CTB_A_PAGAR_PARCELA'
      ORDER BY ORDINAL_POSITION
    `);
    baseCols.recordset.forEach((c) =>
      console.log(
        `   ${c.COLUMN_NAME.padEnd(32)} ${c.DATA_TYPE}${c.len ? '(' + c.len + ')' : ''}`,
      ),
    );

    // (5) DDL da view W_CTB_A_PAGAR_PARCELA pra descobrir como
    //     LX_TIPO_LANCAMENTO é derivado e onde filtra 'ITP'
    console.log('\n## (5) Definição da view W_CTB_A_PAGAR_PARCELA (primeiros 2000 chars):');
    try {
      const ddl = await pool.request().query(`
        SELECT TOP 1 m.definition
        FROM [${db}].sys.sql_modules m
        JOIN [${db}].sys.objects o ON o.object_id = m.object_id
        WHERE o.name = 'W_CTB_A_PAGAR_PARCELA'
      `);
      const def = String(ddl.recordset[0]?.definition ?? '');
      console.log(def.slice(0, 2000));
      console.log(`   --- [definição tem ${def.length} chars total] ---`);
    } catch (e) {
      console.log(`   ERRO: ${(e as Error).message}`);
    }

    // (6) Tabelas com nome relacionado a SV / SOLICITACAO / ADIANT
    console.log('\n## (6) Tabelas SOLICITACAO / ADIANT / SV (nome):');
    const svTabs = await pool.request().query(`
      SELECT TABLE_TYPE, TABLE_NAME
      FROM [${db}].INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME LIKE '%SOLICITACAO_VERBA%'
         OR TABLE_NAME LIKE 'CTB_SV%'
         OR TABLE_NAME LIKE 'SV[_]%'
         OR TABLE_NAME LIKE '%ADIANTAMENTO%'
         OR TABLE_NAME LIKE 'IAD%'
      ORDER BY TABLE_TYPE, TABLE_NAME
    `);
    svTabs.recordset.forEach((r) =>
      console.log(`   ${r.TABLE_TYPE.padEnd(11)} ${r.TABLE_NAME}`),
    );

    // (7) Procedures relacionadas a SV / ADIANT / IAD
    console.log('\n## (7) Procedures relacionadas:');
    const procs = await pool.request().query(`
      SELECT TOP 50 name
      FROM [${db}].sys.procedures
      WHERE name LIKE '%SOLICITACAO_VERBA%'
         OR name LIKE '%ADIANT%'
         OR name LIKE 'LX_%IAD%'
         OR name LIKE 'LX_%ITP%'
         OR name LIKE 'LX_%SV%'
         OR name LIKE '%TITULO_PAGAR%'
      ORDER BY name
    `);
    procs.recordset.forEach((r) => console.log(`   ${r.name}`));

    // (8) Triggers em CTB_SOLICITACAO_VERBA / CTB_A_PAGAR_PARCELA
    console.log('\n## (8) Triggers em CTB_SOLICITACAO_VERBA / CTB_A_PAGAR_PARCELA:');
    const trigs = await pool.request().query(`
      SELECT t.name AS trigger_name, OBJECT_NAME(t.parent_id) AS table_name
      FROM [${db}].sys.triggers t
      WHERE OBJECT_NAME(t.parent_id) IN ('CTB_SOLICITACAO_VERBA','CTB_A_PAGAR_PARCELA','CTB_LANCAMENTO')
      ORDER BY table_name, trigger_name
    `);
    trigs.recordset.forEach((r) =>
      console.log(`   ${String(r.table_name).padEnd(28)} -> ${r.trigger_name}`),
    );

    // (9) FKs/colunas que liguem SV ↔ CTB_LANCAMENTO ou parcela
    console.log('\n## (9) Colunas com nome SOLICITACAO_VERBA em qualquer tabela:');
    const refs = await pool.request().query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM [${db}].INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME LIKE '%SOLICITACAO_VERBA%'
         OR COLUMN_NAME LIKE 'ID_SV%'
         OR COLUMN_NAME LIKE '%ID_ADIANTAMENTO%'
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    refs.recordset.forEach((r) =>
      console.log(`   ${r.TABLE_NAME.padEnd(40)} ${r.COLUMN_NAME}`),
    );
  }

  await pool.close();
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
