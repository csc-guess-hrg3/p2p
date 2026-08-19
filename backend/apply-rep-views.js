/**
 * Aplica as views genéricas de relatório do representante (Área Externa)
 * lendo prisma/erp-report-views.sql. Essas views vivem em GUESS_PRODUCAO.dbo
 * (mesmo DB das tabelas-fonte do ERP) e são filtradas pelo motor via
 * WHERE cod_representante = @cod (código REAL do rep logado).
 *
 * Credenciais: lidas do pm2.config.js (app p2p-api-prod), máquina-a-máquina
 * — a senha nunca é impressa. Força o host PROD .5 e o DB GUESS_PRODUCAO.
 *
 * Rodar: node apply-rep-views.js
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const cfg = require('./pm2.config.js');

const prod = cfg.apps.find((a) => a.name === 'p2p-api-prod').env;

(async () => {
  const pool = await sql.connect({
    server: '192.168.10.5',
    port: Number(prod.DB_PORT || 1433),
    database: 'GUESS_PRODUCAO',
    user: prod.DB_USER,
    password: prod.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 120000,
  });

  const ddl = fs.readFileSync(
    path.join(__dirname, 'prisma', 'erp-report-views.sql'),
    'utf8',
  );
  const batches = ddl
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter((b) => /CREATE\s+OR\s+ALTER\s+VIEW/i.test(b));

  for (const batch of batches) {
    const m = batch.match(/VIEW dbo\.(\w+)/i);
    await pool.request().query(batch);
    console.log(`OK -> ${m ? m[1] : '(batch)'}`);
  }

  console.log('\n--- Validação (cod_representante = 007713 / KALIFA) ---');
  for (const v of ['v_p2p_rep_faturamentos', 'v_p2p_rep_financeiro', 'v_p2p_rep_clientes']) {
    try {
      const total = (await pool.request().query(`SELECT COUNT(*) n FROM dbo.${v}`)).recordset[0].n;
      const kalifa = (
        await pool.request().query(`SELECT COUNT(*) n FROM dbo.${v} WHERE cod_representante='007713'`)
      ).recordset[0].n;
      const reps = (
        await pool.request().query(`SELECT COUNT(DISTINCT cod_representante) n FROM dbo.${v}`)
      ).recordset[0].n;
      console.log(`${v}: total=${total} | KALIFA=${kalifa} | reps_distintos=${reps}`);
    } catch (e) {
      console.log(`${v}: ERRO ${e.message}`);
    }
  }
  // Sub-grid: pedidos da nota (não escopado por rep). Amostra p/ GE MEGA STORE.
  try {
    const grid = (
      await pool.request().query(
        `SELECT PEDIDO, entrega, emissao_pedido, pedido_cliente
           FROM dbo.v_p2p_nota_pedidos
          WHERE NOME_CLIFOR = 'GE MEGA STORE            '
          ORDER BY PEDIDO, entrega`,
      )
    ).recordset;
    console.log(`v_p2p_nota_pedidos (GE MEGA STORE): ${grid.length} linha(s)`);
    console.log(JSON.stringify(grid.slice(0, 5)));
  } catch (e) {
    console.log(`v_p2p_nota_pedidos: ERRO ${e.message}`);
  }

  await pool.close();
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
