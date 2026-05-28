/**
 * Reproduz a chamada exata do FinancialService usando o PrismaClient +
 * adapter MSSQL — mesma stack do backend. Se isso funcionar, o bug está
 * no controller/auth/companyId; se quebrar, está na camada de query.
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
  console.log('Conectado ao P2P_DB:', process.env.DB_NAME);

  // Lista empresas pra ver erpDbName
  console.log('\n# Companies cadastradas:');
  const companies: Array<{ id: string; code: string; erpDbName: string }> =
    await prisma.$queryRawUnsafe(
      `SELECT id, code, erpDbName FROM companies WHERE active = 1`,
    );
  companies.forEach((c) =>
    console.log(`  ${c.code.padEnd(8)} erpDbName=${c.erpDbName}  id=${c.id}`),
  );

  // Para cada empresa, roda a query exata de contas a pagar
  const today = new Date().toISOString().slice(0, 10);
  for (const c of companies) {
    console.log(`\n## ${c.code} (${c.erpDbName}) — contas a pagar A_VENCER:`);
    const sql = `
      SELECT TOP 3
        p.LANCAMENTO, p.NOME_CLIFOR, p.FATURA,
        p.VENCIMENTO_REAL, p.SALDO_PRINCIPAL_DEVIDO,
        p.LX_TIPO_LANCAMENTO
      FROM [${c.erpDbName}].dbo.W_CTB_A_PAGAR_PARCELA p
      WHERE p.EMPRESA = 1
        AND p.SALDO_PRINCIPAL_DEVIDO > 0
        AND p.VENCIMENTO_REAL >= '${today}'
      ORDER BY p.VENCIMENTO_REAL ASC
    `;
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(sql);
      console.log(`  ${rows.length} linhas`);
      rows.forEach((r) =>
        console.log(
          `    ${r.LANCAMENTO} ${String(r.NOME_CLIFOR).slice(0, 25)} ` +
            `R$${r.SALDO_PRINCIPAL_DEVIDO} venc=${r.VENCIMENTO_REAL}`,
        ),
      );
    } catch (e) {
      console.log(`  ERRO: ${(e as Error).message}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
