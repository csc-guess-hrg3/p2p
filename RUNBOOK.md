# P2P — Runbook de Deploy e Operação

> Ambientes hospedados no servidor Windows da HRG3 (mesma máquina que o ERP Linx).
> Drive `I:\` mapeia o diretório do projeto. PROD escuta `:3000`, HML `:3001`.

---

## Sumário

1. Topologia
2. Deploy de uma nova versão (PROD)
3. Deploy de HML
4. Migrations + ERP views (PROD e HML)
5. Restart de emergência
6. Variáveis de ambiente
7. Health checks e troubleshooting
8. Acompanhamento de jobs (cron) e fila de e-mails
9. Rollback
10. Smoke test pós-deploy

---

## 1. Topologia

| Componente | Porta | Comando | Logs                   |
|-----------|-------|---------|------------------------|
| Backend PROD | 3000 | `node dist/src/main.js`                       | `I:\p2p\backend\logs\prod.log` (redirecionar em prod) |
| Backend HML  | 3001 | `node --env-file=.env.hml dist/src/main.js`   | `I:\p2p\backend\logs\hml.log`                          |
| Frontend (Vite dev na máquina) | 5173 | `npm run dev` em `I:\p2p\frontend`             | terminal interativo                                     |
| SQL Server | 1433 | serviço Windows `MSSQLSERVER`                  | log do SQL                                              |
| AD (LDAP)  | 389  | servidor externo (`ldap://192.168.10.8:389`)   | —                                                       |

Ambos os backends usam o **mesmo binário compilado** (`dist/src/main.js`); o que muda é o `.env` carregado. PROD usa `.env`, HML usa `.env.hml`.

---

## 2. Deploy de uma nova versão (PROD)

Pré-requisitos: você está na máquina servidora, no diretório `I:\p2p`, com acesso ao Git remoto.

```powershell
# 1. Atualiza o código
git pull --ff-only

# 2. Reaplica views ERP só se erp-views.sql mudou
$viewsChanged = git diff --name-only HEAD@{1} HEAD -- backend/prisma/erp-views.sql
if ($viewsChanged) {
  cd I:\p2p\backend
  node apply-erp-views.js
}

# 3. Aplica migrations Prisma (apenas as não aplicadas)
cd I:\p2p\backend
npx prisma migrate deploy

# 4. Regenera o client Prisma (caso schema mudou)
npx prisma generate

# 5. Build do backend
npm install --no-save
npm run build

# 6. Build do frontend
cd I:\p2p\frontend
npm install --no-save
npm run build

# 7. Restart dos backends (PROD + HML)
# PIDs anteriores: encontre com:
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3000,3001
Stop-Process -Id <PID-PROD> -Force
Stop-Process -Id <PID-HML>  -Force

# 8. Reinicia em background
cd I:\p2p\backend
Start-Process -WindowStyle Hidden -FilePath node `
  -ArgumentList 'dist/src/main.js' `
  -RedirectStandardOutput 'logs\prod.log' -RedirectStandardError 'logs\prod.err'
Start-Process -WindowStyle Hidden -FilePath node `
  -ArgumentList '--env-file=.env.hml','dist/src/main.js' `
  -RedirectStandardOutput 'logs\hml.log' -RedirectStandardError 'logs\hml.err'
```

Smoke test obrigatório após o restart — ver §10.

> ⚠️ **Nunca** rode `npm ci` no Windows com lockfile gerado em outra máquina; ele falha em pacotes opcionais por plataforma. Use sempre `npm install --no-save`.

---

## 3. Deploy de HML

Mesmo fluxo de PROD, mas o `apply-erp-views.js` lê o `.env` (PROD); para HML use o script equivalente que monta a conexão a partir do `.env.hml` ou execute manualmente o SQL contra `HML_P2P_DB`.

Para uma versão de teste, deploye **apenas HML** (commit em branch separada com `git checkout`), valide com a equipe, e só depois merge em `main` + deploy PROD.

---

## 4. Migrations + ERP views

**Migrations Prisma** são incrementais. Sempre rode `npx prisma migrate deploy` (nunca `migrate dev` em PROD) — só aplica o que ainda não existe na tabela `_prisma_migrations`.

**ERP views** (`backend/prisma/erp-views.sql`) usam `CREATE OR ALTER VIEW`: rodar `node apply-erp-views.js` recria todas. Não há histórico — versão em arquivo é a fonte de verdade.

Se o schema do Linx mudar (raro), a equipe DBA precisa avisar antes do deploy do P2P para que possamos ajustar as views.

