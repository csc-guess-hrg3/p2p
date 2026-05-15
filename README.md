# P2P — Sistema Procure-to-Pay

Sistema operacional de compras da HRG3. Da requisição ao pedido de compra, com integração bidirecional ao ERP SQL Server.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TanStack Query + Shadcn/UI + Tailwind |
| Backend | NestJS + TypeScript |
| ORM | Prisma (SQL Server) |
| Banco P2P | SQL Server — P2P_DB |
| Bancos ERP | SQL Server — ERP_EMPRESA1_DB / ERP_EMPRESA2_DB (cross-DB queries) |
| Filas | BullMQ + Memurai (Redis para Windows) |
| Auth | LDAP on-premise (AD) + JWT |
| Deploy | Node.js + PM2 (Windows Server) |

## Pré-requisitos

- Node.js 20+
- [Memurai](https://www.memurai.com/get-memurai) (Redis para Windows)
- Acesso ao SQL Server (máquina 21)

## Setup rápido

```bash
# 1. Backend
cd backend
copy .env.example .env        # preencher credenciais
npm install
npx prisma migrate dev        # criar banco P2P_DB
npm run start:dev

# 2. Frontend
cd frontend
npm install
npm run dev
```

Backend roda em `http://localhost:3000`  
Frontend roda em `http://localhost:5173`  
Swagger em `http://localhost:3000/api`

## Estrutura

```
p2p/
├── backend/                  # NestJS API
│   ├── prisma/
│   │   └── schema.prisma     # Schema completo P2P_DB
│   ├── src/
│   │   ├── auth/             # LDAP + JWT
│   │   ├── users/
│   │   ├── companies/
│   │   ├── branches/
│   │   ├── cost-centers/
│   │   ├── suppliers/
│   │   ├── items/
│   │   ├── budget/
│   │   ├── requisitions/
│   │   ├── purchase-orders/
│   │   ├── receiving/
│   │   ├── fiscal-documents/ # Fase 2
│   │   ├── financial/        # Fase 2
│   │   ├── dashboard/
│   │   ├── reports/
│   │   └── integration/      # Anti-corruption layer ERP
│   └── .env.example
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── components/ui/    # Shadcn/UI components
│   │   ├── lib/
│   │   └── ...
│   └── components.json
├── P2P_Especificacao_Tecnica.md
└── P2P_Especificacao_Tecnica.pdf
```

## Documentação

- Especificação técnica completa: `P2P_Especificacao_Tecnica.md`
- PRD original: `C:\Users\tifany.porto\Downloads\PRD_Procure_to_Pay.docx`
