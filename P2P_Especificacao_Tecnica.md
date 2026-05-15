# Especificação Técnica MVP — Sistema Procure-to-Pay (P2P)

> **Para Claude:** Este arquivo contém a especificação técnica completa do projeto P2P.
> PRD original em: `C:\Users\tifany.porto\Downloads\PRD_Procure_to_Pay.docx`
> Gerado em: 15/05/2026 | Status: Rascunho técnico v1.0

---

## Contexto do Projeto

Sistema P2P (Procure-to-Pay) para orquestrar o ciclo de aquisição da empresa — da requisição de compra até o pagamento — com controle orçamentário em tempo real e visibilidade gerencial.

**Posicionamento correto:**
- **O P2P é o sistema operacional de compras.** Requisições, aprovações e Pedidos de Compra nascem e vivem no P2P.
- **O ERP é o sistema de registro contábil, fiscal, financeiro e de pagamentos.**
- Os dois coexistem com integração bidirecional estruturada — não são substitutos.

Fluxo: Requisição → Aprovação → OC gerada no P2P → OC aprovada enviada ao ERP (via staging/procedure) → ERP registra contabilmente e executa pagamento → P2P lê de volta status de pagamento, NFs, adiantamentos e provisões via SQL Server.

---

## 1. Arquitetura Sugerida

### 1.1 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TanStack Query + Shadcn/UI + TailwindCSS |
| Backend | NestJS (Node.js + TypeScript) |
| ORM | Prisma |
| Banco P2P | SQL Server — banco `P2P_DB` no mesmo servidor do ERP |
| Banco ERP | SQL Server — banco `ERP_DB` (mesmo servidor; integração via cross-database queries) |
| Cache / Filas | Redis 7 + BullMQ (apenas jobs async: e-mail, notificações, relatórios — não mais para cache ERP) |
| Armazenamento de arquivos | MinIO (self-hosted) ou AWS S3 |
| Autenticação | SSO SAML/OIDC + JWT + TOTP (MFA para Admin/Gestor) |
| E-mail | Nodemailer + templates MJML |
| Containers | Docker + Docker Compose (MVP) → K8s na Fase 2 |

### 1.2 Visão Geral da Arquitetura

```
[Browser — React SPA]
        |  HTTPS/REST+JSON
[API Gateway — Nginx/Kong]
        |
[P2P API — NestJS]
  ├── Auth Module (SSO/JWT/MFA)
  ├── Core Modules (por domínio)
  ├── Integration Service (polling ERP/Givei/Nexinovice)
  └── Job Queue — BullMQ (Redis)
        |                    |
[PostgreSQL — P2P DB]   [SQL Server — ERP/Givei/Nexinovice]
        |
  [Redis]  [MinIO/S3]  [SMTP]
```

### 1.3 Decisões Arquiteturais

**Anti-corruption layer para ERP**
Todo acesso ao SQL Server passa por um módulo de integração isolado (`IntegrationService`). O Core nunca conhece o schema do ERP — troca apenas tipos P2P normalizados. Isso protege o sistema de mudanças no schema do ERP.

**Polling assíncrono via BullMQ**
Jobs de polling (NFs do Givei/Nexinovice, status de pagamentos ERP) rodam em background a cada 15 minutos (configurável). O Core consome apenas dados já normalizados em tabelas de staging no PostgreSQL. Latência no ERP não afeta a UI.

**Autorização baseada em escopo (ABAC simplificado)**
JWT carrega `{ userId, profileId, branchIds[], costCenterIds[] }`. Guards no NestJS filtram queries automaticamente por escopo — sem lógica de permissão espalhada nos controllers.

**Auditoria via interceptor global**
Um NestJS interceptor registra toda mutation (POST/PATCH/DELETE) na tabela `audit_logs` com `entity_type`, `entity_id`, `action`, `before_snapshot`, `after_snapshot`, `user_id`, `ip`, `timestamp`. Retenção mínima de 5 anos (requisito LGPD + negócio).

**Soft delete universal**
Nenhuma entidade é excluída fisicamente. Toda entidade tem `deleted_at` (timestamp) e `status` (active/inactive). Histórico de transações sempre preservado.

---

## 2. Modelagem de Dados

### 2.1 Entidades Principais e Relacionamentos

