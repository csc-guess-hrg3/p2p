# P2P — Procure-to-Pay (HRG3 / Guess / Hering)

Briefing para o Codex. Este arquivo é o ponto de partida — o restante está em `DECISIONS.md`, `ANALISE_PROJETO.md`, `SPEC 1.md`, `PRD_Procure_to_Pay 2.docx` e `P2P_Especificacao_Tecnica 2.pdf`.

---

## TL;DR

- **Monorepo**: `backend/` (NestJS 11 + Prisma 7 + adapter MSSQL) e `frontend/` (React 19 + Vite 8 + TanStack Query + shadcn-style + Tailwind v4).
- **Banco P2P** próprio (`P2P_DB`) no mesmo SQL Server do ERP Linx — leituras cross-database via views `v_p2p_*`; escritas em `dbo.COMPRAS` / `dbo.COMPRAS_CONSUMIVEL`.
- **Multi-empresa**: GUESS e HERING (cada uma com seu `erpDbName`).
- **Auth**: LDAP/AD → JWT (cookie httpOnly desde a última rodada; localStorage como fallback transitório).
- **Estado atual**: MVP rodando em HML para Guess ponta a ponta. ~40% do escopo MVP da Especificação Técnica ainda não está em código (ver `DECISIONS.md` e `ANALISE_PROJETO.md`).

## Documentos a ler antes de codar

| Documento | O que tem |
|---|---|
| `DECISIONS.md` | **Leia primeiro.** Decisões aprovadas, débitos com motivo, pontos a definir, e o delta da última rodada. |
| `ANALISE_PROJETO.md` | Análise crítica detalhada (divergências PRD × código, débitos, riscos). |
| `SPEC 1.md` | Caderno de bordo do desenvolvedor — decisões da sessão de 19/05. |
| `PRD_Procure_to_Pay 2.docx` | Fonte de verdade do negócio. |
| `P2P_Especificacao_Tecnica 2.pdf` | Refinamento técnico v1.1. |
| `Analise_Critica_P2P_HRG3.docx` | Relatório técnico consolidado entregue. |

## Stack e organização

### Backend
```
backend/
├── prisma/
│   ├── schema.prisma          # P2P_DB (UUID, NoAction cascade, comentários PT-BR)
│   ├── migrations/            # 14 migrations versionadas (última: quotations_count_and_settings)
│   ├── erp-views.sql          # Views PROD lidas pelo P2P
│   └── erp-views.hml.sql      # Views HML
├── src/
│   ├── auth/                  # LDAP + JWT + Modo Demo
│   ├── approvals/             # Motor de aprovação por cadeia de equipe
│   ├── requisitions/          # Núcleo do P2P (REQ)
│   ├── purchase-orders/       # PC + envio ao Linx
│   ├── fund-requests/         # SV (adiantamento)
│   ├── receiving/             # Recebimento (backend pronto, UI em F6)
│   ├── integration/           # IntegrationService (leituras Linx)
│   │                           # LinxErpService (gravações) + EmailService
│   ├── dashboard/             # 3 KPIs (backend pronto, UI em F7)
│   ├── settings/              # SystemSetting parametrizável (ADMIN)
│   ├── teams/, users/, delegations/, companies/
│   ├── fiscal-item-requests/  # Pendências fiscais de item (LINK / NEW no Linx)
│   ├── numbering/             # SQL Server SEQUENCE
│   ├── common/
│   │   ├── interceptors/audit.interceptor.ts
│   │   ├── crypto/secret.service.ts   # AES-256-GCM
│   │   └── enums.ts                    # Status como string (Prisma+MSSQL sem enum)
│   ├── health/                # /api/health, /live, /ready (Terminus)
│   ├── budget/, financial/, reports/, fiscal-documents/   # Stubs Fase 2 (ApiExcludeController)
│   └── main.ts                # helmet, throttler, cookie-parser, CORS
├── seed-hml.js                # Seed HML (GUESS → HML_GUESS)
├── seed-hml-erpconfig.js      # Defaults Linx + SMTP da Guess HML
├── seed-demo.js               # Modo demonstração (4 perfis)
├── apply-hml-migrations.js    # Aplica migrations no HML
└── apply-hml-views.js         # Recria views v_p2p_*
```

