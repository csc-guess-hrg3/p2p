/**
 * Confere se as linhas que sairiam da $queryRawUnsafe serializam pra JSON
 * sem explodir (BigInt → JSON.stringify lança TypeError silencioso quando
 * caímos na codificação que o NestJS aplica antes de mandar pra rede).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

async function main() {
  const adapter = new PrismaMssql({
    server: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 1433),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    options: { trustServerCertificate: true, encrypt: true },
  });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT TOP 1
      p.EMPRESA, p.LANCAMENTO, p.ITEM, p.ID_PARCELA,
      p.NOME_CLIFOR, p.FATURA, p.EMISSAO, p.VENCIMENTO_REAL,
      p.VALOR_ORIGINAL, p.SALDO_PRINCIPAL_DEVIDO
    FROM [GUESS_PRODUCAO].dbo.W_CTB_A_PAGAR_PARCELA p
    WHERE p.EMPRESA = 1 AND p.SALDO_PRINCIPAL_DEVIDO > 0
  `);

  console.log('# Row crua (Object.entries):');
  for (const [k, v] of Object.entries(rows[0])) {
    console.log(`  ${k.padEnd(28)} typeof=${typeof v}  value=${
      v instanceof Date ? v.toISOString() : String(v)
    }`);
  }

  console.log('\n# JSON.stringify(rows[0]):');
  try {
    console.log(JSON.stringify(rows[0]));
  } catch (e) {
    console.log('ERRO serialização:', (e as Error).message);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
