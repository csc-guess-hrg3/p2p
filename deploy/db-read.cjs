/*
 * Leitor SÓ-LEITURA do banco (para o Claude consultar sem pedir aprovação a cada vez).
 * Uso:  node deploy/db-read.cjs "SELECT ..."  [--block p2p-api-prod|p2p-api-hml]
 *
 * - As credenciais vêm do bloco do backend/pm2.config.js (gitignored) — nunca hardcoded.
 * - Recusa qualquer coisa que não seja um SELECT/WITH de leitura (guarda por palavra-chave
 *   + uma instrução só). É essa recusa que torna a regra de permissão segura: mesmo liberado,
 *   o helper não consegue escrever.
 */
const path = require('path');
const repo = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
let block = 'p2p-api-prod';
const bi = argv.indexOf('--block');
if (bi >= 0) {
  block = argv[bi + 1];
  argv.splice(bi, 2);
}
const query = (argv[0] || '').trim();
if (!query) {
  console.error('Uso: node deploy/db-read.cjs "SELECT ..." [--block p2p-api-prod]');
  process.exit(2);
}

// --- guarda de SÓ-LEITURA ---
const noComments = query.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
const first = noComments.replace(/^[;\s(]+/, '').split(/\s+/)[0].toUpperCase();
if (!['SELECT', 'WITH'].includes(first)) {
  console.error(`BLOQUEADO: só leitura (SELECT/WITH). Começa com: ${first || '(vazio)'}`);
  process.exit(3);
}
if (/\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|GRANT|REVOKE|INTO|BACKUP|RESTORE)\b/i.test(noComments)) {
  console.error('BLOQUEADO: palavra de escrita/comando encontrada.');
  process.exit(3);
}
if (noComments.replace(/;\s*$/, '').includes(';')) {
  console.error('BLOQUEADO: várias instruções (;) não são permitidas.');
  process.exit(3);
}

const cfg = require(path.join(repo, 'backend', 'pm2.config.js'));
const app = (cfg.apps || []).find((a) => a.name === block);
if (!app || !app.env) {
  console.error(`Bloco "${block}" não encontrado no pm2.config.js.`);
  process.exit(4);
}
const e = app.env;
const sql = require(path.join(repo, 'backend', 'node_modules', 'mssql'));

(async () => {
  try {
    await sql.connect({
      server: e.DB_HOST,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      options: { encrypt: true, trustServerCertificate: true, readOnlyIntent: true },
      connectionTimeout: 15000,
      requestTimeout: 30000,
    });
    const r = await sql.query(query);
    const rows = r.recordset || [];
    console.error(`(${block} · ${e.DB_HOST}/${e.DB_NAME}) ${rows.length} linha(s)`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('ERRO:', err.message);
    process.exit(1);
  } finally {
    try {
      await sql.close();
    } catch {}
  }
})();