### Frontend
```
frontend/src/
├── App.tsx                    # Routes + ErrorBoundary + Toaster
├── pages/
│   ├── LoginPage.tsx          # LDAP + painel "Modo demonstração"
│   ├── requisitions/          # F3 (form, list, detail, dialogs)
│   ├── approvals/             # F4
│   ├── purchase-orders/       # F5 (list, detail, SendToSupplierDialog, ConvertToPoDialog)
│   ├── fund-requests/         # SVs
│   ├── fiscal/                # F3.4 (pendências fiscais)
│   └── Placeholder.tsx        # F6 (Recebimento), F7 (Dashboard), F8 (Admin) — pendentes
├── components/
│   ├── ui/                    # shadcn-style: button, card, input, select, ..., toast, toaster, skeleton
│   ├── auth/RequireAuth.tsx   # Usa useNavigate + toast destrutivo na expiração
│   ├── layout/AppLayout.tsx
│   └── ErrorBoundary.tsx
└── lib/
    ├── api.ts                 # axios + interceptor de 401 (emite evento p2p:session-expired)
    ├── auth.tsx               # AuthProvider (login, loginDemo, logout, sessionExpired)
    ├── company.tsx            # CompanyProvider
    ├── demo.ts                # useDemoUsers()
    ├── requisitions.ts        # TanStack queries + tipos
    ├── purchase-orders.ts, approvals.ts, fund-requests.ts, integration.ts, fiscal.ts
    └── utils.ts               # cn (clsx + tailwind-merge)
```

## Comandos do dia a dia

### Backend (porta 3000 PROD / 3001 HML)
```bash
cd backend
npm install                           # após mudança de package.json
npx prisma generate                   # após mudança de schema.prisma
npx prisma migrate deploy             # ou: node apply-hml-migrations.js (HML)
node apply-hml-views.js               # recria v_p2p_* no HML
node seed-hml.js                      # seed empresas/admin (HML)
node seed-hml-erpconfig.js            # defaults Linx + SMTP (HML)
node seed-demo.js [--hml]             # modo demonstração

npm run build && node dist/src/main.js                   # PROD :3000
node --env-file=.env.hml dist/src/main.js                # HML :3001
npm run lint                          # eslint
npm test                              # jest (suíte ainda vazia)
```

### Frontend (porta 5173)
```bash
cd frontend
npm install
npm run dev           # proxy /api -> :3000, /api-hml -> :3001
npm run build         # tsc -b + vite build
npm run lint
```

## Estado das tarefas

### F6 / F7 / F8 — frontend pendente
- **F6 Recebimento UI**: backend completo em `receiving.service.ts` (CRUD, confirmação, tolerância configurável via SystemSetting `receiving.divergence_tolerance_pct`, recálculo de status do PC). Faltam `ReceivingListPage`, `ReceivingDetailPage`, `ReceiveDialog`.
- **F7 Dashboard**: backend pronto em `dashboard.service.ts` (3 KPIs: open / overdue / budget consumption). Falta UI com cards, drill-down, refresh 5 min.
- **F8 Administração**: backend pronto (`users`, `teams`, `delegations`, `settings`). Falta CRUD UI de `CompanyErpConfig`, Equipes, Alçadas, Delegações, Usuários, Settings.

### Decisões aprovadas (ver `DECISIONS.md`)
- **Manter como está**: justificativa min 15 (não 50); `tipoCompra` continua lendo `v_p2p_compras_tipos`; MFA TOTP no roadmap; 4 stubs Fase 2 preservados; INSERT direto no Linx; SMTP por empresa; JWT_SECRET compartilhado PROD/HML.
- **Definir**: alçada do Linx via tabela (a confirmar); RN-OC-01 com mapeamento de `STATUS_COMPRA` ('A' / 'E' = Em estudo); "mão de volta" do Linx; cancelamento parcial; SP `sp_p2p_receive_po`.

### Rodada 2 (próxima)
- BullMQ + Redis (deps já no `package.json`): processor de e-mail; mover SMTP para fila com retry.
- `OverdueAlertsService` com `@nestjs/schedule`: cron diário 3d antes/diário após o `expectedDelivery`.
- Notificação por e-mail real ao aprovador em `ApprovalsService.notifyApprover` (hoje só grava `Notification`).
- MJML templates + PDF formal (logo, dados do cabeçalho, rateios).

### Rodada 4 (depende de info externa)
- Mapeamento completo de `STATUS_COMPRA` no Linx → endpoint `PATCH /purchase-orders/:id` que devolve PC ao fluxo de aprovação (RN-OC-01) e altera status no Linx.
- Tabela de alçada do Linx → validação cruzada com `TeamApprovalLevel`.

