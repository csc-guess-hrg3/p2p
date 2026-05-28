/**
 * Validação rápida: as 3 views financeiras retornam dado em
 * GUESS_PRODUCAO e DB_HRG3? Que colunas relevantes existem?
 * Só LEITURA.
 */
import * as sql from 'mssql';

const VIEWS = [
  'W_CTB_A_PAGAR_PARCELA',
  'W_HRG3_CONTAS_PAGAR_PROVISAO',
  'W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO',
];

const DBS = ['GUESS_PRODUCAO', 'DB_HRG3'];

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: 'master',
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
  }).connect();

  for (const db of DBS) {
    console.log(`\n========== ${db} ==========`);
    for (const v of VIEWS) {
      console.log(`\n# ${v}`);
      try {
        const total = await pool
          .request()
          .query(`SELECT COUNT(*) AS c FROM [${db}].dbo.${v}`);
        console.log(`  total=${total.recordset[0].c}`);
      } catch (e) {
        console.log(`  total ERRO: ${(e as Error).message}`);
        continue;
      }
      try {
        const cols = await pool.request().query(`
          SELECT COLUMN_NAME
          FROM [${db}].INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = '${v}'
          ORDER BY ORDINAL_POSITION
        `);
        console.log(
          `  colunas=[${cols.recordset.map((c) => c.COLUMN_NAME).join(', ')}]`,
        );
      } catch (e) {
        console.log(`  colunas ERRO: ${(e as Error).message}`);
      }
    }
  }

  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
