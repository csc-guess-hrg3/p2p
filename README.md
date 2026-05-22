# P2P — Sistema Procure-to-Pay

Sistema operacional de compras da HRG3 — cobre o ciclo da requisição ao
pagamento, com aprovação por alçada, controle orçamentário e integração
com o ERP corporativo.

O P2P é o sistema primário do processo de compras; o ERP permanece como
sistema de registro contábil, fiscal e financeiro. A integração é
bidirecional: o P2P lê os dados de referência do ERP e grava de volta os
pedidos e solicitações aprovados.

## Escopo

Atende duas empresas (Guess e HRG3) e cobre a compra indireta —
serviços e materiais de consumo. Documentos do fluxo:

- **Requisição** — porta de entrada; o tipo de nota fiscal define o que ela gera
- **Pedido de Compra (PC)** — quando há ou haverá nota fiscal
- **Solicitação de Verba (SV)** — liberação de pagamento sem nota fiscal, ou adiantamento de um PC
- **Recebimento** — conferência de produto ou medição de serviço

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TanStack Query + Shadcn/UI + Tailwind |
| Backend | NestJS + TypeScript |
| ORM | Prisma (driver adapter MSSQL) |
| Banco | SQL Server — banco próprio do P2P |
| Filas | BullMQ + Memurai (Redis para Windows) |
| Autenticação | LDAP on-premise (Active Directory) + JWT |
| Deploy | Node.js + PM2 (Windows Server) |

## Pré-requisitos

- Node.js 20+
- Memurai (Redis compatível com Windows)
- Acesso ao SQL Server corporativo

## Setup

```bash
# Backend
cd backend
cp .env.example .env        # preencher credenciais
npm install
npx prisma migrate dev
npm run start:dev

# Frontend
cd frontend
npm install
npm run dev
```

| Serviço | Endereço |
|---|---|
| API | http://localhost:3000/api |
| Documentação da API (Swagger) | http://localhost:3000/api/docs |
| Frontend | http://localhost:5173 |

## Estrutura

```
p2p/
├── backend/                 API NestJS
│   ├── prisma/
│   │   ├── schema.prisma     modelo de dados do P2P
│   │   └── erp-views.sql     views de integração com o ERP
│   └── src/
│       ├── auth/             autenticação LDAP + JWT
│       ├── integration/      leitura dos dados de referência do ERP
│       ├── requisitions/     requisições
│       ├── purchase-orders/  pedidos de compra
│       ├── receiving/        recebimento / medição
│       ├── budget/           orçamento
│       ├── dashboard/        indicadores
│       └── reports/          relatórios
└── frontend/                SPA React
```

## Arquitetura de dados

- Dados de referência (filiais, centros de custo, fornecedores, itens,
  contas, rateios) são lidos do ERP em tempo real, via views — não são
  duplicados no banco do P2P.
- Dados transacionais (requisições, pedidos, solicitações, recebimentos)
  nascem e vivem no banco do P2P, e são gravados no ERP após aprovação.
- Toda mutação é registrada em log de auditoria.
