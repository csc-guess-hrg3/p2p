/**
 * Mostra a última falha de SEND_SV registrada em integration_logs
 * pra entender por que a SV-2026-000002 não foi pro Linx.
 */
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
  const rows = await prisma.integrationLog.findMany({
    where: { jobType: 'SEND_SV' },
    orderBy: { executedAt: 'desc' },
    take: 5,
  });
  for (const r of rows) {
    console.log(
      `[${r.executedAt.toISOString()}] ${r.status} (${r.durationMs}ms) source=${r.source}`,
    );
    if (r.errorDetails) console.log(`  ${r.errorDetails}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
