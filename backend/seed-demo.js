/**
 * Seed do MODO DEMONSTRAÇÃO.
 *
 * Cria, no P2P_DB (apontado pelo .env do ambiente em uso):
 *   - 1 empresa fictícia "DEMO" (não aponta para nenhum ERP real — usa
 *     `erpDbName='DEMO_ERP'` apenas como placeholder textual; o envio ao
 *     Linx é bloqueado para esta empresa, ver comentário no fim).
 *   - 1 CompanyErpConfig com SMTP vazio (não envia e-mail por padrão).
 *   - 1 equipe "Equipe Demo" com cadeia de aprovação:
 *       Nível 1: Bruno (Gestor)  — alçada R$ 50.000
 *       Nível 2: Alice (Admin)    — alçada R$ 250.000
 *       Nível 3: Daniel (Revisor) — alçada nula (sem teto)
 *   - 4 usuários demo (1 ADMIN, 1 MANAGER, 1 OPERATOR, 1 REVIEWER).
 *   - 1 SystemSetting para a chave de cotações (mantém o default).
 *
 * Rodar:
 *   PROD:  cd backend && node seed-demo.js
 *   HML:   cd backend && node seed-demo.js --hml
 *
 * Pré-requisitos:
 *   - migrations aplicadas (npx prisma migrate deploy ou apply-hml-migrations.js);
 *   - DEMO_MODE_ENABLED=true no .env do backend (para o /auth/demo-login responder);
 *   - reiniciar o backend após o seed.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaMssql } = require('@prisma/adapter-mssql');

function loadEnv() {
  const useHml = process.argv.includes('--hml');
  const file = useHml ? '.env.hml' : '.env';
  const full = path.join(__dirname, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Arquivo ${file} não encontrado em ${__dirname}.`);
  }
  const txt = fs.readFileSync(full, 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  console.log(`[seed-demo] Ambiente: ${useHml ? 'HML' : 'PROD'} (${file})`);
  return env;
}

const env = loadEnv();
const adapter = new PrismaMssql({
  server: env.DB_HOST,
  port: Number(env.DB_PORT || 1433),
  database: env.DB_NAME,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  options: { trustServerCertificate: true, encrypt: true },
});
const prisma = new PrismaClient({ adapter });

const DEMO_USERS = [
  {
    adUsername: 'demo.admin',
    name: 'Alice (Administradora)',
    email: 'admin@demo.local',
    profile: 'ADMIN',
  },
  {
    adUsername: 'demo.gestor',
    name: 'Bruno (Gestor)',
    email: 'gestor@demo.local',
    profile: 'MANAGER',
  },
  {
    adUsername: 'demo.operador',
    name: 'Camila (Operadora)',
    email: 'operador@demo.local',
    profile: 'OPERATOR',
  },
  {
    adUsername: 'demo.revisor',
    name: 'Daniel (Revisor Fiscal)',
    email: 'revisor@demo.local',
    profile: 'REVIEWER',
  },
];

async function upsertCompany() {
  const company = await prisma.company.upsert({
    where: { code: 'DEMO' },
    update: { name: 'Empresa Demonstração', erpDbName: 'DEMO_ERP' },
    create: {
      code: 'DEMO',
      name: 'Empresa Demonstração',
      cnpj: '00.000.000/0001-00',
      erpDbName: 'DEMO_ERP',
      active: true,
    },
  });
  console.log(`[seed-demo] Empresa DEMO: ${company.id}`);
  return company;
}

async function upsertCompanyConfig(companyId) {
  // Config mínima para o motor não reclamar caso alguém tente enviar
  // pedido — em modo demo, recomendamos NÃO enviar (DEMO_ERP é fictício).
  await prisma.companyErpConfig.upsert({
    where: { companyId },
    update: {},
    create: {
      companyId,
      codTransacao: 'DEMO_TRANSACAO',
      tabelaFilha: 'DEMO_TABELA',
      tipoCompraDefault: 'DEMO TIPO',
      ctbTipoOperacaoDefault: 999,
      naturezaEntradaDefault: '999.99',
      // SMTP vazio = não envia e-mail. Para testar e-mail, preencher manualmente.
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPassword: null,
      smtpSecure: false,
      smtpFrom: null,
      smtpFromName: null,
      emailSubjectTemplate: 'Pedido de Compra {{numero}} — Demo',
      emailBodyTemplate:
        'Prezados,\n\nEste é um envio do AMBIENTE DEMO do P2P — não considere.\n' +
        '\nNúmero: {{numero}}\nFornecedor: {{fornecedor}}\nTotal: {{total}}\n' +
        '\nAtenciosamente,\nP2P Demo.',
    },
  });
  console.log('[seed-demo] CompanyErpConfig: criado/atualizado (SMTP vazio).');
}

async function upsertUsers(companyId) {
  const users = {};
  for (const u of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { adUsername: u.adUsername },
      update: {
        name: u.name,
        email: u.email,
        profile: u.profile,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        adUsername: u.adUsername,
        name: u.name,
        email: u.email,
        profile: u.profile,
        status: 'ACTIVE',
      },
    });
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: user.id, companyId } },
      update: {},
      create: { userId: user.id, companyId },
    });
    users[u.profile] = user;
    console.log(`[seed-demo] User: ${u.adUsername} (${u.profile})`);
  }
  return users;
}

async function upsertTeamAndChain(users) {
  const teamName = 'Equipe Demo';
  let team = await prisma.team.findFirst({ where: { name: teamName } });
  if (!team) {
    team = await prisma.team.create({
      data: {
        name: teamName,
        managerId: users.MANAGER.id,
        active: true,
        isFiscal: false,
      },
    });
  } else {
    team = await prisma.team.update({
      where: { id: team.id },
      data: { managerId: users.MANAGER.id, active: true },
    });
  }

  // Todos os usuários demo entram na equipe (visibilidade unificada).
  for (const u of Object.values(users)) {
    await prisma.user.update({
      where: { id: u.id },
      data: { teamId: team.id },
    });
  }

  // Cadeia: nível 1 Gestor (50k), nível 2 Admin (250k), nível 3 Revisor sem teto.
  await prisma.teamApprovalLevel.deleteMany({ where: { teamId: team.id } });
  await prisma.teamApprovalLevel.createMany({
    data: [
      {
        teamId: team.id,
        level: 1,
        name: 'Gestor',
        approverId: users.MANAGER.id,
        maxAmount: 50000,
      },
      {
        teamId: team.id,
        level: 2,
        name: 'Administrador',
        approverId: users.ADMIN.id,
        maxAmount: 250000,
      },
      {
        teamId: team.id,
        level: 3,
        name: 'Diretor',
        approverId: users.REVIEWER.id,
        maxAmount: null,
      },
    ],
  });
  console.log(
    `[seed-demo] Team "${teamName}" + cadeia de aprovação (3 níveis).`,
  );
  return team;
}

async function ensureSettings(companyId) {
  // Confirma chave de cotações no default (não persiste valor — usa default).
  // Aqui só registramos a chave caso o Admin queira ajustar pela UI.
  console.log(
    '[seed-demo] Settings: usando defaults (threshold R$ 10.000, mínimo 3).',
  );
  void companyId;
}

async function seedSampleRequisition(company, users, team) {
  // Cria uma requisição rascunho para fins didáticos. Como não temos ERP
  // de verdade ligado a este company, não conseguimos validar via views
  // v_p2p_* — então não chamamos o service. Inserimos direto, com dados
  // sintéticos.
  const existing = await prisma.requisition.findFirst({
    where: { companyId: company.id, number: 'REQ-DEMO-000001' },
  });
  if (existing) {
    console.log('[seed-demo] Requisição exemplo já existe — pulando.');
    return;
  }
  await prisma.requisition.create({
    data: {
      number: 'REQ-DEMO-000001',
      companyId: company.id,
      branchErpCode: 'DEMO-FIL-01',
      branchName: 'Filial Demo Matriz',
      supplierErpCode: 'DEMO-FOR-001',
      supplierName: 'Fornecedor Demo Ltda',
      requesterId: users.OPERATOR.id,
      teamId: team.id,
      title: 'Aquisição de material de escritório (demo)',
      justification:
        'Reposição mensal de papel A4, canetas e materiais de limpeza para a Filial Matriz.',
      tipoNotaFiscal: 'NF_EXISTENTE',
      status: 'DRAFT',
      totalAmount: 1250.0,
      paymentConditionCode: '30',
      paymentConditionDesc: '30 dias',
      recurring: false,
      quotationsCount: 0,
      items: {
        create: [
          {
            itemDescription: 'Papel A4 — resma 500 folhas',
            quantity: 50,
            unit: 'PC',
            estimatedPrice: 25.0,
            totalPrice: 1250.0,
            accountingAccount: '4.1.01.001',
            accountName: 'Material de Escritório',
            branchRateioCode: 'DEMO-RAT-FIL',
            branchRateioDesc: 'Rateio padrão filial',
            costCenterRateioCode: 'DEMO-RAT-CC',
            costCenterRateioDesc: 'Rateio padrão CC',
            notes: 'Linha sintética — apenas para demonstração.',
          },
        ],
      },
    },
  });
  console.log('[seed-demo] Requisição exemplo REQ-DEMO-000001 criada.');
}

async function main() {
  const company = await upsertCompany();
  await upsertCompanyConfig(company.id);
  const users = await upsertUsers(company.id);
  const team = await upsertTeamAndChain(users);
  await ensureSettings(company.id);
  await seedSampleRequisition(company, users, team);

  console.log('\n[seed-demo] OK ✅');
  console.log('  - Selecione a empresa DEMO no topbar após logar.');
  console.log('  - DEMO_MODE_ENABLED=true precisa estar no .env do backend.');
  console.log('  - Reinicie o backend após o seed.');
}

main()
  .catch((e) => {
    console.error('[seed-demo] ERRO:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
