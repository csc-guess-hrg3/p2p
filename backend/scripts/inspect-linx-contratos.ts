/**
 * Estudo completo do módulo CONTRATO no Linx.
 *
 * Não usamos esse módulo em produção (CONTRATO em GUESS/HRG3 = 0 linhas)
 * mas a infra existe e pode ser nossa âncora pra contratos recorrentes
 * do P2P. Esse script levanta:
 *
 *   1) Lista de TODAS as tabelas/views CONTRATO_*
 *   2) Schema completo de cada (colunas, tipos, NULL, defaults)
 *   3) Foreign keys (relacionamentos formais)
 *   4) Sequenciais relacionados (ID_CONTRATO, etc.)
 *   5) Procedures que mencionam CONTRATO
 *   6) Triggers em CONTRATO/CONTRATO_ITEM/CONTRATO_FATURAR
 *   7) Views consumidoras
 *   8) Colunas ID_CONTRATO/CONTRATO_TIPO em OUTRAS tabelas (vínculos)
 *   9) Registros existentes em HML/PROD (pra ver se algum teste foi feito)
 *  10) Extended properties (comentários no banco) se houver
 *
 * SÓ LEITURA.
 */
import * as sql from 'mssql';
import * as fs from 'fs';

const DB = 'GUESS_PRODUCAO';

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: 'master',
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 240000,
  }).connect();

  const out: string[] = [];
  const log = (s = '') => {
    console.log(s);
    out.push(s);
  };

  // ───────────────────────────────────────────────────────────────
  // 1) Lista de tabelas/views CONTRATO_*
  // ───────────────────────────────────────────────────────────────
  log('# 1. Tabelas/views CONTRATO_* em ' + DB);
  const tabs = await pool.request().query(`
    SELECT TABLE_TYPE, TABLE_NAME
    FROM [${DB}].INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE 'CONTRATO%' OR TABLE_NAME LIKE 'W_%CONTRATO%'
    ORDER BY TABLE_TYPE, TABLE_NAME
  `);
  for (const r of tabs.recordset) {
    log(`  ${r.TABLE_TYPE.padEnd(11)} ${r.TABLE_NAME}`);
  }
  const baseTables = tabs.recordset
    .filter((r) => r.TABLE_TYPE === 'BASE TABLE')
    .map((r) => r.TABLE_NAME as string);
  const views = tabs.recordset
    .filter((r) => r.TABLE_TYPE === 'VIEW')
    .map((r) => r.TABLE_NAME as string);

  // ───────────────────────────────────────────────────────────────
  // 2) Schema completo de cada base table
  // ───────────────────────────────────────────────────────────────
  log('\n# 2. Schema completo de cada tabela CONTRATO_*\n');
  for (const t of baseTables) {
    log(`## ${t}`);
    const cols = await pool.request().query(`
      SELECT
        c.ORDINAL_POSITION AS pos,
        c.COLUMN_NAME,
        c.DATA_TYPE,
        c.CHARACTER_MAXIMUM_LENGTH AS len,
        c.NUMERIC_PRECISION AS prec,
        c.NUMERIC_SCALE AS sc,
        c.IS_NULLABLE,
        c.COLUMN_DEFAULT
      FROM [${DB}].INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = '${t}'
      ORDER BY c.ORDINAL_POSITION
    `);
    for (const c of cols.recordset) {
      const type =
        c.DATA_TYPE +
        (c.len && c.len > 0 ? `(${c.len})` : '') +
        (c.prec && c.DATA_TYPE === 'numeric' ? `(${c.prec},${c.sc})` : '');
      const nn = c.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL    ';
      const def = c.COLUMN_DEFAULT
        ? '  default=' + String(c.COLUMN_DEFAULT).slice(0, 50)
        : '';
      log(
        `  ${String(c.pos).padStart(3)}. ${c.COLUMN_NAME.padEnd(35)} ${type.padEnd(18)} ${nn}${def}`,
      );
    }

    // Total
    try {
      const tot = await pool
        .request()
        .query(`SELECT COUNT(*) AS qtd FROM [${DB}].dbo.${t}`);
      log(`  -- total linhas: ${tot.recordset[0].qtd}`);
    } catch (e) {
      log(`  -- total: erro (${(e as Error).message})`);
    }

    // Primary key
    try {
      const pk = await pool.request().query(`
        SELECT col.name
        FROM [${DB}].sys.indexes i
        JOIN [${DB}].sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
        JOIN [${DB}].sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
        WHERE i.is_primary_key = 1 AND i.object_id = OBJECT_ID('[${DB}].dbo.${t}')
        ORDER BY ic.key_ordinal
      `);
      if (pk.recordset.length > 0) {
        log(`  PK: ${pk.recordset.map((r) => r.name).join(', ')}`);
      }
    } catch (e) {
      // ignora
    }
    log('');
  }

  // ───────────────────────────────────────────────────────────────
  // 3) Foreign keys saindo e entrando das tabelas CONTRATO_*
  // ───────────────────────────────────────────────────────────────
  log('\n# 3. Foreign keys (relacionamentos formais)\n');
  log('## FKs SAINDO de CONTRATO_* (apontam pra outras tabelas):');
  const fkOut = await pool.request().query(`
    SELECT
      fk.name AS fk,
      t1.name + '.' + c1.name AS source,
      t2.name + '.' + c2.name AS target
    FROM [${DB}].sys.foreign_keys fk
    JOIN [${DB}].sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN [${DB}].sys.tables t1 ON t1.object_id = fkc.parent_object_id
    JOIN [${DB}].sys.columns c1 ON c1.object_id = fkc.parent_object_id AND c1.column_id = fkc.parent_column_id
    JOIN [${DB}].sys.tables t2 ON t2.object_id = fkc.referenced_object_id
    JOIN [${DB}].sys.columns c2 ON c2.object_id = fkc.referenced_object_id AND c2.column_id = fkc.referenced_column_id
    WHERE t1.name LIKE 'CONTRATO%'
    ORDER BY t1.name, c1.name
  `);
  for (const r of fkOut.recordset) {
    log(`  ${r.source.padEnd(50)} → ${r.target}`);
  }

  log('\n## FKs CHEGANDO em CONTRATO_* (outras tabelas que referenciam):');
  const fkIn = await pool.request().query(`
    SELECT
      fk.name AS fk,
      t1.name + '.' + c1.name AS source,
      t2.name + '.' + c2.name AS target
    FROM [${DB}].sys.foreign_keys fk
    JOIN [${DB}].sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN [${DB}].sys.tables t1 ON t1.object_id = fkc.parent_object_id
    JOIN [${DB}].sys.columns c1 ON c1.object_id = fkc.parent_object_id AND c1.column_id = fkc.parent_column_id
    JOIN [${DB}].sys.tables t2 ON t2.object_id = fkc.referenced_object_id
    JOIN [${DB}].sys.columns c2 ON c2.object_id = fkc.referenced_object_id AND c2.column_id = fkc.referenced_column_id
    WHERE t2.name LIKE 'CONTRATO%'
    ORDER BY t1.name, c1.name
  `);
  for (const r of fkIn.recordset) {
    log(`  ${r.source.padEnd(50)} → ${r.target}`);
  }

  // ───────────────────────────────────────────────────────────────
  // 4) Sequenciais
  // ───────────────────────────────────────────────────────────────
  log('\n# 4. Sequenciais relacionados a CONTRATO\n');
  try {
    const seq = await pool.request().query(`
      SELECT TABELA_COLUNA, DESCRICAO, SEQUENCIA, TAMANHO
      FROM [${DB}].dbo.SEQUENCIAIS
      WHERE TABELA_COLUNA LIKE '%CONTRATO%'
      ORDER BY TABELA_COLUNA
    `);
    if (seq.recordset.length === 0) log('  (nenhum)');
    seq.recordset.forEach((s) =>
      log(
        `  ${s.TABELA_COLUNA.padEnd(35)} seq=${s.SEQUENCIA} tam=${s.TAMANHO}  ${s.DESCRICAO ?? ''}`,
      ),
    );
  } catch (e) {
    log('  ERRO: ' + (e as Error).message);
  }

  // ───────────────────────────────────────────────────────────────
  // 5) Procedures que mencionam CONTRATO
  // ───────────────────────────────────────────────────────────────
  log('\n# 5. Procedures que tocam tabelas CONTRATO_*\n');
  const procs = await pool.request().query(`
    SELECT DISTINCT p.name
    FROM [${DB}].sys.sql_modules m
    JOIN [${DB}].sys.procedures p ON p.object_id = m.object_id
    WHERE m.definition LIKE '%CONTRATO_ITEM%'
       OR m.definition LIKE '%CONTRATO_FATURAR%'
       OR m.definition LIKE '%FROM CONTRATO%'
       OR m.definition LIKE '%INTO CONTRATO%'
       OR m.definition LIKE '%UPDATE CONTRATO%'
    ORDER BY p.name
  `);
  if (procs.recordset.length === 0) log('  (nenhuma)');
  for (const r of procs.recordset) {
    log(`  ${r.name}`);
  }

  // ───────────────────────────────────────────────────────────────
  // 6) Triggers nas tabelas CONTRATO_*
  // ───────────────────────────────────────────────────────────────
  log('\n# 6. Triggers em CONTRATO_*\n');
  const trigs = await pool.request().query(`
    SELECT
      tr.name AS trigger_name,
      OBJECT_NAME(tr.parent_id) AS table_name,
      tr.is_disabled
    FROM [${DB}].sys.triggers tr
    WHERE OBJECT_NAME(tr.parent_id) LIKE 'CONTRATO%'
    ORDER BY OBJECT_NAME(tr.parent_id), tr.name
  `);
  if (trigs.recordset.length === 0) log('  (nenhuma)');
  for (const r of trigs.recordset) {
    log(
      `  ${String(r.table_name).padEnd(25)} → ${r.trigger_name}${r.is_disabled ? '  (DESABILITADA)' : ''}`,
    );
  }

  // ───────────────────────────────────────────────────────────────
  // 7) Views consumindo
  // ───────────────────────────────────────────────────────────────
  log('\n# 7. Views que mencionam CONTRATO\n');
  const vConsume = await pool.request().query(`
    SELECT DISTINCT v.name
    FROM [${DB}].sys.sql_modules m
    JOIN [${DB}].sys.views v ON v.object_id = m.object_id
    WHERE m.definition LIKE '%CONTRATO_ITEM%'
       OR m.definition LIKE '%CONTRATO_FATURAR%'
       OR m.definition LIKE '%FROM CONTRATO%'
    ORDER BY v.name
  `);
  if (vConsume.recordset.length === 0) log('  (nenhuma)');
  for (const r of vConsume.recordset) {
    log(`  ${r.name}`);
  }

  // ───────────────────────────────────────────────────────────────
  // 8) Colunas ID_CONTRATO / CONTRATO_TIPO em OUTRAS tabelas
  //     (vínculo do módulo com o resto do Linx)
  // ───────────────────────────────────────────────────────────────
  log('\n# 8. Vínculos externos — outras tabelas que têm coluna ID_CONTRATO ou CONTRATO_TIPO\n');
  const refs = await pool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
           CHARACTER_MAXIMUM_LENGTH AS len
    FROM [${DB}].INFORMATION_SCHEMA.COLUMNS
    WHERE (COLUMN_NAME IN ('ID_CONTRATO', 'CONTRATO_TIPO', 'CONTRATO_GRUPO', 'ID_CONTRATO_ITEM', 'NUMERO_CONTRATO')
        OR COLUMN_NAME LIKE 'ID_CONTRATO_%')
      AND TABLE_NAME NOT LIKE 'CONTRATO%'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);
  if (refs.recordset.length === 0) log('  (nenhuma)');
  for (const r of refs.recordset) {
    const type = r.DATA_TYPE + (r.len ? `(${r.len})` : '');
    log(`  ${r.TABLE_NAME.padEnd(40)} ${r.COLUMN_NAME.padEnd(20)} ${type}`);
  }

  // ───────────────────────────────────────────────────────────────
  // 9) Existe algum registro em HML ou DB_HRG3?
  // ───────────────────────────────────────────────────────────────
  log('\n# 9. Existem registros CONTRATO em HML / DB_HRG3?\n');
  for (const db of ['HML_GUESS', 'DB_HRG3']) {
    try {
      const c = await pool
        .request()
        .query(`SELECT COUNT(*) qtd FROM [${db}].dbo.CONTRATO`);
      log(`  ${db}.dbo.CONTRATO total: ${c.recordset[0].qtd}`);
    } catch (e) {
      log(`  ${db}.dbo.CONTRATO ERRO: ${(e as Error).message}`);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // 10) Conteúdo de CONTRATO_TIPO (já viu que tem 1 linha)
  // ───────────────────────────────────────────────────────────────
  log('\n# 10. Conteúdo de CONTRATO_TIPO (catálogo)\n');
  try {
    const ct = await pool
      .request()
      .query(`SELECT * FROM [${DB}].dbo.CONTRATO_TIPO`);
    ct.recordset.forEach((r) => log('  ' + JSON.stringify(r)));
  } catch (e) {
    log('  ERRO: ' + (e as Error).message);
  }

  // ───────────────────────────────────────────────────────────────
  // 11) Salva definições das procs e views relevantes em arquivos
  //     pra leitura calma fora do log
  // ───────────────────────────────────────────────────────────────
  log('\n# 11. Salvando definições de procs/views relevantes em arquivos\n');
  const outDir = 'I:/p2p/backend/scripts/_contratos';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const allTargets = [
    ...procs.recordset.map((r) => r.name),
    ...vConsume.recordset.map((r) => r.name),
  ];
  for (const name of allTargets.slice(0, 25)) {
    try {
      const def = await pool.request().query(`
        SELECT m.definition FROM [${DB}].sys.sql_modules m
        JOIN [${DB}].sys.objects o ON o.object_id = m.object_id
        WHERE o.name = '${name}'
      `);
      if (def.recordset[0]?.definition) {
        const path = `${outDir}/${name}.sql`;
        fs.writeFileSync(path, def.recordset[0].definition);
        log(`  ${name}.sql`);
      }
    } catch (e) {
      log(`  ${name} ERRO: ${(e as Error).message}`);
    }
  }

  // Salva relatório completo
  fs.writeFileSync(
    'I:/p2p/backend/scripts/_contratos/RELATORIO.md',
    out.join('\n'),
  );
  log(`\nRelatório salvo em scripts/_contratos/RELATORIO.md`);

  await pool.close();
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