```
users ──N:N── groups ──N:N── branches
  |                              |
  |                           N:N|
  |                        cost_centers ── cc_ratios
  |
  └── approval_tiers ── delegations

suppliers ──N:N── cost_centers
items ──── fiscal_item_mapping (→ ERP codes)
accounting_classes ── chart_of_accounts_mapping (→ ERP)

requisitions ──1:N── requisition_items
  |                       |
  |                  items + cost_centers
  |
  └──1:N── purchase_orders
                |
        purchase_order_items
                |
                └──1:N── receipts
                              |
                       fiscal_documents
                              |
                       document_matching

budget_entries (empresa + conta + filial + CC + mês)
budget_control_config (modalidade + política por CC/Filial/Conta)

advances   }
provisions } ← lidos do ERP, cache local no PostgreSQL
ddas       }

audit_logs | notifications | integration_logs | attachments
```

### 2.2 Schema PostgreSQL — Tabelas Principais

#### Usuários e Acesso

```sql
users (
  id uuid PK,
  name varchar,
  email varchar UNIQUE,
  cpf varchar(11) UNIQUE,
  matricula varchar,
  phone varchar,
  department varchar,
  profile_id uuid FK → profiles,
  direct_manager_id uuid FK → users,
  status enum('active','inactive'),
  sso_external_id varchar,
  created_at, updated_at, deleted_at
)

profiles (id, name)  -- admin | gestor | operador | revisor

user_groups (id, name, description)
user_group_members (user_id, group_id)
user_group_branches (group_id, branch_id)
user_group_cost_centers (group_id, cost_center_id)

approval_tiers (
  id uuid PK,
  name varchar,
  level int,
  max_amount decimal(15,2),  -- null = sem limite
  transaction_types text[]   -- ['requisition','purchase_order']
)
user_approval_tiers (user_id, tier_id, valid_from, valid_until)

delegations (
  id uuid PK,
  delegator_id uuid FK → users,
  delegate_id uuid FK → users,
  starts_at timestamp,
  ends_at timestamp,
  reason text,
  created_by uuid FK → users
)
```

#### Cadastros

```sql
branches (
  id uuid PK,
  code varchar UNIQUE,
  legal_name varchar,
  cnpj varchar(14) UNIQUE,
  ie varchar,
  address jsonb,
  business_unit_id uuid FK,
  status enum('active','inactive')
)

business_units (id, name, description)

cost_centers (
  id uuid PK,
  code varchar UNIQUE,
  description varchar,
  default_branch_id uuid FK → branches,
  responsible_user_id uuid FK → users,
  default_accounting_class_id uuid FK,
  status enum('active','inactive')
)

cc_ratios (
  id uuid PK,
  name varchar,
  cost_centers jsonb  -- [{cc_id, percentage}] soma = 100%
)

suppliers (
  id uuid PK,
  legal_name varchar,
  cnpj varchar(14),
  cpf varchar(11),
  ie varchar,
  address jsonb,
  bank_details jsonb,
  contact jsonb,
  default_payment_condition_id uuid FK,
  default_accounting_class_id uuid FK,
  status enum('active','pending_validation','inactive'),
  pre_registered_at timestamp,
  validated_by uuid FK → users
)
supplier_cost_centers (supplier_id, cost_center_id)

items (
  id uuid PK,
  internal_code varchar UNIQUE,
  description varchar,
  variant varchar,
  type enum('product','service'),
  unit_of_measure varchar,
  default_accounting_class_id uuid FK,
  status enum('active','inactive')
)
fiscal_item_mapping (item_id, erp_fiscal_code, erp_description, valid_from, valid_until)

accounting_classes (
  id uuid PK,
  code varchar UNIQUE,
  description varchar,
  nature enum('expense','investment'),
  category enum('capex','opex'),
  type varchar,
  erp_account_code varchar  -- de-para plano de contas ERP
)

purchase_types (id, name, expected_doc_type enum)
payment_conditions (id, description, days, installments, type)
payment_methods (id, name, type enum('boleto','pix','credit_card','ted','deposit'))
```

#### Orçamento

```sql
budget_entries (
  id uuid PK,
  company_cnpj varchar,
  accounting_class_id uuid FK,
  branch_id uuid FK,
  cost_center_id uuid FK,
  year int,
  month_amounts decimal(15,2)[12],  -- meses 1..12
  annual_total decimal(15,2) GENERATED,
  version int,
  imported_at timestamp,
  imported_by uuid FK → users
)

budget_control_config (
  id uuid PK,
  cost_center_id uuid FK,
  branch_id uuid FK,
  accounting_class_id uuid FK,
  modality enum('yearly','monthly','cumulative_year','cumulative_month'),
  policy enum('informative','blocking')
)
```

