/**
 * Constantes de status/tipo do P2P.
 * SQL Server não suporta enums no Prisma — os campos são String validados aqui.
 */

export const UserProfile = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  OPERATOR: 'OPERATOR',
  REVIEWER: 'REVIEWER',
} as const;
export type UserProfile = (typeof UserProfile)[keyof typeof UserProfile];

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING_SETUP: 'PENDING_SETUP',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/**
 * Realm de autenticação — separa o aplicativo INTERNO (usuários corporativos
 * via AD/local) da ÁREA EXTERNA (portal de terceiros: representantes,
 * fornecedores, etc.). O ExternalRealmGuard nega EXTERNAL em toda rota interna
 * por padrão (default-deny) e só libera onde marcado explicitamente.
 */
export const UserRealm = {
  INTERNAL: 'INTERNAL',
  EXTERNAL: 'EXTERNAL',
} as const;
export type UserRealm = (typeof UserRealm)[keyof typeof UserRealm];

/**
 * Categoria de usuário externo (Área Externa). Fixa no código de propósito:
 * cada categoria nova exige código próprio (provider de auth, escopo, catálogo
 * de relatórios), então uma tabela cadastrável em runtime não economiza dev.
 * VENDEDOR_LOJA é o realm externo que já existia (login por CPF, em
 * deprecação); REPRESENTANTE é a 1ª categoria da Área Externa. FORNECEDOR entra
 * quando construído.
 */
export const ExternalCategory = {
  REPRESENTANTE: 'REPRESENTANTE',
  VENDEDOR_LOJA: 'VENDEDOR_LOJA',
} as const;
export type ExternalCategory =
  (typeof ExternalCategory)[keyof typeof ExternalCategory];

export const RequisitionNfType = {
  SEM_NF: 'SEM_NF',
  NF_FUTURA: 'NF_FUTURA',
  NF_EXISTENTE: 'NF_EXISTENTE',
} as const;
export type RequisitionNfType =
  (typeof RequisitionNfType)[keyof typeof RequisitionNfType];

export const RequisitionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  IN_APPROVAL: 'IN_APPROVAL',
  /** Aprovador pediu ajuste — requisitante edita e ressubmete. */
  REVISION: 'REVISION',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONVERTED: 'CONVERTED',
  CANCELLED: 'CANCELLED',
} as const;
export type RequisitionStatus =
  (typeof RequisitionStatus)[keyof typeof RequisitionStatus];

export const PurchaseOrderStatus = {
  DRAFT: 'DRAFT',
  IN_APPROVAL: 'IN_APPROVAL',
  APPROVED: 'APPROVED',
  SENT_TO_SUPPLIER: 'SENT_TO_SUPPLIER',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  FULLY_RECEIVED: 'FULLY_RECEIVED',
  PENDING_ERP: 'PENDING_ERP',
  INTEGRATED: 'INTEGRATED',
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseOrderStatus =
  (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const FundRequestStatus = {
  DRAFT: 'DRAFT',
  IN_APPROVAL: 'IN_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PENDING_ERP: 'PENDING_ERP',
  INTEGRATED: 'INTEGRATED',
  CANCELLED: 'CANCELLED',
} as const;
export type FundRequestStatus =
  (typeof FundRequestStatus)[keyof typeof FundRequestStatus];

export const ApprovalStepStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  /** Aprovador pediu ajuste — documento volta pro requisitante editar. */
  REVISION: 'REVISION',
} as const;
export type ApprovalStepStatus =
  (typeof ApprovalStepStatus)[keyof typeof ApprovalStepStatus];

export const ReceivingStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  DIVERGENT: 'DIVERGENT',
  CANCELLED: 'CANCELLED',
} as const;
export type ReceivingStatus =
  (typeof ReceivingStatus)[keyof typeof ReceivingStatus];

export const ApprovalEntityType = {
  REQUISITION: 'REQUISITION',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  FUND_REQUEST: 'FUND_REQUEST',
} as const;
export type ApprovalEntityType =
  (typeof ApprovalEntityType)[keyof typeof ApprovalEntityType];

export const NotificationType = {
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  EDITED: 'EDITED',
  OVERDUE: 'OVERDUE',
  BUDGET_ALERT: 'BUDGET_ALERT',
  GENERAL: 'GENERAL',
} as const;
export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export const IntegrationLogStatus = {
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
} as const;
export type IntegrationLogStatus =
  (typeof IntegrationLogStatus)[keyof typeof IntegrationLogStatus];
