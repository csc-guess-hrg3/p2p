# Setup de producao - Backend P2P

Este guia e o caminho recomendado para PROD e HML operacional. O uso de
`backend/.env` e `backend/.env.hml` deve ficar restrito a desenvolvimento
local ou diagnostico pontual, porque esses arquivos costumam viver em share
de rede e carregam credenciais sensiveis.

## Onde ficam os secrets

Os secrets (senhas de DB, LDAP, Qive, `JWT_SECRET`,
`JWT_REFRESH_SECRET`, `SECRET_ENCRYPTION_KEY`) vivem no
`pm2.config.js` local do servidor, que e ignorado pelo Git. Esse arquivo
deve ter permissao restrita ao usuario do servico Windows/PM2.

## Passos

1. Copie o template:

   ```powershell
   Copy-Item pm2.config.example.js pm2.config.js
   ```

2. Gere os secrets uma vez por ambiente. PROD e HML precisam de valores
   diferentes:

   ```powershell
   node -e "const c=require('crypto');console.log('JWT_SECRET=' + c.randomBytes(48).toString('base64'));console.log('JWT_REFRESH_SECRET=' + c.randomBytes(48).toString('base64'));console.log('SECRET_ENCRYPTION_KEY=' + c.randomBytes(32).toString('hex'))"
   ```

3. Cole os valores em `pm2.config.js`, incluindo DB, LDAP, Qive e Turnstile.

4. Restrinja permissoes do arquivo:

   ```powershell
   icacls pm2.config.js /inheritance:r /grant:r "$($env:USERNAME):F"
   ```

5. Suba o servico:

   ```powershell
   pm2 start pm2.config.js --only p2p-api-prod
   pm2 start pm2.config.js --only p2p-api-hml
   pm2 save
   pm2 startup
   ```

## Migracao a partir de `.env`

Hoje o backend pode ler `.env`/`.env.hml` em share de rede. Apos popular
`pm2.config.js`:

1. Pare o servico atual: `pm2 delete p2p-api-prod p2p-api-hml` ou encerre os
   processos `node dist/src/main.js` manuais.
2. Suba via PM2 com `pm2.config.js`.
3. Apague `backend/.env`, `backend/.env.hml` e temporarios `backend/.env*`
   do share quando o PM2 estiver validado.
4. Verifique os logs, `/api/health/ready` e um login real.

## Checklist antes do go-live

- [ ] `pm2.config.js` existe somente no servidor e nao esta versionado.
- [ ] `backend/.env`, `backend/.env.hml` e temporarios `.env*` foram removidos
      do share depois da migracao.
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` foram gerados por ambiente e sao
      diferentes entre PROD e HML.
- [ ] `SECRET_ENCRYPTION_KEY` foi gerada e guardada fora do repositorio.
- [ ] Senhas do usuario SQL `integrador`, bind LDAP e Qive foram rotacionadas
      apos a exposicao em arquivos locais.
- [ ] `NODE_ENV=production` em PROD e HML.
- [ ] `SWAGGER_ENABLED=false` em PROD e HML, exceto janela curta de diagnostico.
- [ ] `AUTH_MODE=cookie` e `COOKIE_SAMESITE` compativel com o dominio real.
- [ ] `pm2 save` e `pm2 startup` executados no servidor.
- [ ] `pm2-logrotate` instalado e configurado.
- [ ] Backup full diario, backup de log e restore mensal testado.
- [ ] Health check externo apontando para `/api/health/ready`.

## Migracao dos segredos ja persistidos

`SECRET_ENCRYPTION_KEY` nova nao recriptografa automaticamente valores salvos
em texto puro. Antes de considerar o ambiente fechado:

1. Levante quais linhas de `company_erp_configs.smtpPassword` ainda nao tem
   prefixo `enc:v1:`.
2. Use um script administrativo com `SecretService.encrypt()` para regravar
   esses valores.
3. Teste envio de e-mail por empresa.
4. Depois disso, trate qualquer dump antigo como sensivel e aplique a politica
   de retencao/expurgo da empresa.

## Rotacao periodica

Recomendado a cada 6 meses:

- `JWT_SECRET` / `JWT_REFRESH_SECRET` (invalida sessoes; usuarios relogam).
- `SECRET_ENCRYPTION_KEY` (exige recriptografar `smtpPassword`).
- Senha DB do `integrador`.
- Senha LDAP do bind `P2P Service`.
- Qive API key.

Documente cada rotacao em changelog interno.

## Log rotation

```powershell
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## Backup

Configure SQL Server Agent com Maintenance Plan:

- backup full diario do `P2P_DB`;
- backup de log a cada 15 minutos, se o recovery model permitir;
- copia off-site em share separado ou storage corporativo;
- restore mensal em ambiente isolado, com evidencias do teste.
