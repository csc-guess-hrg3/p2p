/**
 * Cria (ou reseta a senha de) o usuário admin padrão do sistema.
 *
 * Por que existe:
 *   O bootstrap inicial do P2P precisa de UM usuário admin local — sem
 *   depender do Active Directory — pra primeiro login, configurar
 *   parâmetros, equipes, cadeias de aprovação. Antes, virar admin exigia
 *   promover um usuário existente pelo SQL ou pela UI (que não roda sem
 *   admin... círculo). Esse script quebra o ovo-galinha.
 *
 * Comportamento:
 *   - Lê credenciais do banco de .env ou .env.hml (passe --env hml).
 *   - Email canônico: admin@p2p.local (schema exige email único).
 *   - Username: admin (login local).
 *   - Idempotente: se já existe, NÃO recria (mostra aviso).
 *   - --reset força nova senha pro admin existente.
 *   - Senha forte gerada (16 chars, atende RN-USR-04: upper+lower+digit+special).
 *   - Hash bcrypt cost 10 (mesmo padrão do resto).
 *   - Senha aparece UMA VEZ no console em box ASCII — não persistida.
 *   - Vincula admin a TODAS as empresas ativas (user_companies).
 *
 * Uso:
 *   node scripts/seed-admin.js                # cria no PROD (.env)
 *   node scripts/seed-admin.js --env hml      # cria no HML (.env.hml)
 *   node scripts/seed-admin.js --reset        # reseta senha do existente
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function parseArgs(argv) {
  const args = { env: 'env', reset: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--env') {
      args.env = argv[++i];
    } else if (argv[i] === '--reset') {
      args.reset = true;
    }
  }
  return args;
}

function loadEnvFile(name) {
  const filename = name === 'env' ? '.env' : `.env.${name}`;
  const file = path.join(__dirname, '..', filename);
  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo ${filename} não encontrado em ${file}`);
  }
  const txt = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

/**
 * Gera senha forte de 16 caracteres garantindo presença de cada classe
 * exigida pela política (RN-USR-04). Embaralha pra distribuir as classes
 * em posições aleatórias (não deixar maiúscula sempre no início, etc).
 */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sem I/O (confunde com 1/0)
  const lower = 'abcdefghijkmnopqrstuvwxyz'; // sem l
  const digit = '23456789'; // sem 0/1
  const special = '!@#$%&*+=?';
  const all = upper + lower + digit + special;
  function pick(pool) {
    return pool[crypto.randomInt(pool.length)];
  }
  const required = [pick(upper), pick(lower), pick(digit), pick(special)];
  const rest = Array.from({ length: 12 }, () => pick(all));
  const chars = [...required, ...rest];
  // Fisher-Yates com fonte criptográfica.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function printPasswordBox(email, password, reset) {
  const banner = reset ? 'SENHA DO ADMIN RESETADA' : 'ADMIN CRIADO COM SUCESSO';
  const border = '═'.repeat(64);
  console.log(`\n╔${border}╗`);
  console.log(`║  ${banner.padEnd(60)}  ║`);
  console.log(`╠${border}╣`);
  console.log(`║  Email:  ${email.padEnd(54)}║`);
  console.log(`║  Login:  admin${' '.repeat(49)}║`);
  console.log(`║  Senha:  ${password.padEnd(54)}║`);
  console.log(`╠${border}╣`);
  console.log(`║  ⚠  Anote essa senha AGORA. Não será mostrada de novo.     ║`);
  console.log(`║  ⚠  Troque na primeira oportunidade (admin > usuários).    ║`);
  console.log(`╚${border}╝\n`);
}

(async () => {
  const args = parseArgs(process.argv);
  const env = loadEnvFile(args.env);

  const pool = await sql.connect({
    server: env.DB_HOST,
    port: Number(env.DB_PORT || 1433),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
    requestTimeout: 60000,
  });

  console.log(`\n→ Conectado em ${env.DB_HOST}:${env.DB_PORT || 1433}/${env.DB_NAME}`);

  // Procura admin pelo email canônico — mesma chave usada no login local.
  const existing = (
    await pool
      .request()
      .input('email', 'admin@p2p.local')
      .query('SELECT id, name, status FROM dbo.users WHERE email = @email')
  ).recordset[0];

  if (existing && !args.reset) {
    console.log(
      `\n⚠  Admin já existe (id=${existing.id}, status=${existing.status}).`,
    );
    console.log(`   Para resetar a senha: node scripts/seed-admin.js --reset`);
    await pool.close();
    process.exit(0);
  }

  const password = generatePassword();
  const hash = await bcrypt.hash(password, 10);
  const now = new Date();

  if (existing) {
    // RESET: atualiza só a senha + zera lockout + reativa.
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, existing.id)
      .input('hash', hash)
      .input('passwordSetAt', sql.DateTime2, now)
      .query(`UPDATE dbo.users
                 SET passwordHash = @hash,
                     passwordSetAt = @passwordSetAt,
                     failedLoginAttempts = 0,
                     lockedUntil = NULL,
                     status = 'ACTIVE',
                     updatedAt = SYSDATETIME()
               WHERE id = @id`);
    printPasswordBox('admin@p2p.local', password, true);
    await pool.close();
    process.exit(0);
  }

  // CREATE: insere o admin + vincula a todas as empresas ativas.
  const adminId = crypto.randomUUID();
  await pool
    .request()
    .input('id', sql.UniqueIdentifier, adminId)
    .input('username', 'admin')
    .input('email', 'admin@p2p.local')
    .input('name', 'Administrador do Sistema')
    .input('hash', hash)
    .input('passwordSetAt', sql.DateTime2, now)
    .query(`INSERT INTO dbo.users
              (id, adUsername, username, email, name, profile, status,
               loginType, passwordHash, passwordSetAt, failedLoginAttempts,
               canSwitchEnv, createdAt, updatedAt)
            VALUES
              (@id, NULL, @username, @email, @name, 'ADMIN', 'ACTIVE',
               'LOCAL', @hash, @passwordSetAt, 0,
               1, SYSDATETIME(), SYSDATETIME())`);

  // Vincula a todas as empresas ativas pra admin enxergar o escopo todo.
  const companies = (
    await pool.request().query(
      `SELECT id, code FROM dbo.companies WHERE active = 1 AND deletedAt IS NULL`,
    )
  ).recordset;

  for (const c of companies) {
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, crypto.randomUUID())
      .input('userId', sql.UniqueIdentifier, adminId)
      .input('companyId', sql.UniqueIdentifier, c.id)
      .query(`INSERT INTO dbo.user_companies
                (id, userId, companyId, createdAt)
              VALUES (@id, @userId, @companyId, SYSDATETIME())`);
    console.log(`  ✓ vinculado à empresa ${c.code} (${c.id})`);
  }
  if (companies.length === 0) {
    console.log(
      `  ⚠  Nenhuma empresa ativa encontrada — admin sem escopo até criar uma.`,
    );
  }

  printPasswordBox('admin@p2p.local', password, false);
  await pool.close();
  process.exit(0);
})().catch((err) => {
  console.error('\n✗ ERRO:', err.message);
  process.exit(1);
});
