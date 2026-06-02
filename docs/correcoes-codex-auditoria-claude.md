# Correcoes Codex sobre a auditoria Claude

Data: 2026-06-02

Base: auditoria tecnica do Claude em `docs/auditoria-tecnica-p2p.md` e validacao Codex em `docs/auditoria-tecnica-p2p-validacao-codex.md`.

Este documento consolida os pontos da auditoria que foram corrigidos ou mitigados por mim nesta rodada. Alguns itens seguem como mitigacao/documentacao porque dependem de infra, DBA ou rotacao de credenciais fora do codigo.

## Resumo executivo

| Area | Status |
|---|---|
| Build/runtime | Corrigido o travamento do Nest e builds backend/frontend validados. |
| Seguranca backend | `JwtAuthGuard` global, `@Public()`, sanitizacao de erros ERP e allow-list de banco reforcada. |
| Seguranca/config | `.env.example`, `.gitignore`, PM2 example e setup de producao endurecidos. |
| Frontend/UX | `confirm()` nativo removido, redirect com cleanup, devtools fora de PROD e code splitting aplicado. |
| Integracoes | Timeout nos fetches Qive e mensagens de erro Linx menos expostas. |

## Pontos corrigidos

### Build e runtime

| Auditoria | Correcao feita | Arquivos principais | Validacao |
|---|---|---|---|
| Backend nao validado/build instavel | Backend passou a buildar com Nest 11 fixado e patch idempotente para `@nestjs/common` no Node atual. | `backend/package.json`, `backend/package-lock.json`, `backend/scripts/patch-nest-common.js` | `npm run build` backend passou. |
| Frontend com erro de build | Removido import nao usado que quebrava `noUnusedLocals`. | `frontend/src/pages/requisitions/SupplierPicker.tsx` | `npm run build` frontend passou. |

### Seguranca e hardening

| Auditoria | Correcao feita | Arquivos principais | Validacao |
|---|---|---|---|
| C1/C2/C3/C12 - segredos e envs inseguros | `.env*` locais continuam fora do Git, `.env.example` foi refeito sem segredo real e PM2 example passou a exigir secrets fortes e `NODE_ENV=production`. | `.gitignore`, `backend/.env.example`, `backend/pm2.config.example.js`, `backend/PRODUCTION-SETUP.md` | Revisao documental/config. Rotacao real ainda depende de infra. |
| C10/C11/A24 - deploy, backup e logrotate sem runbook claro | Criado/reescrito guia de producao com PM2, health checks, backup, restore, logrotate e checklist operacional. | `backend/PRODUCTION-SETUP.md`, `backend/pm2.config.example.js` | Mitigacao documental. Execucao real em PROD ainda precisa confirmacao. |
| C6 - SQL injection por `erpDbName` | Reforcada a allow-list central `safeDbName` e fechado o helper residual de pedidos legados. Tambem houve reforcos em servicos de ERP/back-sync ja alterados no working tree. | `backend/src/common/erp/safe-db-name.ts`, `backend/src/legacy-orders/legacy-orders.service.ts`, `backend/src/integration/linx-erp.service.ts`, `backend/src/integration/erp-back-sync.service.ts` | `npm run build` backend passou. |
| A7 - `lastErpError`/erros Linx vazando SQL | Criado sanitizer central de erro ERP. Aplicado em envio de PC, envio de SV, criacao de fornecedor, back-sync e conversao de PC. | `backend/src/common/erp/erp-error-sanitizer.ts`, `backend/src/integration/linx-erp.service.ts`, `backend/src/integration/erp-back-sync.service.ts`, `backend/src/purchase-orders/purchase-order-converter.service.ts` | `npm run build` backend passou. |
| A9 - LIKE sem escapar `%/_` no recovery de SV | Escape de metacaracteres de `LIKE` em `findExistingSvByObs`, mantendo wildcard apenas no sufixo controlado. | `backend/src/integration/linx-erp.service.ts` | `npm run build` backend passou. |
| A10 - ausencia de `JwtAuthGuard` global | `JwtAuthGuard` virou `APP_GUARD` global e ganhou opt-out explicito via `@Public()`. Auth publico, health e raiz foram marcados; `/auth/me` segue protegido. | `backend/src/auth/decorators/public.decorator.ts`, `backend/src/auth/guards/jwt-auth.guard.ts`, `backend/src/app.module.ts`, `backend/src/auth/auth.controller.ts`, `backend/src/health/health.controller.ts`, `backend/src/app.controller.ts` | Smoke: `health/live` e `password-policy` retornaram 200 sem token; `/auth/me` retornou 401 sem token em 3000 e 3001. |
| A19 - fetch Qive sem timeout | Adicionado `AbortSignal.timeout(30000)` aos fetches da Qive. | `backend/src/integration/qive-client.service.ts` | `npm run build` backend passou. |
| A26 - Swagger exposto em PROD | Mantido/confirmado gating por `NODE_ENV !== production` ou `SWAGGER_ENABLED=true`; PM2 example deixa `SWAGGER_ENABLED=false`. | `backend/src/main.ts`, `backend/pm2.config.example.js` | Revisao de config. |

