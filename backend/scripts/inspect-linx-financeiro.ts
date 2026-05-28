/**
 * Inspeção do schema financeiro do Linx pra desenhar o módulo Financeiro
 * do P2P (PRD § 11).
 *
 * Mapeia 4 áreas:
 *   1) Contas a Pagar — títulos a pagar (provisões, adiantamentos, NF entradas)
 *   2) DDA — boletos do banco
 *   3) NF de Entrada — vínculo PC ↔ NF que reduz adiantamento
 *   4) Lançamentos contábeis — provisões (CTB)
 *
 * Estratégia: lista candidatos por prefixo + nome, mostra schema das que
 * encontrar, sample row pra entender dados, e busca em SEQUENCIAIS por
 * itens financeiros (procs internas do Linx tipo LX_SEQUENCIAL).
 *
 * Só LEITURA — não escreve nada.
 */
import * as sql from 'mssql';

async function main() {
  const host = process.env.DB_HOST!;
  const port = Number(process.env.DB_PORT ?? 1433);
  const user = process.env.DB_USER!;
  const password = process.env.DB_PASSWORD!;

  const pool = await new sql.ConnectionPool({
    server: host,
    port,
    database: 'GUESS_PRODUCAO',
    user,
    password,
    options: { trustServerCertificate: true, encrypt: true },
  }).connect();

  console.log('# Inspeção Financeira — GUESS_PRODUCAO\n');

  // ───────────────────────────────────────────────────────────────
  // 1) Tabelas candidatas
  // ───────────────────────────────────────────────────────────────
  console.log('## Tabelas com nomes financeiros (filtros amplos):\n');
  const tables = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      AND (
        TABLE_NAME LIKE 'CP[_]%'  -- contas a pagar
        OR TABLE_NAME LIKE 'CR[_]%'  -- contas a receber (referência)
        OR TABLE_NAME LIKE '%DDA%'
        OR TABLE_NAME LIKE '%TITULO%'
        OR TABLE_NAME LIKE '%PAGAR%'
        OR TABLE_NAME LIKE '%PROVISAO%'
        OR TABLE_NAME LIKE '%ADIANT%'
        OR TABLE_NAME LIKE '%BOLETO%'
        OR TABLE_NAME LIKE 'CTB[_]%'  -- contábil
        OR TABLE_NAME LIKE 'NOTAS[_]FISCAIS%'
        OR TABLE_NAME LIKE '%NF[_]ENTRADA%'
        OR TABLE_NAME LIKE 'NF[_]%'
      )
    ORDER BY TABLE_NAME
  `);
  tables.recordset.forEach((t) => console.log('  ', t.TABLE_NAME));
  const tableNames: string[] = tables.recordset.map((t) => t.TABLE_NAME);

  // ───────────────────────────────────────────────────────────────
  // 2) Views financeiras existentes
  // ───────────────────────────────────────────────────────────────
  console.log('\n## Views (qualquer prefixo) com nomes financeiros:\n');
  const views = await pool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.VIEWS
    WHERE TABLE_NAME LIKE '%FIN%'
       OR TABLE_NAME LIKE '%PAGAR%'
       OR TABLE_NAME LIKE '%TITULO%'
       OR TABLE_NAME LIKE '%DDA%'
       OR TABLE_NAME LIKE '%PROVISAO%'
       OR TABLE_NAME LIKE '%ADIANT%'
       OR TABLE_NAME LIKE 'v_p2p_%'
    ORDER BY TABLE_NAME
  `);
  views.recordset.forEach((v) => console.log('  ', v.TABLE_NAME));

  // ───────────────────────────────────────────────────────────────
  // 3) Schema das tabelas-chave que provavelmente existem
  // ───────────────────────────────────────────────────────────────
  const focusList = [
    // contas a pagar
    'CP_TITULOS',
    'TITULOS_PAGAR',
    'CONTAS_PAGAR',
    'CP_TITULOS_PAGAR',
    // adiantamentos (espelham SV do P2P)
    'CP_ADIANTAMENTOS',
    'ADIANTAMENTOS',
    'SOLICITACAO_PAGAMENTO',
    'SOLICITACOES_PAGAMENTO',
    // DDA
    'CP_DDA',
    'DDA',
    'DDA_ARQUIVO',
    'BOLETO_DDA',
    // NF Entrada
    'NOTAS_FISCAIS_ENTRADA',
    'NF_ENTRADA',
    'ENTRADAS_NF',
    'NOTAS_ENTRADA',
    // Contábil — provisões
    'CTB_LANCAMENTOS',
    'CTB_LCTOS',
    'CTB_PROVISOES',
  ];

  for (const t of focusList) {
    if (!tableNames.includes(t)) continue;
    console.log(`\n## Colunas de ${t} (TOP 30):`);
    try {
      const cols = await pool.request().query(`
        SELECT TOP 30 COLUMN_NAME, DATA_TYPE,
               CHARACTER_MAXIMUM_LENGTH AS len, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${t}'
        ORDER BY ORDINAL_POSITION
      `);
      cols.recordset.forEach((c) =>
        console.log(
          '  ',
          `${c.COLUMN_NAME.padEnd(32)} ${c.DATA_TYPE}${
            c.len ? '(' + c.len + ')' : ''
          } ${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`,
        ),
      );
    } catch (e) {
      console.log('   Erro:', (e as Error).message);
    }

    // sample 1 row
    console.log(`\n   Sample 1 row de ${t}:`);
    try {
      const sample = await pool.request().query(`SELECT TOP 1 * FROM dbo.${t}`);
      if (sample.recordset.length > 0) {
        Object.entries(sample.recordset[0])
          .slice(0, 35)
          .forEach(([k, v]) => {
            const val = v === null ? 'NULL' : String(v).slice(0, 60);
            console.log(`      ${k.padEnd(30)} = ${val}`);
          });
      } else {
        console.log('      (tabela vazia)');
      }
    } catch (e) {
      console.log('      Erro:', (e as Error).message);
    }
  }

  // ───────────────────────────────────────────────────────────────
  // 4) Sequenciais financeiros (referência pra desenhar nossa SV no Linx)
  // ───────────────────────────────────────────────────────────────
  console.log('\n## SEQUENCIAIS contendo SOLICITACAO/TITULO/PAGAR/DDA/ADIANT:\n');
  try {
    const seqs = await pool.request().query(`
      SELECT TABELA_COLUNA, DESCRICAO, SEQUENCIA, TAMANHO
      FROM dbo.SEQUENCIAIS
      WHERE TABELA_COLUNA LIKE '%SOLICITACAO%'
         OR TABELA_COLUNA LIKE '%TITULO%'
         OR TABELA_COLUNA LIKE '%PAGAR%'
         OR TABELA_COLUNA LIKE '%DDA%'
         OR TABELA_COLUNA LIKE '%ADIANT%'
         OR TABELA_COLUNA LIKE '%PROV%'
      ORDER BY TABELA_COLUNA
    `);
    if (seqs.recordset.length === 0) console.log('  (nenhum)');
    else console.table(seqs.recordset);
  } catch (e) {
    console.log('   Erro:', (e as Error).message);
  }

  // ───────────────────────────────────────────────────────────────
  // 5) Vínculo PC → título (existe `pedido` em alguma tabela financeira?)
  // ───────────────────────────────────────────────────────────────
  console.log('\n## Tabelas financeiras com referência a PEDIDO/COMPRA:\n');
  try {
    const refs = await pool.request().query(`
      SELECT DISTINCT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE (TABLE_NAME LIKE 'CP[_]%'
             OR TABLE_NAME LIKE 'CTB[_]%'
             OR TABLE_NAME LIKE '%DDA%'
             OR TABLE_NAME LIKE '%TITULO%'
             OR TABLE_NAME LIKE '%ADIANT%'
             OR TABLE_NAME LIKE '%PAGAR%'
             OR TABLE_NAME LIKE '%PROVISAO%'
             OR TABLE_NAME LIKE '%NF_ENTRADA%'
             OR TABLE_NAME LIKE 'NOTAS_FISCAIS_ENTRADA')
        AND (COLUMN_NAME LIKE 'PEDIDO%'
             OR COLUMN_NAME LIKE 'COMPRA%'
             OR COLUMN_NAME LIKE 'NF[_]ENTRADA%'
             OR COLUMN_NAME LIKE 'NUMERO[_]NF%'
             OR COLUMN_NAME = 'CLIFOR'
             OR COLUMN_NAME = 'FORNECEDOR'
             OR COLUMN_NAME LIKE '%VENCIMENTO%')
      ORDER BY TABLE_NAME, COLUMN_NAME
    `);
    console.table(refs.recordset.slice(0, 80));
  } catch (e) {
    console.log('   Erro:', (e as Error).message);
  }

  // ───────────────────────────────────────────────────────────────
  // 6) Procedures financeiras — overview (só nomes, sem corpo)
  // ───────────────────────────────────────────────────────────────
  console.log('\n## Procedures financeiras candidatas:\n');
  try {
    const procs = await pool.request().query(`
      SELECT name
      FROM sys.procedures
      WHERE name LIKE '%FIN%'
         OR name LIKE '%PAGAR%'
         OR name LIKE '%TITULO%'
         OR name LIKE '%PROVISAO%'
         OR name LIKE '%ADIANT%'
         OR name LIKE '%DDA%'
         OR name LIKE 'LX_%PG%'
      ORDER BY name
    `);
    procs.recordset.forEach((p) => console.log('  ', p.name));
  } catch (e) {
    console.log('   Erro:', (e as Error).message);
  }

  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