## Mudanças da última sessão (Cowork, 19/05/2026)

**Backend**
- `helmet` + `cookie-parser` + `@nestjs/throttler` no `main.ts` / `app.module.ts`. Login com 10 req/min, refresh com 20/min.
- JWT em cookie `httpOnly` `p2p_token` (8h) e `p2p_refresh` (7d). `JwtStrategy` aceita cookie ou Bearer.
- `CryptoModule` (global) com `SecretService` AES-256-GCM. `EmailService` descriptografa `smtpPassword` em runtime (passthrough se `SECRET_ENCRYPTION_KEY` ausente).
- `HealthModule` (`@nestjs/terminus`): `GET /api/health`, `/api/health/live`, `/api/health/ready`.
- `RequisitionsService.submit` valida RN-REQ-02 (cotações) via `SettingsService` lendo:
  - `requisitions.min_quotations_threshold_amount` (default R$ 10.000)
  - `requisitions.min_quotations_required` (default 3)
- Schema: campo `quotationsCount Int @default(0)` em `Requisition` (migration `20260520120000_quotations_count_and_settings`).
- `LinxErpService` reforçado:
  - `prepareStagingId(poId)` antes do INSERT → fim do bug de idempotência.
  - Recovery por `OBS = 'P2P PC <numero>'` em caso de retry após falha.
  - `IntegrationLog` gravado em `SEND_PO` (SUCCESS/FAILED + durationMs + erro).
  - `LX_SEQUENCIAL('COMPRAS_EMAIL_LOG.ID_LOG')` substitui `MAX+1` (fallback com `TABLOCKX, HOLDLOCK`).
  - `trunc()` agora avisa quando corta `varchar(25)`.
- Stubs `budget`, `financial`, `reports`, `fiscal-documents` marcados com `@ApiExcludeController`.
- Removido `void Prisma` e dependências legadas (`@nestjs/bull`, `bull`); adicionado `@nestjs/bullmq`, `@nestjs/schedule`, `@nestjs/terminus`, `@nestjs/throttler`, `helmet`, `cookie-parser`.
- **Modo demonstração** (versão atual: frontend-only): catálogo + store + handlers + axios adapter em `frontend/src/lib/demo/`. Não depende do backend nem do banco. Login simulado, fluxos persistidos em `localStorage`. Endpoint backend `/auth/demo-login` ainda existe (opcional) mas a UI não usa.
- **Bug observado no Cowork**: o tool Write truncou vários arquivos silenciosamente. Os afetados foram reescritos via bash heredoc:
  - `frontend/src/App.tsx` (89 linhas, termina em `export default App;`)
  - `frontend/src/lib/api.ts` (84 linhas, termina no interceptor de response)
  - `frontend/src/lib/demo.ts` (7 linhas — stub deprecated)
  - `frontend/src/lib/requisitions.ts` (231 linhas, com `quotationsCount` nos tipos)
  - `frontend/src/pages/LoginPage.tsx` (188 linhas com painel demo)
  - `frontend/src/pages/purchase-orders/PurchaseOrderDetailPage.tsx` (255 linhas com toast/Skeleton)
  - `frontend/src/pages/requisitions/RequisitionFormPage.tsx` (616 linhas com campo de cotações)
  - Se algo parecer estranho num desses, abrir no editor para confirmar.

**Frontend**
- `Toaster` (shadcn-style) + `useToast()` + `toast()` imperativo. Montado em `App.tsx`.
- `ErrorBoundary` global.
- `Skeleton` aplicado no detalhe do PC.
- `api.ts`: `withCredentials: true`; em 401 emite `p2p:session-expired` (sem `window.location.href`).
- `AuthProvider`: `loginDemo`, `logout` async (chama `/auth/logout`), `sessionExpired` no contexto.
- `RequireAuth` usa `useNavigate` + toast destrutivo na expiração.
- Campo "Cotações anexadas" no `RequisitionFormPage`.
- `LoginPage` com painel "Modo demonstração" (só aparece se backend permitir).
- `typescript ~6.0.2` → `~5.9.2`.

## Estado validado nesta sessão

