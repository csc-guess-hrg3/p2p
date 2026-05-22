/**
 * Cria/atualiza company_erp_configs no HML_P2P_DB com os defaults do
 * Linx para a empresa GUESS (e HRG3 se existir). SMTP fica vazio —
 * deve ser preenchido manualmente (server, porta, usuário, senha, from).
 */
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

function loadEnvHml() {
  const txt = fs.readFileSync(path.join(__dirname, '.env.hml'), 'utf8');
  const env = {};
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
  }
  return env;
}

const DEFAULTS = {
  GUESS: {
    codTransacao: 'COMPRAS_003',
    tabelaFilha: 'COMPRAS_CONSUMIVEL',
    tipoCompraDefault: 'COMPRA DIVERSAS',
    ctbTipoOperacaoDefault: 202,
    naturezaEntradaDefault: '202.01',
  },
  HRG3: {
    codTransacao: 'COMPRAS_003',
    tabelaFilha: 'COMPRAS_CONSUMIVEL',
    tipoCompraDefault: 'COMPRA DIVERSAS',
    ctbTipoOperacaoDefault: 202,
    naturezaEntradaDefault: '202.02',
  },
};

(async () => {
  const env = loadEnvHml();
  const pool = await sql.connect({
    server: env.DB_HOST,
    port: Number(env.DB_PORT || 1433),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: true },
  });

  const companies = (
    await pool
      .request()
      .query('SELECT id, code FROM dbo.companies WHERE deletedAt IS NULL')
  ).recordset;

  for (const c of companies) {
    const d = DEFAULTS[c.code];
    if (!d) {
      console.log(`- ${c.code}: sem defaults conhecidos, pulando`);
      continue;
    }
    const exists = (
      await pool
        .request()
        .input('id', c.id)
        .query('SELECT companyId FROM dbo.company_erp_configs WHERE companyId = @id')
    ).recordset.length > 0;
    if (exists) {
      console.log(`= ${c.code}: já configurado`);
      continue;
    }
    await pool
      .request()
      .input('companyId', c.id)
      .input('codTransacao', d.codTransacao)
      .input('tabelaFilha', d.tabelaFilha)
      .input('tipoCompraDefault', d.tipoCompraDefault)
      .input('ctbTipoOperacaoDefault', d.ctbTipoOperacaoDefault)
      .input('naturezaEntradaDefault', d.naturezaEntradaDefault)
      .query(`INSERT INTO dbo.company_erp_configs
              (companyId, codTransacao, tabelaFilha, tipoCompraDefault,
               ctbTipoOperacaoDefault, naturezaEntradaDefault, updatedAt)
              VALUES (@companyId, @codTransacao, @tabelaFilha,
                      @tipoCompraDefault, @ctbTipoOperacaoDefault,
                      @naturezaEntradaDefault, GETDATE())`);
    console.log(`+ ${c.code}: defaults gravados`);
  }

  console.log('\nLembre de preencher smtpHost/smtpPort/smtpUser/smtpPassword/smtpFrom em company_erp_configs.');
  await pool.close();
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
