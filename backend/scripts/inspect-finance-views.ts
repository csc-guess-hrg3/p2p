/**
 * Inspeção focada das views/tabelas das 3 telas financeiras + SV.
 * Lista as colunas + 1 sample row de cada. Permite desenhar a query
 * do P2P com os nomes/tipos certos.
 */
import * as sql from 'mssql';

const TARGETS = [
  // Contas a Pagar — parcela é o nível certo (cada vencimento)
  'W_CTB_A_PAGAR_PARCELA',
  'W_CTB_A_PAGAR_PARCELA_SALDO',
  // Provisão (HRG3-específica)
  'W_HRG3_CONTAS_PAGAR_PROVISAO',
  // DDAs
  'W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO',
  'W_HRG3_CTB_A_PAGAR_DDA_PENDENTE_ENTRADA_ERP',
  // Solicitação de Verba (cabeçalho)
  'CTB_SOLICITACAO_VERBA',
];

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: 'GUESS_PRODUCAO',
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
  }).connect();

  for (const name of TARGETS) {
    console.log(`\n========================================`);
    console.log(`# ${name}`);
    console.log(`========================================`);
    try {
      const cols = await pool.request().query(`
        SELECT COLUMN_NAME, DATA_TYPE,
               CHARACTER_MAXIMUM_LENGTH AS len,
               IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '${name}'
        ORDER BY ORDINAL_POSITION
      `);
      console.log('\n## Colunas:');
      cols.recordset.forEach((c) =>
        console.log(
          '  ',
          `${c.COLUMN_NAME.padEnd(36)} ${c.DATA_TYPE}${
            c.len && c.len > 0 ? '(' + c.len + ')' : ''
          } ${c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'}`,
        ),
      );

      console.log('\n## Sample 1 row:');
      const sample = await pool.request().query(
        `SELECT TOP 1 * FROM dbo.${name}`,
      );
      if (sample.recordset.length === 0) {
        console.log('   (vazio)');
      } else {
        Object.entries(sample.recordset[0]).forEach(([k, v]) => {
          const val = v === null ? 'NULL' : String(v).slice(0, 60);
          console.log(`   ${k.padEnd(34)} = ${val}`);
        });
      }
    } catch (e) {
      console.log('Erro:', (e as Error).message);
    }
  }

  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