- **Frontend**: `tsc --noEmit -p tsconfig.app.json` rodou **sem nenhum erro** (validado em sandbox). Toda a tipagem do demo standalone + as mudanças em UX/cotações/segurança batem.
- **Backend**: não validado por build aqui — primeira tarefa do Codex é rodar `npm install` + `npm run build` e corrigir o que aparecer.
- **Aviso**: durante a sessão Cowork, o tool Write truncou silenciosamente vários arquivos (api.ts, App.tsx, LoginPage.tsx, requisitions.ts, RequisitionFormPage.tsx, PurchaseOrderDetailPage.tsx, demo.ts). Eles foram reescritos via bash heredoc e validados. Se algum arquivo parecer cortado, abrir com editor para confirmar antes de mexer.

## Validação imediata (rotina sugerida para o Codex)

```bash
# 1. INSTALAR — o node_modules instalado no sandbox ficou parcial (--ignore-scripts).
# Apagar para garantir build scripts (esbuild/swc/prisma engines) corretos.
cd frontend
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install

cd ..\backend
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm install
npx prisma generate

# 2. VALIDAR BUILD
cd ..\backend && npm run build      # gera dist/
cd ..\frontend && npm run build     # tsc -b + vite build

# 3. SUBIR FRONTEND SOZINHO (demo não precisa de backend nem banco)
cd ..\frontend && npm run dev       # http://localhost:5173/login
# clicar em "Modo demonstração" -> demo.admin

# 4. (opcional) SUBIR BACKEND COM BANCO REAL
cd ..\backend
# garantir no .env.hml:
#   DEMO_MODE_ENABLED=false        (frontend tem demo próprio agora)
#   SECRET_ENCRYPTION_KEY=<gerar 32+ chars: openssl rand -hex 32>
#   COOKIE_SAMESITE=lax
#   FRONTEND_URLS=http://localhost:5173
node apply-hml-migrations.js        # aplica a nova migration quotations_count_and_settings
node --env-file=.env.hml dist/src/main.js   # HML :3001

# 5. SMOKE TESTS
# Frontend demo:
#   - login com qualquer perfil
#   - editar REQ-DEMO-000001, submeter (R$ 750, sem cotações — deve passar)
#   - criar requisição com total > R$ 10.000 e quotationsCount=0 — deve recusar
#   - logar como demo.gestor → aprovar REQ-DEMO-000002 na fila
#   - converter em PC, simular envio ao fornecedor
# Backend (se subir):
#   - GET /api/health → 200 com prisma ok
#   - GET /api/health/live → 200
#   - POST /api/auth/login com LDAP real
```

## Convenções do projeto

- **Idioma**: PT-BR no código, comentários, mensagens de erro. Inglês apenas para identificadores técnicos canônicos.
- **Commits**: pt-BR, imperativo, sem `Co-Authored-By: Codex`. Foco no porquê.
- **Estilo**: 2 espaços, sem `any` quando evitável; `tsconfig` estrito; `ValidationPipe` global com `whitelist`/`forbidNonWhitelisted`.
- **Prisma + SQL Server**: `onDelete: NoAction` por padrão (múltiplos cascade paths); enums como string (validados em `common/enums.ts`); índices únicos filtrados via migration manual para colunas `@unique` nuláveis.
- **Auditoria**: `AuditInterceptor` mascara `cnpj|cpf|cgc|banco|agencia|conta|pix|senha|password|token`.
- **Multi-empresa**: filtrar SEMPRE por `companyId in user.companyIds`. Toda entidade transacional carrega `companyId`.

## O que NÃO mexer sem alinhamento

- Estratégia INSERT direto no Linx (decisão aprovada — substituir só quando `sp_p2p_receive_po` existir).
- `JwtStrategy` resolvendo por `adUsername` (não por `sub`) — é o que sustenta o switch transparente PROD/HML.
- Estrutura de equipes substituindo "grupos" do PRD — decisão consciente.
- 4 stubs em `app.module.ts` — preservar como ponto de extensão Fase 2.

## Próximas entregas priorizadas (após validação)

1. **Validar o lote da última sessão** (build + migrations + seed + smoke test).
2. **Rodada 2**: BullMQ + alertas de vencimento + e-mail real ao aprovador + MJML + PDF formal.
3. **Rodada 3**: F6 (Recebimento UI) → F7 (Dashboard UI) → F8 (Admin UI).
4. **Rodada 4** (depende da equipe Linx): mapear `STATUS_COMPRA` para implementar RN-OC-01 + tabela de alçada do Linx.
5. **Rodada 5**: testes (Jest com `prismock`) + GitHub Actions.