#### Transações

```sql
requisitions (
  id uuid PK,
  number varchar UNIQUE,  -- REQ-2026-000123
  requester_id uuid FK → users,
  branch_id uuid FK,
  status enum('draft','pending_approval','approved','rejected','converted','cancelled'),
  linked_contract_id uuid,
  is_recurring boolean,
  recurring_months int,
  has_advance boolean,
  advance_amount decimal(15,2),
  justification text,
  total_estimated decimal(15,2),
  current_approver_id uuid FK → users,
  approval_tier_level int,
  submitted_at, approved_at, rejected_at, created_at, updated_at
)

requisition_items (
  id uuid PK,
  requisition_id uuid FK,
  item_id uuid FK → items,
  quantity decimal(12,4),
  estimated_unit_price decimal(15,2),
  estimated_total decimal(15,2) GENERATED,
  cost_center_id uuid FK,
  cc_ratio_id uuid FK,
  accounting_class_id uuid FK,
  purchase_type_id uuid FK,
  delivery_date date,
  notes text
)

purchase_orders (
  id uuid PK,
  number varchar UNIQUE,  -- OC-2026-000123
  requisition_id uuid FK → requisitions,
  supplier_id uuid FK → suppliers,
  branch_id uuid FK,
  payment_condition_id uuid FK,
  payment_method_id uuid FK,
  status enum('draft','pending_approval','approved','sent_to_supplier',
              'partially_received','fully_received','invoiced','paid',
              'cancelled','reversed','disputed'),
  total_amount decimal(15,2),
  sent_at timestamp,
  erp_po_number varchar,
  cancellation_reason text,
  created_by uuid, created_at, updated_at
)

purchase_order_items (
  id uuid PK,
  purchase_order_id uuid FK,
  requisition_item_id uuid FK,
  item_id uuid FK,
  quantity decimal(12,4),
  unit_price decimal(15,2),
  total_price decimal(15,2) GENERATED,
  cost_center_id uuid FK,
  accounting_class_id uuid FK,
  delivery_date date,
  status enum('pending','partially_received','received','cancelled'),
  received_quantity decimal(12,4) DEFAULT 0
)

receipts (
  id uuid PK,
  number varchar UNIQUE,  -- REC-2026-000123
  purchase_order_id uuid FK,
  type enum('product','service'),
  status enum('draft','confirmed','divergent'),
  measurement_start date,
  measurement_end date,
  completion_percentage decimal(5,2),
  notes text,
  registered_by uuid FK → users,
  confirmed_at timestamp,
  created_at
)
receipt_items (receipt_id, po_item_id, received_quantity, divergence_type, divergence_notes)
```

#### Documentos Fiscais e Matching

```sql
fiscal_documents (
  id uuid PK,
  number varchar UNIQUE,  -- DOC-2026-000123
  doc_type enum('nfe','nfse','cte','debit_note','utility_bill','invoice_di'),
  supplier_id uuid FK,
  supplier_cnpj varchar(14),
  erp_doc_id varchar,
  erp_source enum('givei','nexinovice'),
  issue_date date,
  due_date date,
  total_amount decimal(15,2),
  xml_data jsonb,
  status enum('pending_matching','matched','written_off','divergent','overdue'),
  polled_at timestamp,
  created_at
)

document_matching (
  id uuid PK,
  fiscal_document_id uuid FK,
  purchase_order_id uuid FK,
  receipt_id uuid FK,
  match_type enum('automatic','manual'),
  status enum('pending','approved','rejected'),
  value_divergence_pct decimal(5,2),
  quantity_divergence_pct decimal(5,2),
  reviewed_by uuid FK → users,
  reviewed_at timestamp,
  created_at
)
```

#### Financeiro (cache do ERP)

```sql
advances (id, supplier_id, branch_id, cost_center_id, amount, balance, erp_id, paid_at, last_synced_at)
provisions (id, purchase_order_id, receipt_id, amount, competence_date, erp_id, status, last_synced_at)
ddas (id, barcode UNIQUE, supplier_cnpj, amount, due_date, fiscal_document_id,
      status enum('unmatched','matched','paid'), erp_bank_id, last_synced_at)
```

#### Infraestrutura

