/**
 * Template do ecosystem PM2 — copie para `pm2.config.js` (gitignored)
 * e preencha os secrets reais. NÃO commitar valores reais.
 *
 * Uso:
 *   pm2 start pm2.config.js --env production --only p2p-api-prod
 *   pm2 start pm2.config.js --env hml        --only p2p-api-hml
 *
 * O `pm2.config.js` (com valores reais) fica em disco com permissão
 * restrita; o usuário do serviço Windows lê via `pm2`. Não precisa
 * `.env` no disco — todos os secrets vivem aqui.
 *
 * Pra gerar secrets fortes:
 *   node -e "const c=require('crypto');console.log(c.randomBytes(48).toString('base64'))"
 */
module.exports = {
  apps: [
    {
      name: 'p2p-api-prod',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '768M',
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/prod.err.log',
      out_file: 'logs/prod.out.log',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // ─── Banco P2P ───
        DB_HOST: '192.168.10.5',
        DB_PORT: '1433',
        DB_NAME: 'P2P_DB',
        DB_USER: 'integrador',
        DB_PASSWORD: '<<COLOQUE_A_SENHA_AQUI>>',
        // ─── JWT (gere com `node -e "..."` separado por ambiente) ───
        JWT_SECRET: '<<GERAR_48_BYTES_BASE64>>',
        JWT_REFRESH_SECRET: '<<GERAR_48_BYTES_BASE64>>',
        JWT_EXPIRES_IN: '8h',
        JWT_REFRESH_EXPIRES_IN: '7d',
        // ─── Criptografia de SMTP no banco (32 bytes hex) ───
        SECRET_ENCRYPTION_KEY: '<<GERAR_32_BYTES_HEX>>',
        // ─── LDAP ───
        LDAP_URL: 'ldap://...',
        LDAP_BASE_DN: '...',
        LDAP_BIND_DN: '...',
        LDAP_BIND_PASSWORD: '<<>>',
        // ─── Qive ───
        QIVE_API_ID: '<<>>',
        QIVE_API_KEY: '<<>>',
        // ─── Frontend / CORS ───
        FRONTEND_URLS: 'https://p2p.hrg3.com.br',
        AUTH_MODE: 'cookie',
        COOKIE_SAMESITE: 'lax',
        // ─── Turnstile (Cloudflare) ───
        TURNSTILE_SECRET_KEY: '<<>>',
      },
    },
    {
      name: 'p2p-api-hml',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/hml.err.log',
      out_file: 'logs/hml.out.log',
      env: {
        NODE_ENV: 'production', // HML também roda como prod-build
        PORT: 3001,
        DB_HOST: '<<HML_HOST>>',
        DB_PORT: '1433',
        DB_NAME: 'HML_P2P_DB',
        DB_USER: 'integrador',
        DB_PASSWORD: '<<>>',
        // Secrets DIFERENTES do PROD — nunca reaproveitar
        JWT_SECRET: '<<GERAR_48_BYTES_BASE64>>',
        JWT_REFRESH_SECRET: '<<GERAR_48_BYTES_BASE64>>',
        JWT_EXPIRES_IN: '8h',
        JWT_REFRESH_EXPIRES_IN: '7d',
        SECRET_ENCRYPTION_KEY: '<<GERAR_32_BYTES_HEX>>',
        LDAP_URL: 'ldap://...',
        LDAP_BASE_DN: '...',
        LDAP_BIND_DN: '...',
        LDAP_BIND_PASSWORD: '<<>>',
        QIVE_API_ID: '<<>>',
        QIVE_API_KEY: '<<>>',
        FRONTEND_URLS: 'https://hml.p2p.hrg3.com.br',
        AUTH_MODE: 'cookie',
        COOKIE_SAMESITE: 'lax',
        TURNSTILE_SECRET_KEY: '<<>>',
      },
    },
  ],
};
