# Relatório de Auditoria de Segurança — Go-Live Público (Projeto P2P)

**Data:** 2026-06-08
**Escopo:** Backend NestJS 11 + Prisma 7 e Frontend React 19 + Vite, destinados a exposição na internet pública atrás de Cloudflare.
**Método:** auditoria multi-agente (44 agentes) por dimensão (authz/IDOR, secrets, exposição/headers/CSP, hardening de auth/rate-limit/cookies, injeção SQL/cross-DB, cliente) + verificação adversarial de cada achado.

> Gerado por auditoria automatizada assistida. Achados verificados contra o código real.

---

## Sumário Executivo

| Severidade | Qtde |
|---|---|
| **P0 — Crítico / bloqueia go-live** | 3 |
| **P1 — Sério / bloqueia go-live** | 6 |
| **P2 — Relevante (pós-go-live)** | 12 |
| **P3 — Melhoria / hardening** | 13 |

### Veredito: **NÃO está pronto para a internet pública.**

3 P0 + 6 P1 bloqueiam o go-live.

- **P0-1** — Vazamento cross-tenant trivial de dados-mestre do ERP (incl. dados bancários/PIX de fornecedores) por troca de path param.
- **P0-2** — Segredos reais de PRODUÇÃO (JWT, chave de criptografia, senha do banco, bind LDAP, Qive) em texto plano numa share SMB corporativa.
- **P0-3** — Login LDAP sem lockout nem CAPTCHA → brute-force/DoS contra o Active Directory corporativo.

---

## P0 — Crítico (bloqueiam o go-live)

### P0-1. IntegrationController não valida pertencimento à empresa — vazamento cross-tenant
- **Arquivo:** `backend/src/integration/integration.controller.ts` + `integration.service.ts` (`assertCompany`)
- **Risco:** `@Controller('integration/:company')` só com `JwtAuthGuard`; handlers recebem só `@Param('company')`, sem `@CurrentUser`. `assertCompany()` valida que o param é `'GUESS'`/`'HRG3'`, mas **nunca** checa `user.companyIds`. Qualquer usuário autenticado lê o cadastro-mestre do ERP da outra empresa trocando o path param (`GET /integration/HRG3/suppliers`): razão social, CNPJ, e-mail, telefone, **dados bancários (banco, agência, conta, PIX)**, plano de contas, itens, filiais com CNPJ, centros de custo, condições de pagamento, transportadoras.
- **Correção:** Injetar `@CurrentUser` em todos os handlers; resolver `code`→`Company.id` e exigir `user.companyIds.includes(company.id)` (espelhar `financial.service.resolveCompany`).

### P0-2. Segredos reais de PRODUÇÃO em texto plano na share de rede
- **Arquivo:** `pm2.config.js` (= `\\192.168.10.21\Integrações\p2p\backend\pm2.config.js`) e `.env.tmp-hml`
- **Risco:** `pm2.config.js` tem `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SECRET_ENCRYPTION_KEY`, `LDAP_BIND_PASSWORD`, `QIVE_API_ID/KEY` (PROD e HML) em claro. `.env.tmp-hml` repete senhas reais. Qualquer um com leitura na share obtém tudo. JWT_SECRET vazado = forjar token de ADMIN; SECRET_ENCRYPTION_KEY = quebrar segredos at-rest; DB_PASSWORD = acesso direto ao SQL Server e ao ERP Linx.
- **Correção:** Remover segredos da share; `pm2.config.js` só em disco local com ACL restrita; apagar `.env.tmp-hml`; **ROTACIONAR imediatamente** todos os segredos expostos (DB, JWT PROD+HML, SECRET_ENCRYPTION_KEY, LDAP bind, Qive).

### P0-3. Login LDAP sem lockout nem Turnstile — brute-force/DoS contra o AD
- **Arquivo:** `backend/src/auth/auth.controller.ts` (`/auth/login`)
- **Risco:** `/auth/login` (LDAP) não chama `turnstile.assertValid()` nem usa lockout (que é keyed por `User.id` local, inútil pra bind LDAP puro). Defesa única é `@Throttle` por IP, contornável (agravado pelo P1-4). Permite DoS dos funcionários (lockout do AD) e brute-force de credenciais corporativas.
- **Correção:** Turnstile + lockout por-conta também no caminho LDAP (chaveado por username); reduzir `@Throttle` do login (5/min) e adicionar throttle por-username.

---

## P1 — Sério (bloqueiam o go-live)

### P1-1. PurchaseOrders por `:id` só checam companyId — IDOR cross-equipe destrutivo
- **Arquivo:** `purchase-orders.service.ts` (`findOne`), `purchase-order-history/canceller/editor.service.ts`
- **Risco:** `findAll` filtra não-admin por `requisition.teamId`, mas operações por `:id` só checam companyId. Um OPERATOR/MANAGER vê detalhe/histórico e **muta** (cancelar, cancelar itens, editar) pedidos de outras equipes, e vê dados financeiros do Linx via `/erp-status` e `/financeiro-erp`.
- **Correção:** Aplicar o filtro de equipe às operações por `:id` (helper `assertSameTeam` reutilizado).

### P1-2. Anexos: list/download/remove só checam companyId — IDOR cross-equipe de arquivos
- **Arquivo:** `attachments.service.ts`
- **Risco:** Não derivam teamId — não-admin lista e **baixa** anexos (cotações, contratos, NFs, fotos) de qualquer equipe via `GET /attachments/:kind/:parentId` e `/:id/download`.
- **Correção:** Derivar teamId do pai e exigir `teamId === user.teamId` para não-admin em list/download/remove.

