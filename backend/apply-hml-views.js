/**
 * Aplica/recria as views v_p2p_* no HML_P2P_DB (lendo erp-views.hml.sql).
 * As views fazem cross-database para HML_GUESS (mesmo servidor .34).
 *
 * Rodar: node apply-hml-views.js
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

function loadEnvHml() {
  const txt = fs.readFileSync(path.join(__dirname, '.env.hml'), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

(async () => {
  const env = loadEnvHml();
  const pool = await sql.connect({
    server: env.DB_HOST,
    port: Number(env.DB_PORT || 1433),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 60000,
  });

  const ddl = fs.readFileSync(
    path.join(__dirname, 'prisma', 'erp-views.hml.sql'),
    'utf8',
  );
  const batches = ddl.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  for (const batch of batches) {
    const m = batch.match(/VIEW dbo\.(\w+)/i);
    await pool.request().query(batch);
    console.log(`OK -> ${m ? m[1] : '(batch)'}`);
  }

  console.log('\n--- Contagens ---');
  const views = [
    'v_p2p_branches', 'v_p2p_cost_centers', 'v_p2p_suppliers',
    'v_p2p_accounts', 'v_p2p_items', 'v_p2p_supplier_items',
    'v_p2p_payment_conditions', 'v_p2p_branch_rateios', 'v_p2p_cc_rateios',
    'v_p2p_compras_tipos', 'v_p2p_ctb_tipo_operacao', 'v_p2p_naturezas_entrada',
  ];
  for (const v of views) {
    try {
      const r = await pool.request().query(`SELECT COUNT(*) n FROM dbo.${v}`);
      console.log(`${v}: ${r.recordset[0].n} linhas`);
    } catch (e) {
      console.log(`${v}: ERRO ${e.message}`);
    }
  }

  await pool.close();
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
