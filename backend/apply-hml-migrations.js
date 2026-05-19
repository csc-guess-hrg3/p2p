/**
 * Aplica as migrations do Prisma no banco de HOMOLOGAÇÃO (HML_P2P_DB).
 *
 * O `prisma migrate deploy` não funciona para o HML porque o parser de
 * URL do Prisma não lida com a senha de homologação. Este script usa o
 * driver mssql direto (que aceita a senha como string) e popula a
 * tabela _prisma_migrations para manter o controle de versão.
 *
 * Conexão lida de .env.hml. Rodar: node apply-hml-migrations.js
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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
    requestTimeout: 120000,
  });

  // Tabela de controle do Prisma.
  await pool.request().query(`
    IF OBJECT_ID('dbo._prisma_migrations') IS NULL
    CREATE TABLE [dbo].[_prisma_migrations] (
      [id] NVARCHAR(36) NOT NULL CONSTRAINT [_prisma_migrations_pkey] PRIMARY KEY,
      [checksum] NVARCHAR(64) NOT NULL,
      [finished_at] DATETIMEOFFSET,
      [migration_name] NVARCHAR(250) NOT NULL,
      [logs] NVARCHAR(MAX),
      [rolled_back_at] DATETIMEOFFSET,
      [started_at] DATETIMEOFFSET NOT NULL DEFAULT CURRENT_TIMESTAMP,
      [applied_steps_count] INT NOT NULL DEFAULT 0
    )`);

  const done = (
    await pool.request().query('SELECT migration_name FROM dbo._prisma_migrations')
  ).recordset.map((r) => r.migration_name);

  const dir = path.join(__dirname, 'prisma', 'migrations');
  const migrations = fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'migration.sql')))
    .sort();

  let applied = 0;
  for (const name of migrations) {
    if (done.includes(name)) {
      console.log(`= ${name} (já aplicada)`);
      continue;
    }
    const sqlText = fs.readFileSync(
      path.join(dir, name, 'migration.sql'),
      'utf8',
    );
    const checksum = crypto
      .createHash('sha256')
      .update(sqlText)
      .digest('hex');
    await pool.request().query(sqlText);
    await pool
      .request()
      .input('id', crypto.randomUUID())
      .input('checksum', checksum)
      .input('name', name)
      .query(`INSERT INTO dbo._prisma_migrations
                (id, checksum, migration_name, finished_at, applied_steps_count)
              VALUES (@id, @checksum, @name, SYSDATETIMEOFFSET(), 1)`);
    console.log(`+ ${name} aplicada`);
    applied++;
  }
  console.log(`\n${applied} migration(s) nova(s); ${migrations.length} no total.`);
  await pool.close();
  process.exit(0);
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
