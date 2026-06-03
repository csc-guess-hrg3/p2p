# Auditoria Completa — Sistema P2P (Procure-to-Pay)

**Data:** 2026-06-02
**Escopo:** backend (NestJS 11 + Prisma 7 + MSSQL, 172 arquivos), frontend (React/Vite, 137 arquivos), config/ops (pm2.config.js, RUNBOOK, deploy)
**Método:** auditoria multi-agente — 8 dimensões em paralelo (segredos, authn/authz, SQL injection, validação/superfície de API, exposição de dados, qualidade/arquitetura, frontend, deps/build/config), cada achado **verificado adversarialmente** por um revisor independente que leu o código real.
**Resultado:** 55 achados brutos → **48 confirmados**, 7 refutados (falsos positivos).

| Severidade | Qtde |
|---|---|
| 🔴 Crítico | 4 |
| 🟠 Alto | 6 |
| 🟡 Médio | 18 |
| 🔵 Baixo | 19 |
| ⚪ Info | 1 |

> **Nota de segurança:** valores de credenciais foram **redigidos** (`[REDACTED]`) neste relatório. Os valores reais estão nos arquivos citados.

---

## 1. Veredito Geral

O sistema tem arquitetura funcional e boas práticas pontuais (escape de aspas para SQL Server, criptografia AES-256-GCM correta, parâmetros nomeados em parte da camada ERP, segredos de PROD fora do histórico Git). **Mas não está pronto para operar em produção com segurança.** Três blocos de risco se sobrepõem:

1. **Vazamento iminente de credenciais.** A senha do usuário SQL `integrador` (PROD e HML) está hardcoded em 4 scripts que o `.gitignore` **não cobre** — um único `git add .` os commitaria. O histórico Git está limpo hoje, mas a janela é real e os mesmos segredos já vivem em texto puro num share de rede.
2. **Login de PROD duplamente quebrado.** `LDAP_URL/BASE_DN/BIND_DN` no bloco PROD do `pm2.config.js` são placeholders (`ldap://...`) → toda autenticação AD falha (`ENOTFOUND`). E `TURNSTILE_SECRET_KEY='[REDACTED placeholder]'` é truthy mas inválido → CAPTCHA exige e rejeita todo login local/loja. Em PROD, ninguém autentica.
3. **Autorização confunde escopo de empresa com escopo de papel/equipe.** Financeiro sem `RolesGuard`, detalhe de Requisições (`findOne`/`clone`) e Anexos validam só a empresa — qualquer autenticado (até OPERATOR de loja) lê todo o Contas a Pagar, CNPJs de fornecedores e requisições de outras equipes.

Some-se cobertura de testes quase inexistente (5 specs para 167 arquivos), deixando regras de alçada e fluxo de senha sem proteção de regressão.

---

## 2. Causas-raiz recorrentes

1. **Gestão de segredos imatura** — sem cofre nem segregação por ambiente; tudo em `.js`/`.env` texto puro num share; credenciais reutilizadas PROD=HML; `.gitignore` por enumeração frágil em vez de padrão robusto (`_*.js`, `scripts/*.js`).
2. **Escopo de empresa ≠ escopo de papel/equipe** — padrão recorrente `user.companyIds.includes(...)` sem checar perfil/equipe; o filtro existe na listagem mas "vaza" no `findOne`/`clone`/`remove`.
3. **Sanitização manual em vez de parametrização** — segurança contra injeção depende de helpers feitos à mão (`safeStr`, `slice`) aplicados de forma inconsistente; o adapter MSSQL suporta `@P1` mas só parte do código usa. DTOs inline (interfaces TS) neutralizam o `ValidationPipe` global.
4. **Falta de atomicidade transacional** em fluxos multi-escrita (aprovação, submissão, conversão de PC com gravação no ERP).
5. **Documentação operacional divergente** — RUNBOOK (`.env` + node solto) contradiz PRODUCTION-SETUP (PM2); README cita stack inexistente.
6. **Ausência de rede de segurança automatizada** — cobertura residual nos módulos críticos.

