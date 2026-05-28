/**
 * Roda exatamente as 3 queries que o FinancialService monta — confere
 * se voltam linhas em GUESS_PRODUCAO e DB_HRG3 com os filtros padrão da UI.
 */
import * as sql from 'mssql';

async function main() {
  const pool = await new sql.ConnectionPool({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: 'master',
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
  }).connect();

  const today = new Date().toISOString().slice(0, 10);

  for (const db of ['GUESS_PRODUCAO', 'DB_HRG3']) {
    console.log(`\n========== ${db} ==========`);

    // Contas a pagar — A VENCER (saldo > 0, vencimento >= hoje)
    const cap = await pool.request().query(`
      SELECT TOP 3 LANCAMENTO, NOME_CLIFOR, FATURA, VENCIMENTO_REAL,
             SALDO_PRINCIPAL_DEVIDO, LX_TIPO_LANCAMENTO
      FROM [${db}].dbo.W_CTB_A_PAGAR_PARCELA p
      WHERE p.EMPRESA = 1
        AND p.SALDO_PRINCIPAL_DEVIDO > 0
        AND p.VENCIMENTO_REAL >= '${today}'
      ORDER BY p.VENCIMENTO_REAL ASC
    `);
    console.log(`\n  Contas a Pagar (A VENCER) — top3:`);
    cap.recordset.forEach((r, i) =>
      console.log(
        `   ${i + 1}. lcto=${r.LANCAMENTO} ${String(r.NOME_CLIFOR).slice(0, 30).padEnd(30)} fat=${r.FATURA} venc=${new Date(r.VENCIMENTO_REAL).toISOString().slice(0, 10)} saldo=${r.SALDO_PRINCIPAL_DEVIDO} tipo=${r.LX_TIPO_LANCAMENTO}`,
      ),
    );

    // Provisões — TIPO='SV'
    const prov = await pool.request().query(`
      SELECT TOP 3 TIPO, ID, EMITENTE, NOME_CLIFOR, VALOR_ORIGINAL,
             VALOR_ENTREGAR, STATUS_APROVACAO, EMISSAO
      FROM [${db}].dbo.W_HRG3_CONTAS_PAGAR_PROVISAO v
      WHERE v.TIPO = N'SV'
      ORDER BY v.EMISSAO DESC
    `);
    console.log(`\n  Provisões TIPO=SV — top3:`);
    prov.recordset.forEach((r, i) =>
      console.log(
        `   ${i + 1}. ${r.TIPO}/${r.ID} ${String(r.EMITENTE ?? '').slice(0, 20).padEnd(20)} ${String(r.NOME_CLIFOR ?? '').slice(0, 30).padEnd(30)} R$${r.VALOR_ORIGINAL} status=${r.STATUS_APROVACAO}`,
      ),
    );

    // Provisões — TIPOs distintos pra confirmar IAD/ITP existirem
    const tipos = await pool.request().query(`
      SELECT TIPO, COUNT(*) AS qtd
      FROM [${db}].dbo.W_HRG3_CONTAS_PAGAR_PROVISAO
      GROUP BY TIPO ORDER BY TIPO
    `);
    console.log(`  TIPOs em PROVISAO: ${tipos.recordset.map((t) => `${t.TIPO}=${t.qtd}`).join(', ')}`);

    // DDA — PENDENTE (LANCAMENTO NULL ou 0)
    const dda = await pool.request().query(`
      SELECT TOP 3 ID_ARQUIVO, ITEM_ARQUIVO, DUPLICATA, RAZAO_SOCIAL,
             VALOR_TITULO, VENCIMENTO, DESC_STATUS, LANCAMENTO
      FROM [${db}].dbo.W_HRG3_CTB_A_PAGAR_DDA_MONITORAMENTO d
      WHERE 1=1 AND (d.LANCAMENTO IS NULL OR d.LANCAMENTO = 0)
      ORDER BY d.DATA_RECEBIMENTO DESC
    `);
    console.log(`\n  DDA PENDENTE — top3:`);
    dda.recordset.forEach((r, i) =>
      console.log(
        `   ${i + 1}. arq=${r.ID_ARQUIVO}/${r.ITEM_ARQUIVO} dup=${r.DUPLICATA} ${String(r.RAZAO_SOCIAL ?? '').slice(0, 30).padEnd(30)} R$${r.VALOR_TITULO} status=${r.DESC_STATUS}`,
      ),
    );
  }

  await pool.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
