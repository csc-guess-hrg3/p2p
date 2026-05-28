/**
 * Bate direto no endpoint /api/financial/contas-pagar do backend PROD
 * (localhost:3000) com um JWT forjado a partir do JWT_SECRET — pula login.
 * Mostra o status HTTP, headers, corpo e mensagem de erro completa.
 */
import jwt from 'jsonwebtoken';
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

  // Pega um admin ativo
  const users = (await prisma.$queryRawUnsafe(
    `SELECT TOP 1 id, name, profile FROM users WHERE profile = 'ADMIN' AND status = 'ACTIVE' AND deletedAt IS NULL`,
  )) as Array<{ id: string; name: string; profile: string }>;
  const user = users[0];
  if (!user) throw new Error('Nenhum admin encontrado');
  console.log('# Auth como:', user.name, '/', user.id);

  // Pega uma empresa ativa (GUESS de preferência)
  const companies = (await prisma.$queryRawUnsafe(
    `SELECT TOP 1 id, code, erpDbName FROM companies WHERE active = 1 AND code = 'GUESS'`,
  )) as Array<{ id: string; code: string; erpDbName: string }>;
  const company = companies[0];
  console.log('# Empresa:', company.code, company.id);

  // Forja JWT
  const token = jwt.sign(
    { sub: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: '5m' },
  );
  console.log('# JWT criado (5min)\n');

  // Probe cada endpoint
  const url = (path: string) => `http://localhost:3000/api${path}`;
  const calls: [string, string][] = [
    ['contas-pagar', `/financial/contas-pagar?companyId=${company.id}&status=A_VENCER`],
    ['iads', `/financial/iads?companyId=${company.id}&status=A_VENCER`],
    ['provisoes', `/financial/provisoes?companyId=${company.id}&tipo=SV`],
    ['ddas', `/financial/ddas?companyId=${company.id}&status=PENDENTE`],
  ];

  for (const [label, path] of calls) {
    console.log(`\n========== ${label} ==========`);
    console.log(`GET ${path}`);
    const t0 = Date.now();
    const res = await fetch(url(path), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const dt = Date.now() - t0;
    console.log(`status=${res.status}  duração=${dt}ms`);
    const body = await res.text();
    if (res.ok) {
      try {
        const parsed = JSON.parse(body);
        console.log(`items.length = ${parsed.items?.length ?? '?'}`);
        console.log(`limit=${parsed.limit}, offset=${parsed.offset}`);
        if (parsed.items?.[0]) {
          console.log('Primeiro item (keys):', Object.keys(parsed.items[0]).join(', '));
          console.log('Sample 3 linhas:');
          parsed.items.slice(0, 3).forEach((r: any, i: number) =>
            console.log(`  ${i + 1}.`, JSON.stringify(r).slice(0, 280)),
          );
        }
      } catch {
        console.log('Body bruto:', body.slice(0, 500));
      }
    } else {
      console.log('Erro body:', body.slice(0, 1000));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