---

## 3. Achados Confirmados

### 🔴 CRÍTICOS

**C1 — Senha SQL `integrador` (PROD) hardcoded em script NÃO ignorado pelo Git**
`backend/scripts/erp-query.js:29` — `password: process.env.ERP_PASS || '[REDACTED]'` conectando ao PROD `192.168.10.5`. `git check-ignore` retorna NOT IGNORED; está como `?? untracked`. Um `git add .` vaza a senha do banco PROD no repositório.
→ Remover o fallback (exigir `process.env.ERP_PASS`), cobrir no `.gitignore`, **rotacionar** a senha.

**C2 — Senha SQL `integrador` (PROD) hardcoded SEM fallback em erp-objdef.js**
`backend/scripts/erp-objdef.js:14` — senha PROD totalmente literal, server e database (`GUESS_PRODUCAO`) hardcoded. Não ignorado. → idem C1.

**C3 — Senha SQL HML hardcoded em hml-migrate.js**
`backend/scripts/hml-migrate.js:22` — `192.168.10.34` / senha HML literal. Não ignorado. Como a senha PROD é a mesma sem o sufixo `#`, vazar HML revela PROD. → ler de `.env.hml`, gitignore, rotacionar.

**C4 — LDAP PROD com placeholders no pm2.config.js → login de produção quebrado**
`backend/pm2.config.js:43-45` — `LDAP_URL: 'ldap://...'`, `LDAP_BASE_DN: '...'`, `LDAP_BIND_DN: '...'`. O bloco HML tem os valores reais (`ldap://192.168.10.8:389`, `DC=corp,DC=local`, `CN=P2P Service,...`). Como LDAP é o único login interativo, PROD = outage total de autenticação. → preencher os 3 campos (confirmar com a equipe de AD se PROD usa o mesmo DC do HML).

### 🟠 ALTOS

**A1 — Senha SQL HML hardcoded em _adapterprobe.js** — `backend/_adapterprobe.js:9`. Não ignorado (lacuna do padrão `_*.js`). → apagar probes descartáveis, fechar `.gitignore`, rotacionar. *(arquivo de diagnóstico temporário — candidato a remoção imediata)*

**A2 — LDAP_URL PROD placeholder** *(mesma raiz de C4, ótica authz)* — `pm2.config.js:43`. → preencher valores reais.

**A3 — TURNSTILE_SECRET_KEY inválido bloqueia login local/loja em PROD** — `pm2.config.js:61`. `'[REDACTED placeholder]'` é truthy → `TurnstileService` trata CAPTCHA como ativo e valida contra a Cloudflare com secret inválido → `UnauthorizedException` em todo login local/loja (LDAP não é afetado). → definir a chave real **ou** deixar vazia (`''`) para desativar; tratar placeholders como desativado no service.

**A4 — SQL injection via filtros `from`/`to` em Pedidos Legados** — `backend/src/legacy-orders/legacy-orders.service.ts:147-152`. `from`/`to` chegam crus do controller (sem DTO) e são interpolados com só `.slice(0,10)` num `$queryRawUnsafe`. Payload `' OR 1=1--` (9 chars) sobrevive ao slice e quebra o literal. Injeção autenticada (ADMIN) contra o ERP Linx. Todos os outros filtros do método são sanitizados — é um lapso. → reusar `safeDate()` (regex `^\d{4}-\d{2}-\d{2}$`) ou parâmetros `@P1`.

**A5 — Financeiro exposto a qualquer autenticado (sem RolesGuard)** — `backend/src/financial/financial.controller.ts:22-27`. Só `JwtAuthGuard`; sem RolesGuard global. Qualquer OPERATOR com acesso à empresa lê Contas a Pagar, IAD, DDA, provisões e base de fornecedores (CNPJ/CPF). A task #9 só foi aplicada no **frontend** (`nav.ts` — cosmético). → `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserProfile.ADMIN)` (enum não tem `FINANCE`).

