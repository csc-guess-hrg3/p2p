/**
 * Seed do ambiente de HOMOLOGAÇÃO (HML_P2P_DB no servidor .34).
 * Aplica as views de HML (erp-views.hml.sql, lendo HML_GUESS) e semeia
 * a empresa GUESS (-> HML_GUESS) e o administrador inicial.
 * Conexão lida de .env.hml. Rodar: node seed-hml.js
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');

function loadEnvHml() {
  const txt = fs.readFileSync(path.join(__dirname, '.env.hml'), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

const env = loadEnvHml();
const adapter = new PrismaMssql({
  server: env.DB_HOST,
  port: Number(env.DB_PORT || 1433),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: true },
});
const prisma = new PrismaClient({ adapter });

const INITIAL_ADMINS = [
  {
    adUsername: 'tifany.porto',
    name: 'Tifany Porto',
    email: 'tifany.porto@hrg3.com.br',
  },
];

async function applyViews() {
  const ddl = fs.readFileSync(
    path.join(__dirname, 'prisma', 'erp-views.hml.sql'),
    'utf8',
  );
  const batches = ddl
    .split(/^\s*GO\s*$/im)
    .map((b) => b.trim())
    .filter(Boolean);
  for (const batch of batches) {
    await prisma.$executeRawUnsafe(batch);
  }
  console.log(`Views de HML: ${batches.length} aplicadas`);
}

async function main() {
  await applyViews();

  const guess = await prisma.company.upsert({
    where: { code: 'GUESS' },
    update: { name: 'Guess', erpDbName: 'HML_GUESS' },
    create: { code: 'GUESS', name: 'Guess', erpDbName: 'HML_GUESS' },
  });
  console.log('Empresa: GUESS (HML_GUESS)');

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
    await prisma.userCompany.upsert({
      where: {
        userId_companyId: { userId: admin.id, companyId: guess.id },
      },
      update: {},
      create: { userId: admin.id, companyId: guess.id },
    });
    console.log(`Admin: ${a.adUsername}`);
  }

  console.log('Seed HML concluído.');
}

main()
  .catch((e) => {
    console.error('ERRO no seed HML:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
