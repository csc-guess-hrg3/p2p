import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

const adapter = new PrismaMssql({
  server: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT ?? 1433),
  database: process.env.DB_NAME!,
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  options: { trustServerCertificate: true, encrypt: true },
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const db = process.env.ERP_DB ?? 'GUESS_PRODUCAO';
  const trg = process.env.TRG ?? 'LXI_COMPRAS_CONSUMIVEL';
  const r = await prisma.$queryRawUnsafe<{ text: string }[]>(
    `SELECT m.definition AS text
       FROM [${db}].sys.sql_modules m
       JOIN [${db}].sys.objects o ON o.object_id = m.object_id
      WHERE o.name = '${trg}'`,
  );
  console.log(r[0]?.text ?? '(empty)');
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
