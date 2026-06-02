# Validacao Codex da auditoria tecnica P2P

Data: 2026-06-01

Base verificada: working tree local em `I:\p2p`.

Observacao importante: a auditoria do Claude esta parcialmente desatualizada em relacao ao codigo atual. Varios pontos citados como pendentes ja aparecem corrigidos ou mitigados no working tree. Esta validacao separa o que esta confirmado, o que nao procede mais e o que depende de ambiente/infra/DBA.

## Resultado executivo

| Grupo | Situacao |
|---|---|
| Criticos P0 | A maioria e real em configuracao/infra. Alguns ja foram corrigidos em codigo: demo backend/frontend, transacao PA, Swagger em PROD, parte do deploy/backup via PM2 docs. |
| Altos P1 | Muitos procedem. Alguns ja foram corrigidos: rota de PC fiscal, safeDbName em quase todos os services, CI lint bloqueante, testes backend basicos existem. |
| Medios/Baixos | Em geral procedem como divida tecnica, mas ha duplicidades e itens ja parcialmente enderecados. |
| Validacao por build/teste | `npm test` backend e `npm run build` frontend foram tentados, mas passaram de 120s e a ferramenta encerrou por timeout. Nao considero falha funcional. |

## P0 - Criticos

| ID | Veredito | Evidencia |
|---|---|---|
| C1 JWT_SECRET literal em `.env` e `.env.hml` | Confirmado nos arquivos locais, mas mitigado para producao se PM2 for usado | `backend/.env` e `.env.hml` ainda tem secrets de dev; `backend/pm2.config.example.js` orienta secrets fortes e distintos. |
| C2 SECRET_ENCRYPTION_KEY ausente | Confirmado nos `.env`; mitigacao documentada | `.env*` nao tem a chave. `PRODUCTION-SETUP.md` e `pm2.config.example.js` exigem `SECRET_ENCRYPTION_KEY`. Falta confirmar ambiente real e migracao/recriptografia dos dados existentes. |
| C3 Senhas DB/LDAP/Qive em `.env` no share | Confirmado localmente | `.env` e `.env.hml` contem credenciais reais. `.gitignore` ignora esses arquivos, mas ainda e risco operacional por share de rede. |
| C4 Demo frontend ativavel em PROD | Nao procede no codigo atual | `frontend/src/lib/demo` nao existe mais e `LoginPage.tsx` nao renderiza painel demo. Comentario ainda menciona demo, mas nao ha UI/adapter demo. |
| C5 refreshToken em localStorage mesmo em cookie | Parcialmente corrigido | `frontend/src/lib/auth.tsx` so persiste refresh se `getAuthMode() === 'bearer'`. Em modo cookie default, nao grava. Risco residual: modo bearer legado ainda existe. |
| C6 SQLi por `erpDbName` sem allow-list | Parcialmente corrigido | Existe `backend/src/common/erp/safe-db-name.ts`; `linx-erp`, `fiscal-documents`, `erp-back-sync`, `product-orders-pa`, `financial` usam safeDbName. Achado residual: revisar manualmente `legacy-orders.service.ts`, especialmente `listNfesForOrder(erpDb, ...)`, embora chamadas principais passem safeDbName. |
| C7 `gravarPedidoCompra` sem transacao | Confirmado como risco aceito | O codigo explicitamente nao usa `$transaction` por conflito com triggers Linx. Ha idempotencia/recovery por OBS, mas pedido parcial com itens faltando segue risco real. Depende de DBA/estrategia 2 fases. |
| C8 `$transaction` falso em PA usando `this.prisma` | Nao procede no codigo atual | `product-orders-pa.service.ts` usa `tx.$executeRawUnsafe` nos blocos transacionais. |
| C9 DEMO_MODE backend bypass | Nao procede no codigo atual | `auth.controller.ts` nao tem `/auth/demo-login`; `auth.service.ts` nao tem login demo. |
| C10 Deploy manual sem PM2 | Parcialmente corrigido/documentado | `RUNBOOK.md` ainda cita `Start-Process`, mas existem `backend/PRODUCTION-SETUP.md` e `pm2.config.example.js` com PM2, auto-start e logrotate. Falta confirmar que prod real ja usa isso. |
| C11 Sem backup documentado | Parcialmente corrigido/documentado | `backend/PRODUCTION-SETUP.md` documenta backup diario, log a cada 15min e restore mensal. Falta evidenciar SQL Server Agent real. |
| C12 NODE_ENV=development no `.env` PROD | Confirmado nos `.env`; mitigado via PM2 | `.env` e `.env.hml` tem `NODE_ENV=development`; `pm2.config.example.js` usa `NODE_ENV=production` para PROD e HML. |

