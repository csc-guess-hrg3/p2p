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

(async () => {
  const cols = await prisma.$queryRawUnsafe<unknown[]>(
    `SELECT name, system_type_name AS type
     FROM sys.dm_exec_describe_first_result_set(N'SELECT * FROM dbo.attachments', NULL, 0)
     WHERE name = 'kind'`,
  );
  console.log(`DB=${process.env.DB_NAME} → coluna 'kind':`, cols);
  await prisma.$disconnect();
})();
