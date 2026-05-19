// Aplica as views de integração ERP no P2P_DB
// Lê credenciais do .env (DATABASE_URL no formato Prisma sqlserver://)
const sql = require('mssql');
const fs = require('fs');

function loadConfig() {
  const env = fs.readFileSync('.env', 'utf8');
  const line = env.split('\n').find((l) => l.startsWith('DATABASE_URL='));
  let url = line.substring('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
  // sqlserver://HOST:PORT;database=..;user=..;password={..};...
  const host = url.match(/sqlserver:\/\/([^:;]+)/i)[1];
  const port = Number((url.match(/:(\d+);/) || [, 1433])[1]);
  const database = url.match(/database=([^;]+)/i)[1];
  const user = url.match(/user=([^;]+)/i)[1];
  // senha entre chaves (greedy até o último } antes de ;)
  const pwMatch = url.match(/password=\{(.+)\};/i) || url.match(/password=([^;]+)/i);
  return {
    server: host, port, database, user, password: pwMatch[1],
    options: { trustServerCertificate: true, encrypt: true }, requestTimeout: 60000,
  };
}

(async () => {
  const ddl = fs.readFileSync('prisma/erp-views.sql', 'utf8');
  const batches = ddl.split(/^\s*GO\s*$/im).map((b) => b.trim()).filter(Boolean);
  const pool = await sql.connect(loadConfig());

  for (const batch of batches) {
    const m = batch.match(/VIEW dbo\.(\w+)/i);
    await pool.request().query(batch);
    console.log(`OK -> ${m ? m[1] : '(batch)'}`);
  }

  console.log('\n--- Validacao ---');
  for (const v of ['v_p2p_branches', 'v_p2p_cost_centers', 'v_p2p_suppliers',
                    'v_p2p_accounts', 'v_p2p_items', 'v_p2p_supplier_items',
                    'v_p2p_branch_rateios', 'v_p2p_cc_rateios']) {
    const r = await pool.request().query(`SELECT COUNT(*) n FROM dbo.${v}`);
    console.log(`${v}: ${r.recordset[0].n} linhas`);
  }
  await pool.close();
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