## P1 - Altos

| ID | Veredito | Evidencia |
|---|---|---|
| A1 rawXmlBase64 sem role/expurgo | Parcialmente confirmado | `rawXmlBase64` existe. `getXml/getDanfe` validam acesso por company via service, mas nao ha role especifica nem expurgo/storage externo. |
| A2 Audit log com PII parcial e sem TTL | Confirmado | Regex mascara campos sensiveis basicos, mas nao email/endereco/telefone/CEP; nao ha TTL/expurgo/truncamento de `after`. |
| A3 Cron Qive sem lock distribuido, estado em memoria | Confirmado | `FiscalDocumentsService` usa `syncStates: Map` e `@Cron` in-process. |
| A4 Parser NFe por regex | Nao validado nesta passada | Precisa abrir `nfe-parser.ts` e fixtures. Manter como pendente ate teste com XML real. |
| A5 JwtStrategy query Prisma por request | Confirmado | `JwtStrategy.validate()` faz `user.findUnique` a cada request. Decisao pode ser consciente para revogacao imediata, mas tem custo. |
| A6 CORS lista quebravel | Parcial | CORS usa lista `FRONTEND_URLS` split/trim e `credentials: true`. Nao ha validacao de formato no boot. |
| A7 `lastErpError` pode vazar SQL | Parcialmente corrigido | Criado `erp-error-sanitizer` e aplicado em `SEND_PO`, `SEND_SV`, `CREATE_SUPPLIER`, `BACK_SYNC` e conversao de PC. Ainda vale revisar outros modulos futuros que persistam erro bruto de ERP. |
| A8 Lockout/LDAP/Turnstile | Parcial | Turnstile existe para login local/loja, mas login LDAP via `LdapAuthGuard` nao chama Turnstile. Lockout de username inexistente precisa validacao especifica. |
| A9 LIKE sem escapar `%/_` | Confirmado para SV | `findExistingSvByObs` usa LIKE; precisa escapar metacaracteres se entrada variar. |
| A10 Sem JwtAuthGuard global | Corrigido | `JwtAuthGuard` agora roda como `APP_GUARD` global e respeita `@Public()`. Auth publico, health e raiz foram marcados explicitamente; `/auth/me` segue protegido. |
| A11 Pages monoliticas | Confirmado | `RequisitionFormPage.tsx` tem ~1022 linhas; `FiscalDocumentDetailPage.tsx` ~583; `PaOrderDetailPage.tsx` ~543. |
| A12 Bug rota PC fiscal | Nao procede | `FiscalDocumentDetailPage.tsx` navega para `/pedidos/${id}`. |
| A13 SupplierCombobox duplicado | Confirmado | Existem `pages/requisitions/SupplierCombobox.tsx` e `pages/financeiro/SupplierCombobox.tsx`. |
| A14 Search sem debounce | Parcialmente confirmado | Requer varredura por pagina, mas padrao existe em listas. |
| A15 Jargao tecnico | Confirmado qualitativamente | Termos como DDA, PA, ITP/IAD aparecem nas telas financeiras/produto. Pode ser aceitavel para publico especialista. |
| A16 `confirm()` nativo | Confirmado | 6 ocorrencias reais, incluindo aprovacao PA. |
| A17 `loginStore/loginDemo` forcando PROD | Corrigido | `loginStore` nao forca PROD; `loginDemo` nao existe no AuthProvider atual. |
| A18 Bundle unico/devtools PROD | Parcialmente corrigido | `ReactQueryDevtools` agora carrega so em DEV e rotas foram convertidas para `React.lazy`/`Suspense`. Build atual reduziu o chunk inicial para ~489 KB, com paginas em chunks sob demanda. |
| A19 Fetch Qive sem timeout | Parcial | `listNfesV2` tem retry, mas varios `fetch` da Qive seguem sem `AbortSignal.timeout`. |
| A20 Pool Prisma default | Confirmado | `PrismaService` nao configura pool min/max. |
| A21 CI lint continue-on-error | Nao procede | `.github/workflows/ci.yml` tem lint bloqueante com `--max-warnings=0`. |
| A22 Cobertura de teste nula | Parcialmente desatualizado | Existem specs de `linx-erp`, `product-orders-pa`, `approvals`, `receiving` e e2e smoke. Cobertura ainda baixa. |
| A23 Drift migrations HML via script | Confirmado | `apply-hml-migrations.js` ainda existe. |
| A24 Sem rotacao logs | Parcialmente corrigido/documentado | `PRODUCTION-SETUP.md` documenta `pm2-logrotate`; falta confirmar prod real. |
| A25 Sem error tracking | Confirmado | Nao ha Sentry/DataDog/NewRelic no codigo/deps. |
| A26 Swagger exposto PROD | Corrigido no codigo | `main.ts` so habilita Swagger fora de production ou com `SWAGGER_ENABLED=true`. |
| A27 BullMQ instalado mas sem uso | Confirmado | Dependencias existem, nenhum `BullModule`, `Queue` ou `Processor` no codigo. |
| A28 rawXmlBase64 inflando DB | Confirmado como risco | XML completo em `NVarChar(Max)` no SQL Server. |
| A29 `apply-erp-views.js` PROD sem snapshot | Confirmado como risco operacional | Script existe; precisa processo de snapshot/rollback. |
| A30 Throttler em memoria | Confirmado | `ThrottlerModule.forRoot` sem storage Redis. |