---

## 5. Restart de emergência (sem deploy)

Sem mudança de código, só reciclar processos:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3000,3001 | `
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
cd I:\p2p\backend
Start-Process -WindowStyle Hidden -FilePath node -ArgumentList 'dist/src/main.js'
Start-Process -WindowStyle Hidden -FilePath node -ArgumentList '--env-file=.env.hml','dist/src/main.js'
```

---

## 6. Variáveis de ambiente

`backend/.env` (PROD) e `backend/.env.hml` (HML) ficam **fora do Git**. Modelo em `backend/.env.example`. Chaves obrigatórias:

| Variável | Para que serve |
|---------|---------------|
| `DATABASE_URL` | Connection string SQL Server do banco P2P |
| `ERP_GUESS_DB` | Nome do database GUESS no mesmo SQL Server (cross-DB views) |
| `ERP_HRG3_DB`  | Nome do database HRG3 (antiga "Hering") |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥ 64 chars cada |
| `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD` | AD para login |
| `SECRET_ENCRYPTION_KEY` | ≥ 32 chars — usada para criptografar `smtpPassword` em `company_erp_configs` |
| `COOKIE_SAMESITE` | `lax` em DEV, `none` em PROD HTTPS |

> SMTP por empresa fica em `company_erp_configs` (não em env). Editável na tela de admin.

---

## 7. Health checks e troubleshooting

### Healthcheck rápido

```powershell
curl http://localhost:3000/companies  # PROD — exige Bearer Token; deve retornar 401 sem
curl http://localhost:3001/companies  # HML
```

### Backend não sobe

1. Verifique se a porta já está ocupada: `Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3000,3001`.
2. Cheque `logs\prod.err` (ou redirecione stderr).
3. Erros comuns:
   - `Cannot find module` → faltou `npm install` ou `prisma generate`.
   - `Connection refused (LDAP)` → AD inacessível. Verifique conectividade UDP/TCP 389.
   - `Cannot open database "DB_HRG3"` → checar `ERP_HRG3_DB` no .env e permissão do usuário SQL.

### Integração Linx falhou

Toda gravação no Linx loga em `integration_logs`. Use a query:

```sql
SELECT TOP 50 createdAt, jobType, status, errorDetails
FROM dbo.integration_logs
ORDER BY createdAt DESC;
```

Se o erro for `transaction ended in trigger`, é triggers padrão do Linx (`LXI_COMPRAS`) — o INSERT já está fora de `$transaction` do Prisma (decisão arquitetural em DECISIONS.md), reverifique.

---

## 8. Cron jobs e e-mail

Cron jobs internos (NestJS `@Cron`):

| Job | Horário | Onde |
|-----|---------|------|
| Recorrência de requisições | 07:00 diário | `requisition-recurrence.service.ts` |
| Verificação de reagendamentos PA | 30 min | `product-orders-pa.service.ts` |

Falhas ficam em log do backend (não há fila Redis/BullMQ ainda; INF-01 do PRD técnico fica como Fase 2).

Notificações por e-mail são síncronas (best-effort). Falhas registram warning e não bloqueiam a operação. Para inspecionar:

```sql
SELECT TOP 50 createdAt, type, title, userId, readAt FROM dbo.notifications
ORDER BY createdAt DESC;
```

---

## 9. Rollback

```powershell
cd I:\p2p
git log --oneline -10
git checkout <commit-anterior>
# segue passos 4..8 da §2
```

Migrations Prisma **não têm down automático** — se a regressão envolver schema, é necessário rodar SQL reverso manual. Por isso, evite reverter releases com migration nova; prefira hotfix forward.

---

## 10. Smoke test pós-deploy

Manual (≈ 3 min, faz no navegador em `https://p2p.hrg3.com.br`):

- [ ] Login com AD
- [ ] Trocar empresa (GUESS ↔ HRG3) — listas devem refletir
- [ ] Abrir lista de Pedidos de Compra — coluna **Nº Linx** preenchida nos INTEGRATED
- [ ] Abrir 1 PC integrado — timeline "Histórico" deve listar os steps
- [ ] Abrir lista de Requisições — abrir uma APPROVED — timeline aparece
- [ ] Topbar: sino mostra contador correto, abrir e marcar todas
- [ ] /admin → Sincronizar com AD → "Buscar usuários do AD" abre e lista equipes
- [ ] /admin → Equipes → editar uma cadeia de aprovação (drag e drop)

Automatizado (próxima entrega): Playwright em `frontend/tests/e2e/`.

---

_Última atualização: 2026-05-22._