### P1-3. smtpPassword gravado em texto plano (SecretService.encrypt nunca chamado)
- **Arquivo:** `secret.service.ts`, `companies.service.ts`
- **Risco:** `.encrypt(` não é chamado em lugar nenhum. `upsertErpConfig` grava `smtpPassword` direto. Senhas SMTP por empresa ficam em claro no banco; `decrypt()` faz passthrough. Proteção ilusória.
- **Correção:** Injetar `SecretService` e cifrar antes de gravar; migrar valores legados.

### P1-4. Sem `trust proxy` — rate limiting colapsa atrás do Cloudflare
- **Arquivo:** `main.ts`, `app.module.ts`
- **Risco:** Sem `app.set('trust proxy', ...)`, `req.ip` resolve pro peer do proxy → todo o tráfego compartilha a mesma chave de throttle, colapsando os limites (login e global). Enfraquece brute-force e permite DoS acidental. `clientIp()` lê XFF cego.
- **Correção:** `set('trust proxy', <hops>)`; derivar a chave do throttler de `CF-Connecting-IP`; restringir XFF às faixas Cloudflare (firewall só aceita ranges CF).

### P1-5. Turnstile desativado silenciosamente sem `TURNSTILE_SECRET_KEY`
- **Arquivo:** `turnstile.service.ts`
- **Risco:** Sem a key, só loga warn e pula TODA validação anti-bot. Como a env é fácil de esquecer, uma omissão desliga o CAPTCHA em PROD sem erro.
- **Correção:** `getOrThrow('TURNSTILE_SECRET_KEY')` em `NODE_ENV=production` (fail-fast).

### P1-6. Frontend de produção servido pelo Vite dev server (5173)
- **Arquivo:** `RUNBOOK.md`, `frontend/package.json`, `vite.config.ts`
- **Risco:** Runtime do front é o dev server (HMR, source maps, transform middleware — alvo de CVEs). Nada serve o `dist/`. Bind atual é loopback (por isso P1).
- **Correção:** Servir só o `dist/` por servidor estático (IIS/nginx/Caddy ou ServeStatic do Nest); Cloudflare aponta pra ele, nunca pra 5173.

---

## P2 — Relevante (primeira janela pós-go-live)

- **P2-1.** Quotations `list` sem teamId — IDOR de leitura cross-equipe (escrita já protegida). `quotations.service.ts`
- **P2-2.** `branch-rateios`/`cc-rateios` `?scope=all` permite não-admin furar filtro de equipe (sem checar ADMIN). `integration.controller.ts`
- **P2-3.** JWT_SECRET/JWT_REFRESH_SECRET sem validação de força no boot. `auth.module.ts`
- **P2-4.** SECRET_ENCRYPTION_KEY ausente → fallback silencioso pra passthrough. `secret.service.ts`
- **P2-5.** Refresh token (7d) não persistido/revogável; logout não invalida; sem rotação. `auth.service.ts`
- **P2-6.** Sem CSRF explícito em rotas cookie-auth (depende de SameSite; RUNBOOK sugere `none`). `auth.controller.ts`
- **P2-7.** Throttle generoso e só por-IP nos logins; refresh 20/min. `auth.controller.ts`
- **P2-8.** MIME do upload validado só pelo Content-Type do cliente (sem magic-bytes). `attachments.service.ts`
- **P2-9.** Param `kind` do upload sem enum, interpolado no path (traversal latente). `attachments.service.ts`
- **P2-10.** Health público vaza mensagem de erro interna do banco. `health/prisma.health.ts`
- **P2-11.** Turnstile fail-open: falha de rede com a Cloudflare libera login. `turnstile.service.ts`
- **P2-12.** Modo bearer persiste JWT+refresh em localStorage (exposto a XSS). `frontend/src/lib/api.ts`

## P3 — Hardening
- P3-1 fiscal-documents `sync/status` sem user/empresa (leak de contagem) · P3-2 FundRequests/Receiving sem escopo de equipe (decisão de produto) · P3-3 DN do AD em comentário versionado · P3-4 CSP `undefined` frágil (funciona, mas explicitar) · P3-5 rota raiz `Hello World!` (fingerprint) · P3-6 cookie secure/sameSite atrelado a env · P3-7 access token 8h não revogável (mitigado) · P3-8 upload sem rate-limit (`@SkipThrottle` na classe) · P3-9 filtros financeiros como `Record<string,string>` cru (sem SQLi — sanitizado) · P3-10 TurnstileWidget `onVerify('')` (sem bypass real) · P3-11 `withCredentials` global no axios (risco de regressão) · P3-12 comentários 'modo demo' mortos · P3-13 (confirmação) `safeDbName` adequado.

---

## Plano de ação mínimo para o go-live

1. **P0-2 primeiro (você/TI):** remover segredos da share e **rotacionar tudo** — qualquer correção de código é inútil enquanto os segredos atuais estiverem comprometidos.
2. **P0-1 (código):** validar `user.companyIds` em todo o IntegrationController.
3. **P0-3 + P1-4 + P1-5 (código):** Turnstile + lockout no LDAP; `trust proxy`; `getOrThrow` do Turnstile em PROD.
4. **P1-1 / P1-2 / P2-1 / P2-2 (código):** filtro de equipe nas operações por `:id` (PO, anexos, cotações, rateios `scope=all`).
5. **P1-3 (código):** cifrar `smtpPassword` + migrar legado.
6. **P1-6 (infra):** servir `dist/` estático; remover Vite dev server da produção.