## Medios e baixos

Validacao por categoria:

- Seguranca: procedem em geral como hardening: signed cookies ausentes, bcrypt rounds 10, senha local ainda relativamente fraca, password token pode melhorar, LDAP em 389 nos `.env`, refresh blacklist ausente.
- Auditoria/dados: procedem: `AuditInterceptor` confia em `req.body.companyId` como fallback, mascara PII parcialmente, sem TTL.
- Frontend: procedem em geral: acessibilidade ainda baixa (~33 ocorrencias `aria/role/tabIndex`), `TableRow onClick` precisa revisao, erros genericos ainda existem. `confirm()` nativo e `setTimeout` sem cleanup em `SetupPasswordPage` ja foram corrigidos.
- Performance: procedem parcialmente: sem code splitting/manualChunks; bundle atual confirma 791KB; cache de JWT inexistente; crons in-process.
- Baixos: `lucide-react@^1.16.0`, scripts ad-hoc versionados, `uuid@14` com `crypto.randomUUID`, `pm2.config.js` local existe mas esta ignorado; `pm2.config.example.js` esta versionado corretamente.

## Pontos que precisam de validacao externa

1. Se os `.env` reais estao ou ja estiveram no historico Git. `git ls-files` indica que nao estao rastreados agora; `git log -- backend/.env backend/.env.hml` travou por timeout no share.
2. Se PROD real ja roda por PM2 ou ainda por `Start-Process`.
3. Se `SECRET_ENCRYPTION_KEY` ja existe no ambiente real e se `smtpPassword` ja foi recriptografado.
4. Se SQL Server Agent tem backup/restore testado.
5. Se DBA Linx aprova `BEGIN TRAN/XACT_ABORT` ou outra estrategia para impedir pedido parcial em `COMPRAS`/`COMPRAS_CONSUMIVEL`.
6. Se o usuario integrador do SQL Server tem permissao minima.

## Recomendacao de proximo lote

Prioridade pratica:

1. Remover dependencias de secrets em `.env` no share: usar PM2/env real, rotacionar DB/LDAP/Qive/JWT, apagar `.env*` do disco quando seguro.
2. Corrigir riscos ainda P0 reais: `gravarPedidoCompra` parcial e `NODE_ENV`/secrets em ambiente real.
3. P1 rapido de codigo: remover `ReactQueryDevtools` de PROD, substituir `confirm()`, adicionar timeout nos fetch Qive, aplicar JwtAuthGuard global com `@Public()`, sanitizar `lastErpError`, revisar `legacy-orders` para garantir `safeDbName` end-to-end.
4. P1 operacional: PM2 real + logrotate + backup verificado + error tracking.
5. P1 frontend/performance: code-splitting das rotas pesadas e unificacao de `SupplierCombobox`.