```sql
audit_logs (id bigserial, entity_type, entity_id, action, user_id, user_ip,
            before_snapshot jsonb, after_snapshot jsonb, created_at)
notifications (id, user_id, type, title, body, metadata jsonb, read_at, created_at)
integration_logs (id bigserial, source, job_type, status, records_processed,
                  error_details jsonb, duration_ms, executed_at)
attachments (id, entity_type, entity_id, filename, storage_key, size_bytes,
             mime_type, uploaded_by, created_at)
```

#### Índices Críticos

```sql
CREATE INDEX idx_po_status_branch ON purchase_orders(status, branch_id);
CREATE INDEX idx_po_items_delivery ON purchase_order_items(delivery_date, status);
CREATE INDEX idx_req_requester_status ON requisitions(requester_id, status);
CREATE INDEX idx_fiscal_docs_status ON fiscal_documents(status, due_date);
CREATE INDEX idx_ddas_due_unmatched ON ddas(due_date) WHERE status = 'unmatched';
CREATE INDEX idx_budget_lookup ON budget_entries(branch_id, cost_center_id, accounting_class_id, year);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id, created_at);
```

---

## 3. Fluxos Principais

### 3.1 Fluxo Completo P2P

```
[Operador] Cria Requisição
    → Sistema valida campos e orçamento
    → Gera REQ-XXXX, notifica primeiro aprovador

[Gestor N1] Aprova ou Rejeita
    → Se valor > alçada N1: escala para N2 automaticamente
    → N aprovações até nível com alçada suficiente

[Sistema] Converte Requisição → Pedido de Compra
    → 1 Requisição pode gerar N OCs (por fornecedor)

[Operador] Envia OC ao fornecedor (e-mail template)

[Operador] Registra Recebimento / Medição
    → Total ou parcial por item/quantidade
    → Para serviços: período + % conclusão + ata

[Sistema] Matching Automático (CNPJ fornecedor + número XPed da NF-e)
    → OK: status "Escriturado" → alimenta provisão/DDA no ERP
    → Divergência: Revisor analisa → Gestor aprova se acima da tolerância

[ERP] Executa pagamento (fora do escopo P2P)
```

### 3.2 Controle Orçamentário

```
Ao criar/aprovar OC:
  Consulta budget_entries + budget_control_config

  Calcula: consumido_atual + comprometido_OCs_abertas + novo_pedido

  ≤ 80%    → indicador verde, prossegue
  80-100%  → indicador amarelo, prossegue
  > 100% + policy='informative' → alerta vermelho, prossegue com justificativa
  > 100% + policy='blocking'   → BLOQUEIA
    └── Apenas hierarquia superior vê botão "Aprovar mesmo assim"
    └── Justificativa mínima 100 caracteres
    └── Registrado em audit_log com flag over_budget=true
```

### 3.3 Integração ERP (Polling)

```
[BullMQ Job — a cada 15min]
  → Conecta SQL Server via pool isolado (somente leitura)
  → Consulta views: fiscal_docs_staging, advances, provisions, ddas
  → Normaliza → upsert no PostgreSQL (staging)
  → Emite eventos → Core processa (matching automático, alertas)
  → Registra em integration_logs
  → Erro: retry 3x com backoff exponencial → alerta admin
```

### 3.4 Estado do Pedido de Compra

```
Rascunho → Aguardando Aprovação → Aprovado → Enviado ao Fornecedor
  → Parcialmente Recebido → Recebido Total → Faturado → Pago → Encerrado

Exceções: Cancelado | Estornado | Em Disputa
```

---

## 4. Backlog MVP (Fase 1)

### Épico 1 — Infraestrutura e Auth (est. ~26 dias)
- INF-01: Setup NestJS + PostgreSQL + Redis + Docker Compose
- INF-02: Setup React + Vite + TanStack Query + Shadcn
- INF-03: SSO OIDC/SAML (⚠ depende de definição do provedor)
- INF-04: JWT com refresh token + blacklist Redis
- INF-05: MFA TOTP para Admin/Gestor
- INF-06: Guard ABAC por perfil + escopo de filial/CC
- INF-07: Interceptor global de auditoria
- INF-08: Upload de arquivos para MinIO/S3
- INF-09: Pipeline CI (lint + tests + build)
- INF-10: Anti-corruption layer SQL Server (⚠ depende de views ERP)
- INF-11: Serviço de e-mail (SMTP + templates)
- INF-12: Paginação + filtros padronizados na API

