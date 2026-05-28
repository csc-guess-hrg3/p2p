/**
 * Aplica um arquivo de migration SQL contra um banco SQL Server usando
 * o adapter MSSQL (mesmas credenciais que o app real usa via DB_*).
 *
 * Workaround para quando `prisma migrate deploy` não consegue parsear
 * a senha por causa de caracteres especiais na DATABASE_URL — esse
 * script usa as vars separadas (DB_HOST, DB_PASSWORD, etc.) que o
 * adapter aceita literalmente.
 *
 * Uso:
 *   node --env-file=.env.hml -r ts-node/register scripts/apply-migration-direct.ts <migration_name>
 *
 * Também marca a migration como aplicada na tabela `_prisma_migrations`
 * pra o `prisma migrate status` ficar coerente.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Uso: apply-migration-direct.ts <migration_name>');
    process.exit(1);
  }

  const file = path.join('prisma', 'migrations', name, 'migration.sql');
  if (!fs.existsSync(file)) {
    console.error(`Migration não encontrada: ${file}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(file, 'utf-8');

  const adapter = new PrismaMssql({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
  });

  const prisma = new PrismaClient({ adapter });

  console.log(`→ Aplicando migration "${name}" em ${process.env.DB_NAME}…`);

  // Cada bloco EXEC sp_executesql na migration é independente — splitamos
  // pelo ponto-e-vírgula final de cada bloco. A migration foi escrita
  // pensando nisso (sem GO, com sp_executesql por causa do Prisma).
  // Aqui executamos o arquivo inteiro de uma vez: o Tiberius driver
  // do adapter MSSQL aceita batch com múltiplos statements.
  await prisma.$executeRawUnsafe(sql);

  // Marca como aplicada em _prisma_migrations pra ficar em sincronia
  // com o histórico do Prisma.
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');
  const exists = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM _prisma_migrations WHERE migration_name = '${name}'`,
  );
  if (exists.length === 0) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await prisma.$executeRawUnsafe(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) ` +
        `VALUES ('${id}', '${checksum}', '${now}', '${name}', NULL, NULL, '${now}', 1)`,
    );
    console.log(`✓ Migration "${name}" aplicada e registrada.`);
  } else {
    console.log(`✓ Migration "${name}" aplicada (já estava registrada).`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