**A6 — IDOR de equipe em Requisições (findOne/clone)** — `backend/src/requisitions/requisitions.service.ts:540-577` (e clone ~1276-1286). `findAll` filtra por `teamId: user.teamId`; `findOne`/`clone` só checam `companyIds`. Um não-admin lê/clona requisição de outra equipe (justificativa, itens, valores, fornecedor, fluxo de aprovação). `resubmit` usa `findOne` como gate → propaga o gap. → aplicar o mesmo predicado de equipe em `findOne`/`clone`; centralizar a regra de visibilidade.

### 🟡 MÉDIOS

- **M1** — Todos os segredos PROD+HML concentrados num único `pm2.config.js`; LDAP bind e Qive **idênticos PROD=HML** (`pm2.config.js:34-99`). → cofre + segregar por ambiente + hook pré-commit.
- **M2** — Senha HML em `backend/.env.tmp-hml` (texto puro) — ignorado, mas no share SMB legível. → apagar do share após migrar p/ PM2.
- **M3** — Rotação das credenciais já expostas pendente (checklist `[ ]` no PRODUCTION-SETUP.md). → rotacionar `integrador` (PROD+HML), bind LDAP, Qive; idealmente JWT/encryption key.
- **M4** — Refresh token (7d) devolvido no **body** de login/refresh — `auth.controller.ts:183,218,275,304,334`. Anula benefício do cookie httpOnly. (task #60). → retornar só `{ ok: true }` em modo cookie.
- **M5** — Usuário JIT `PENDING_SETUP` recebe token válido — `jwt.strategy.ts:49` só barra `INACTIVE`. → bloquear `PENDING_SETUP` até ativação do admin.
- **M6** — `FinancialController` sem `@Roles` *(authz, mesma raiz de A5)* — `financial.controller.ts:22-26`.
- **M7** — Logout não revoga refresh token — `auth.controller.ts:338-345` só `clearCookie`. Token capturado vale 7d após logout. → `tokenVersion`/jti ou denylist.
- **M8** — Segredos texto puro reutilizados PROD/HML *(authn, mesma raiz de M1)* — `pm2.config.js:36-49`.
- **M9** — Filtro de data legados sem validação de formato *(mesma raiz de A4, ótica injection)* — `legacy-orders.service.ts:147-152`.
- **M10** — Token de senha **raw** logado quando SMTP ausente — `local-auth.service.ts:251-256`. SMTP não está definido no pm2.config.js → caminho **ativo** hoje; token de account-takeover (24h) vai pro `logs/prod.out.log`. → não logar o token; falhar se SMTP ausente em PROD.
- **M11** — Regra "apenas autor edita anexo" não aplicada — `attachments.service.ts:254-279`. `remove`/`upload` só checam empresa. Qualquer colega apaga/substitui anexos (cotações, contratos, canhotos). Regra real = dono do documento OU ADMIN. → exigir `uploadedById === user.id || ADMIN`.
- **M12** — `decide()` de aprovação **não atômico** — `approvals.service.ts:316-398`. Update do step + status do documento + nível fora de `$transaction`; crash na janela trava o documento. → envolver em `$transaction` (Linx best-effort fora).
- **M13** — `submit()` de requisição **não atômico** — `requisitions.service.ts:1040-1064`. `startApproval` (createMany) + `requisition.update` separados; falha → steps órfãos e, em re-submit sem reset, cadeia **duplicada**. → `$transaction` + `resetForRequisition` no início.
- **M14** — Conversão Requisição→PC: rollback não desfaz pedido já gravado no Linx — `purchase-order-converter.service.ts:532-551`. Em convert multi-bucket, falha no 2º PC faz soft-delete dos anteriores no P2P mas deixa **pedido órfão em COMPRAS** (sem compensação no ERP). → criar todos os PCs antes de gravar, ou compensar/logar órfãos para reconciliação.
- **M15** — Cobertura de testes quase inexistente — 5 specs / 167 arquivos; sem teste em auth, financial, requisitions, converter, quotations. → priorizar specs de alçada e fluxo de senha (usar `createPrismaMock`).
- **M16** — Ausência de CSP — `frontend/index.html`; helmet desativa CSP em PROD. → CSP via header no servidor que serve o build (`default-src 'self'`, `frame-ancestors 'none'`, sandbox p/ preview de anexo).
- **M17** — `deleteOutDir: true` torna build-sobre-dist-vivo arriscado — `nest-cli.json:4-7`. RUNBOOK manda buildar antes de parar o processo → janela de `MODULE_NOT_FOUND`. *(exatamente o que aconteceu no incidente recente.)* → parar antes de buildar, ou build em staging + swap atômico.
- **M18** — Frontend não registrado no PM2 — `pm2.config.js:14-109`; RUNBOOK só descreve `vite dev`. Entrega do frontend de PROD indefinida/não gerenciada. → documentar/versionar quem serve `frontend/dist` (IIS/nginx) ou registrar app PM2.

### 🔵 BAIXOS

- **B1** — Cookies `Secure=true` em HML servido por HTTP (cookies não persistem) — `auth.controller.ts:110` (`secure` atrelado a `NODE_ENV`). → `COOKIE_SECURE` dedicado.
- **B2** — Turnstile fail-open em erro de rede — `turnstile.service.ts:88-97`. (mitigado por throttle+lockout). → avaliar fail-closed em endpoints sensíveis.
- **B3** — WHERE dinâmico financeiro só escapa aspas (sem parâmetros) — `financial.service.ts` (vários). Sem injeção explorável hoje; robustez. → migrar p/ `@P1`/`Prisma.sql`.
- **B4** — Wildcards `% _ [` de LIKE não escapados — `financial.service.ts`. Injeção de padrão (filtro/DoS leve). → escapar + `ESCAPE` (padrão já existe em `findExistingSvByObs`).
- **B5** — IN-list de pedidos legados concatena valores do banco sem escape (injeção 2ª ordem) — `legacy-orders.service.ts`.
- **B6** — `@Body()` com interface inline → ValidationPipe não valida — `fiscal-documents.controller.ts`. → DTOs reais (classes).
- **B7** — `@Body()` inline em requisitions/quotations — `requisitions.controller.ts`. → DTOs reais.
- **B8** — `@Query()` como `Record<string,string>` ignora whitelist — `financial.controller.ts`.
- **B9** — `UsersService.findAll/findOne` retornam `passwordHash` — `users.service.ts`. → `select` explícito.
- **B10** — `SecretService` em passthrough silencioso grava "segredo" em texto plano se chave fraca/ausente — `secret.service.ts`. → falhar em vez de degradar.
- **B11** — `setPassword`: check-then-act do token sem condição de unicidade no UPDATE (race) — `local-auth.service.ts`.
- **B12** — Fire-and-forget `syncAll()` sem `.catch` (unhandled rejection) — `purchase-orders.controller.ts`.
- **B13** — RUNBOOK (`.env` + node solto) divergente do PRODUCTION-SETUP (PM2) — `RUNBOOK.md`. → fonte única.
- **B14** — Guia `COOKIE_SAMESITE` no RUNBOOK ('none') contradiz pm2.config.js ('lax') — `RUNBOOK.md`.
- **B15** — README desatualizado (cita React 18, BullMQ, Memurai/Redis inexistentes) — `README.md`.
- **B16** — Dependência `ioredis` declarada mas nunca importada (órfã) — `backend/package.json`.
- **B17** — `postinstall` monkey-patcha `node_modules/@nestjs/common` — frágil/silencioso em deploy — `backend/package.json`.
- **B18** — Turnstile desativado por falta de chave em PROD/HML → CAPTCHA inativo — `pm2.config.js`. *(interage com A3.)*
- **B19** — `QIVE_SANDBOX` ausente no pm2.config.js → depende de default implícito 'PROD' — `pm2.config.js`.

### ⚪ INFO

- **I1** — TODO documentado em `quotations.service.ts` referenciando padrão pendente (rastreabilidade; referência cruzada válida).

---

## 4. Plano de Ação Priorizado

### P0 — AGORA (bloqueia deploy/go-live)
1. **Remover credenciais hardcoded** dos 4 scripts (`erp-query.js`, `erp-objdef.js`, `hml-migrate.js`, `_adapterprobe.js`) → ler de env. **Endurecer `.gitignore`** (`_*.js`, `scripts/*.js`, `*.tmp-*`) e validar com `git check-ignore`.
2. **Rotacionar** senha SQL `integrador` (PROD+HML), bind LDAP e chaves Qive.
3. **Preencher LDAP_URL/BASE_DN/BIND_DN reais** no bloco PROD do `pm2.config.js`.
4. **Corrigir TURNSTILE_SECRET_KEY em PROD** (chave real ou vazia).
5. **`RolesGuard`/`@Roles(ADMIN)` no FinancialController** (efetivar a task #9 no backend).
6. **Validar formato de data em Pedidos Legados** (reusar `safeDate()` / parâmetros).

### P1 — Em seguida (antes de ampliar uso)
1. Fechar **IDOR de equipe** em `findOne`/`clone` de Requisições; regra "autor/ADMIN" em Anexos.
2. **Refresh token só em cookie** (task #60) + **revogação no logout**.
3. **Bloquear PENDING_SETUP** na `JwtStrategy.validate`.
4. **Não logar token de senha raw**; falhar se SMTP ausente em PROD.
5. **`$transaction`** em `decide()`, `submit()` e conversão Requisição→PC (com compensação no Linx).
6. **Segregar segredos por ambiente**; planejar migração para cofre.
7. **Reconciliar RUNBOOK × PRODUCTION-SETUP**; definir quem serve o frontend de PROD.

### P2 — Melhorias (defesa em profundidade / dívida técnica)
1. **DTOs reais** (classes) p/ todos os `@Body()`/`@Query()` inline.
2. **Parametrizar a camada financeira** (`@P1`) + escapar wildcards de LIKE.
3. **CSP** restritiva + sandbox p/ preview de anexos.
4. **Endurecer SecretService** (falhar em vez de passthrough).
5. **Flags de ambiente robustas** (`COOKIE_SECURE` por esquema, `COOKIE_SAMESITE` consistente, `QIVE_SANDBOX` explícito).
6. **`select` explícito** em UsersService (nunca serializar `passwordHash`/`cpf`).
7. **Testes** dos módulos críticos (auth, financial, requisitions, converter).
8. **Limpar dívida**: `deleteOutDir`, `postinstall` patch, `ioredis` órfã, README; race do `setPassword`, `.catch` no `triggerBackSync`.

---

## 5. Falsos Positivos (refutados na verificação)

1. "Senha LDAP real no `.env.example`" — o arquivo só tem placeholders; a senha real está em `.env.tmp-hml` (ignorado).
2. "TODO createSupplier não implementado" — já existe `criarFornecedorDeQuotation`; comentário obsoleto.
3. "SVG anexo → XSS armazenado" — `image/svg+xml` não está na whitelist de upload.
4. "Tokens no body anulam o cookie httpOnly" (frontend) — em modo cookie o body não é persistido.
5. "Modo bearer guarda JWT em localStorage" — bearer é opt-in, desativado por padrão e proibido pelo checklist de PROD.
6. "Preview PDF via `<object>` sem sandbox" — same-origin sem acesso a DOM/cookies + `object-src 'none'` + `Content-Disposition: attachment`.
7. "Deploy sem lockfile (versões sobem sozinhas)" — existem `package-lock.json` nos dois projetos; `npm install` respeita o lockfile.

---

*Auditoria gerada por workflow multi-agente (64 agentes, verificação adversarial por achado).*