### Frontend e UX

| Auditoria | Correcao feita | Arquivos principais | Validacao |
|---|---|---|---|
| A16 - `confirm()` nativo em acoes destrutivas/aprovacao PA | Substituido por `ConfirmDialog` em anexos, PA e paginas de admin. | `frontend/src/components/AttachmentsSection.tsx`, `frontend/src/pages/product-orders-pa/PaOrderDetailPage.tsx`, `frontend/src/pages/admin/DelegationsPage.tsx`, `frontend/src/pages/admin/PositionsPage.tsx`, `frontend/src/pages/admin/TeamsPage.tsx`, `frontend/src/pages/admin/UsersPage.tsx` | `rg` nao encontrou mais `confirm()` real; `npm run build` frontend passou. |
| A18 - ReactQueryDevtools em PROD | Devtools passou a ser importado dinamicamente apenas em `import.meta.env.DEV`. | `frontend/src/main.tsx` | `npm run build` frontend passou. |
| A18 - bundle unico grande sem code splitting | Rotas principais convertidas para `React.lazy`/`Suspense`. Login permanece carregamento imediato; paginas internas carregam sob demanda. | `frontend/src/App.tsx` | Build frontend passou; chunk inicial caiu de ~1,4 MB para ~489 KB. |
| B11 - `setTimeout(() => navigate(...))` sem cleanup | Redirect da tela de definicao de senha passou para `useEffect` com `clearTimeout` no cleanup. | `frontend/src/pages/SetupPasswordPage.tsx` | `npm run build` frontend passou. |
| C5/A17 - refresh/demo/localStorage | Validado que o modo cookie nao persiste refresh token e que login demo nao existe mais no provider atual. | `frontend/src/lib/auth.tsx`, `frontend/src/pages/LoginPage.tsx` | Revisao de codigo; sem nova mudanca estrutural nesta rodada alem do estado ja corrigido. |

### Documentacao criada/atualizada

| Documento | Conteudo |
|---|---|
| `docs/auditoria-tecnica-p2p-validacao-codex.md` | Validacao ponto a ponto da auditoria do Claude, separando confirmado, corrigido, desatualizado e dependente de infra. |
| `docs/correcoes-codex-auditoria-claude.md` | Este resumo das correcoes feitas por Codex. |
| `backend/PRODUCTION-SETUP.md` | Runbook de producao com PM2, secrets, health checks, backup, restore e logrotate. |

## Validacoes executadas

| Validacao | Resultado |
|---|---|
| `npm run build` backend | Passou apos as correcoes. |
| `npm run build` frontend | Passou apos as correcoes. |
| Smoke backend PROD/HML | `GET /api/health/live` 200, `GET /api/auth/password-policy` 200, `GET /api/auth/me` 401 sem token. |
| Smoke Browser | Tela `http://127.0.0.1:5173/login` carregou com titulo `P2P` e conteudo de login visivel. |
| Auditoria de `confirm()` | Restaram apenas comentarios; nenhum fluxo real usa `confirm()` nativo. |

## Pontos que continuam pendentes

Estes itens nao foram fechados por dependerem de decisao/infra ou serem pacotes maiores:

- Rotacionar credenciais reais de DB, LDAP, Qive, JWT e refresh secret.
- Confirmar PM2/logrotate/backup/restore no ambiente PROD real.
- Definir `SECRET_ENCRYPTION_KEY` real e migrar/recriptografar senhas SMTP ja persistidas.
- Resolver com DBA a estrategia para impedir pedido parcial no Linx em `COMPRAS`/`COMPRAS_CONSUMIVEL`.
- Avaliar Sentry/Datadog/NewRelic ou outro error tracking.
- Implementar BullMQ/Redis para e-mails e jobs.
- Melhorar `AuditInterceptor`: mascarar email, telefone, CEP, endereco e truncar payloads grandes.
- Revisar acessibilidade e `TableRow onClick`.
- Unificar `SupplierCombobox` duplicado.
- Avaliar parser NFe com fixtures/XML real.