### Épico 2 — Usuários e Permissões (est. ~15 dias)
- USR-01: CRUD usuários + soft delete
- USR-02: Gestão de perfis (4 pré-definidos)
- USR-03: Grupos + amarração filial/CC
- USR-04: Alçadas por nível e valor
- USR-05: Delegação temporária de alçada
- USR-06: E-mail de boas-vindas
- USR-07: Listagem/busca de usuários

### Épico 3 — Cadastros Base (est. ~19 dias)
- CAD-01: CRUD Filiais (validação CNPJ)
- CAD-02: CRUD Unidades de Negócio
- CAD-03: CRUD Centros de Custo
- CAD-04: CRUD Fornecedores (manual)
- CAD-05: CRUD Itens + de-para ERP
- CAD-06: CRUD Classificação Contábil + de-para plano de contas
- CAD-07: Formas/Condições de Pagamento
- CAD-08: Tipos de Compra
- CAD-09: Importação de Itens via Excel
- [F2] CAD-10: Templates de rateio CC
- [F2] CAD-13: Importação de Orçamento Excel

### Épico 4 — Requisição (est. ~19 dias)
- REQ-01: Criar requisição (itens, CC, condição pagamento, anexos)
- REQ-02: Verificação orçamentária básica
- REQ-03: Upload de anexos (até 10 × 10 MB)
- REQ-04: Fluxo de aprovação por alçada + notificações e-mail
- REQ-05: Listagem com filtros
- REQ-06: Edição (retorna ao fluxo de aprovação)
- REQ-07: Cancelamento com justificativa
- [F2] REQ-08: Requisições recorrentes
- [F2] REQ-09: Exigência de 3 cotações acima de R$ X

### Épico 5 — Pedido de Compra (est. ~14 dias)
- OC-01: Conversão Requisição → OC
- OC-02: Visualização detalhada (cabeçalho + itens)
- OC-03: Listagem com sinalização de atrasos (verde/amarelo/vermelho)
- OC-04: Aprovação por alçada
- OC-05: Cancelamento (valida se há NF associada)
- OC-06: Card orçamentário em tempo real
- OC-07: Envio de e-mail ao fornecedor
- OC-08: Botão "Notificar Fornecedor" para atrasos
- OC-09: Alertas por vencimento (3 dias antes + diário pós-atraso)
- [F2] OC-10: Matching 3-way

### Épico 6 — Recebimento (est. ~10 dias)
- REC-01: Recebimento total de produto
- REC-02: Recebimento parcial por item/quantidade
- REC-03: Medição de serviço (período + % + ata)
- REC-04: Registro de divergências

### Épico 7 — Dashboard MVP (est. ~10 dias)
- DSH-01: KPI — Pedidos em aberto (qty + valor)
- DSH-02: KPI — Pedidos em atraso
- DSH-03: KPI — Consumo orçamentário (% consumido)
- DSH-04: Refresh automático a cada 5 min
- DSH-05: Drill-down: clicar no KPI abre lista filtrada

### Épico 8 — Relatórios MVP (est. ~4 dias)
- REL-01: REL-002 — Pedidos em atraso > 30 dias (diário)
- REL-02: REL-003 — Consumo orçamentário por filial/CC (mensal)

**Estimativa total MVP: ~117 dias de desenvolvimento → 16 semanas com squad de 5 devs**

---

## 5. Integrações ERP

### Views SQL a Solicitar ao Time de ERP (MVP)

```sql
-- Leitura (mínimo para MVP)
v_p2p_chart_of_accounts      -- código, descrição, tipo
v_p2p_fiscal_items           -- código fiscal, descrição, unidade
v_p2p_item_mapping           -- código item ERP ↔ código P2P

-- Leitura (Fase 2)
v_p2p_advances               -- adiantamentos por fornecedor/CC
v_p2p_provisions             -- provisões por OC
v_p2p_payment_status         -- status de pagamento
v_givei_fiscal_docs          -- NFs do Givei
v_nexinovice_fiscal_docs     -- NFs do Nexinovice

-- Escrita (MVP — para envio de OC aprovada ao ERP)
INSERT INTO p2p_po_staging (...)
-- OU: EXEC sp_p2p_receive_approved_po(...)
```

### Regras da Integração
1. Pool de conexão SQL Server separado por source (ERP, Givei, Nexinovice)
2. Credenciais de somente leitura (exceto staging table de escrita)
3. Toda falha logada em `integration_logs` — não propaga exceção para o usuário
4. UI exibe `last_synced_at` para dados sincronizados do ERP
5. Circuit breaker: após 3 falhas consecutivas, desliga polling e alerta admin

---

