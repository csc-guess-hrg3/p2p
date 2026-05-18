/**
 * Seed do P2P_DB — dados base.
 * Idempotente (usa upsert): pode ser rodado quantas vezes precisar.
 *   node prisma/seed.js
 */
require('dotenv/config');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');

const adapter = new PrismaMssql({
  server: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: true },
});
const prisma = new PrismaClient({ adapter });

// --- Admin(s) inicial(is): login do AD ---
// O e-mail é provisório — sincronizado do AD no primeiro login.
const INITIAL_ADMINS = [
  {
    adUsername: 'tifany.porto',
    name: 'Tifany Porto',
    email: 'tifany.porto@hrg3.com.br',
  },
];

/**
 * Reaplica as views de integração com o ERP.
 * As views não fazem parte das migrations Prisma — um `migrate reset`
 * as remove. Rodar o seed após um reset restaura tudo.
 */
async function applyErpViews() {
  const ddlPath = path.join(__dirname, 'erp-views.sql');
  const ddl = fs.readFileSync(ddlPath, 'utf8');
  const batches = ddl
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const batch of batches) {
    await prisma.$executeRawUnsafe(batch);
  }
  console.log(`Views de integração: ${batches.length} aplicadas`);
}

async function main() {
  await applyErpViews();

  // Empresas
  const guess = await prisma.company.upsert({
    where: { code: 'GUESS' },
    update: { name: 'Guess', erpDbName: 'GUESS_PRODUCAO' },
    create: { code: 'GUESS', name: 'Guess', erpDbName: 'GUESS_PRODUCAO' },
  });
  const hering = await prisma.company.upsert({
    where: { code: 'HERING' },
    update: { name: 'Hering', erpDbName: 'DB_HRG3' },
    create: { code: 'HERING', name: 'Hering', erpDbName: 'DB_HRG3' },
  });
  const companies = [guess, hering];
  console.log(`Empresas: ${companies.map((c) => c.code).join(', ')}`);

  // As cadeias de aprovação são por equipe (TeamApprovalLevel),
  // configuradas pelo admin na tela de equipes.

  // Administrador(es) inicial(is) — acesso às duas empresas
  for (const a of INITIAL_ADMINS) {
    const admin = await prisma.user.upsert({
      where: { adUsername: a.adUsername },
      update: { profile: 'ADMIN', status: 'ACTIVE', email: a.email },
      create: {
        adUsername: a.adUsername,
        name: a.name,
        email: a.email,
        profile: 'ADMIN',
        status: 'ACTIVE',
      },
    });
    for (const company of companies) {
      await prisma.userCompany.upsert({
        where: {
          userId_companyId: { userId: admin.id, companyId: company.id },
        },
        update: {},
        create: { userId: admin.id, companyId: company.id },
      });
    }
    console.log(`Admin: ${a.adUsername} (acesso a ${companies.length} empresas)`);
  }

  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error('ERRO no seed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
