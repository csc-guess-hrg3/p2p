/**
 * Aplica uma migration idempotente no banco do APP em PROD (P2P_DB @ .5),
 * lendo as credenciais do pm2.config.js (app p2p-api-prod), máquina-a-máquina
 * — a senha nunca é impressa. Registra em _prisma_migrations pra o histórico
 * do Prisma ficar coerente.
 *
 * As migrations aqui são escritas com EXEC sp_executesql idempotente (sem GO),
 * então o arquivo inteiro roda como um único batch.
 *
 * Rodar:  node apply-migration-prod.js <migration_name>
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./pm2.config.js');

const name = process.argv[2];
if (!name) {
  console.error('Uso: node apply-migration-prod.js <migration_name>');
  process.exit(1);
}
const file = path.join(__dirname, 'prisma', 'migrations', name, 'migration.sql');
if (!fs.existsSync(file)) {
  console.error(`Migration não encontrada: ${file}`);
  process.exit(1);
}
const ddl = fs.readFileSync(file, 'utf8');

const prod = cfg.apps.find((a) => a.name === 'p2p-api-prod').env;

(async () => {
  const pool = await sql.connect({
    server: prod.DB_HOST || '192.168.10.5',
    port: Number(prod.DB_PORT || 1433),
    database: prod.DB_NAME || 'P2P_DB', // banco do APP (users, audit_logs)
    user: prod.DB_USER,
    password: prod.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 120000,
  });

  console.log(`→ Aplicando "${name}" em ${prod.DB_NAME}…`);
  await pool.request().batch(ddl);
  console.log('  DDL aplicada.');

  // Registra no histórico do Prisma (idempotente).
  const checksum = crypto.createHash('sha256').update(ddl).digest('hex');
  const exists = (
    await pool
      .request()
      .input('n', sql.NVarChar, name)
      .query('SELECT id FROM _prisma_migrations WHERE migration_name = @n')
  ).recordset;
  if (exists.length === 0) {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, crypto.randomUUID())
      .input('cs', sql.NVarChar, checksum)
      .input('n', sql.NVarChar, name)
      .query(
        `INSERT INTO _prisma_migrations
           (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
         VALUES (@id, @cs, SYSDATETIMEOFFSET(), @n, NULL, NULL, SYSDATETIMEOFFSET(), 1)`,
      );
    console.log(`✓ "${name}" aplicada e registrada.`);
  } else {
    console.log(`✓ "${name}" aplicada (já estava registrada).`);
  }

  // Verificação: as colunas existem agora?
  const cols = (
    await pool.request().query(`
      SELECT 'audit_logs.entityId_nullable' AS chk, COLUMNPROPERTY(OBJECT_ID('dbo.audit_logs'),'entityId','AllowsNull') AS v
      UNION ALL SELECT 'audit_logs.companyId_nullable', COLUMNPROPERTY(OBJECT_ID('dbo.audit_logs'),'companyId','AllowsNull')
      UNION ALL SELECT 'audit_logs.entityRef_exists', CASE WHEN COL_LENGTH('dbo.audit_logs','entityRef') IS NULL THEN 0 ELSE 1 END
      UNION ALL SELECT 'users.activeImpersonationSessionId_exists', CASE WHEN COL_LENGTH('dbo.users','activeImpersonationSessionId') IS NULL THEN 0 ELSE 1 END
    `)
  ).recordset;
  console.log('--- verificação ---');
  for (const r of cols) console.log(`  ${r.chk} = ${r.v}`);

  await pool.close();
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