## 6. Riscos Técnicos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Schema ERP não documentado / instável | Alta | Alto | Workshop com DBA antes do dev; testes de contrato |
| Views ERP lentas / pesadas | Média | Alto | Staging no PostgreSQL; polling assíncrono nunca bloqueia UI |
| Givei/Nexinovice mudam schema sem aviso | Média | Alto | Testes de contrato automatizados + circuit breaker |
| Alçadas mal configuradas na carga inicial | Média | Médio | Ambiente de homologação + 30 dias de operação assistida |
| Conflito de nomenclatura no de-para items ERP | Alta | Médio | Workshop de taxonomia pré-go-live |
| OCs existentes no ERP sem migração | Alta | Alto | Definir estratégia de migração/cutover antes do go-live |
| LGPD: CPF e dados bancários em audit_log | Baixa | Alto | Mascarar campos sensíveis no before/after_snapshot |

---

## 7. Pontos Ainda Indefinidos

### Bloqueadores para início do MVP
1. **Provedor SSO:** Azure AD, Okta, ADFS? Protocolo: SAML 2.0 ou OIDC?
2. **Hospedagem:** Cloud (qual?) ou on-premise?
3. **SQL Server ERP:** instância de homologação disponível? Qual credencial?
4. **Givei/Nexinovice:** mesmo banco do ERP ou separado? Credenciais?
5. **OCs existentes no ERP:** migrar ou coexistir?
6. **Threshold de cotações:** R$ X para exigir 3 cotações — qual valor inicial?
7. **Multi-empresa:** múltiplos CNPJs com orçamentos separados?
8. **DDA — banco(s):** CNAB 240 ou API? Qual(is) banco(s)?

---

## 8. Roadmap Técnico

### Fase 1 — MVP (Semanas 1-16)
- **Sem 1-2:** Setup infra, Docker, CI, skeleton NestJS + React. Workshop ERP (paralelo)
- **Sem 3-4:** Auth (SSO/JWT/MFA) + Módulo Usuários completo
- **Sem 5-6:** Cadastros base (Filiais, CCs, Fornecedores, Itens, importação Excel)
- **Sem 7-8:** Anti-corruption layer + integração ERP inicial (de-para itens + plano de contas)
- **Sem 9-11:** Módulo Requisição completo (criação, aprovação, delegação)
- **Sem 12-14:** Módulo Pedido de Compra (conversão, aprovação, atrasos, alertas)
- **Sem 15:** Módulo Recebimento (total, parcial, medição, divergências)
- **Sem 16:** Dashboard (3 KPIs) + 2 Relatórios + UAT + hardening de segurança

### Fase 2 (Semanas 17-32)
- Sem 17-20: Polling Givei/Nexinovice + listagem documentos fiscais
- Sem 21-24: Matching 3-way automático + manual + fluxo de divergência
- Sem 25-27: Importação orçamento Excel + controle orçamentário completo
- Sem 28-30: Módulo Financeiro (adiantamentos, provisões, DDAs + alertas)
- Sem 31-32: Relatórios completos (REL-001 a REL-007) + agendamento e-mail

### Fase 3 (Semanas 33-48)
- PWA para aprovações mobile (iOS 15+ / Android 11+)
- Pré-cadastro automático de fornecedor via XML NF-e
- Workflow de cotações (RFQ) integrado
- Integrações adicionais: SERASA, Receita Federal
- Portal do fornecedor (autosserviço)

### Squad Sugerido para MVP
- 1 Tech Lead / Arquiteto (NestJS + integração ERP)
- 2 Backend Developers (NestJS)
- 2 Frontend Developers (React)
- 1 QA Engineer
- 1 DBA do ERP (TI interna, part-time — views + staging)

---

## Numeração de Documentos
- Requisições: `REQ-AAAA-NNNNNN` (ex.: REQ-2026-000123)
- Pedidos de Compra: `OC-AAAA-NNNNNN`
- Recebimentos: `REC-AAAA-NNNNNN`
- Documentos Fiscais: `DOC-AAAA-NNNNNN`

## KPIs de Sucesso
| KPI | Baseline | Meta 12m |
|---|---|---|
| Ciclo médio aprovação OC | 5 dias | 1 dia |
| NF sem associação após 30 dias | ~30% | 0% |
| % despesas com extrapolação orçamentária descoberta tardiamente | 15% | 1% |
| Adoção (usuários ativos / cadastrados) | — | 90% |
| North Star: % despesas transacionadas via P2P | — | 80% |
