# Setup de produção — Backend P2P

## Onde ficam os secrets

Os secrets (senhas de DB, LDAP, Qive, JWT_SECRET, SECRET_ENCRYPTION_KEY)
vivem no **`pm2.config.js`** (gitignored), não em `.env`. Esse arquivo
fica no disco do servidor com permissão restrita e é lido pelo PM2 ao
subir o serviço.

## Passos

1. Copie o template:
   ```
   cp pm2.config.example.js pm2.config.js
   ```
2. Gere os secrets (executar **uma vez por ambiente** — PROD e HML têm
   valores DIFERENTES, nunca reaproveitar):
   ```
   node -e "const c=require('crypto');console.log('JWT_SECRET=' + c.randomBytes(48).toString('base64'));console.log('JWT_REFRESH_SECRET=' + c.randomBytes(48).toString('base64'));console.log('SECRET_ENCRYPTION_KEY=' + c.randomBytes(32).toString('hex'))"
   ```
3. Cole os valores em `pm2.config.js` (substituindo os `<<>>`),
   incluindo senhas reais do DB, LDAP, Qive, etc.
4. Restringir permissões do arquivo:
   ```
   icacls pm2.config.js /inheritance:r /grant:r "$($env:USERNAME):F"
   ```
   (apenas o usuário do serviço lê)
5. Subir o serviço:
   ```
   pm2 start pm2.config.js --only p2p-api-prod
   pm2 start pm2.config.js --only p2p-api-hml
   pm2 save
   pm2 startup    # configura auto-start no boot do Windows
   ```

## Migração a partir de `.env`

Hoje o backend lê de `.env`/`.env.hml` em share de rede — vulnerável.
Após popular `pm2.config.js`:

1. Pare o serviço atual: `pm2 delete p2p-api-prod p2p-api-hml` (ou kill
   manual dos `node dist/src/main.js`).
2. Suba via PM2 com `pm2.config.js`.
3. Apague `backend/.env` e `backend/.env.hml` do disco (não mais
   necessários — todos os secrets agora vêm do PM2).
4. Verifique no log que conectou no banco certo e que JWT continua
   funcionando.

## Rotação periódica

Recomendado a cada 6 meses:
- JWT_SECRET / JWT_REFRESH_SECRET (rotação invalida todas as sessões — usuários re-logam)
- SECRET_ENCRYPTION_KEY (rotação exige re-criptografar os campos
  `company_erp_configs.smtpPassword` no banco)
- DB password do `integrador`
- LDAP password
- Qive API key

Documentar cada rotação em changelog interno.

## Log rotation

```
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## Backup

SQL Server Agent → Maintenance Plan → backup full diário do `P2P_DB`,
log every 15min, off-site (network share separado ou cloud). Testar
restore mensalmente em ambiente isolado.
