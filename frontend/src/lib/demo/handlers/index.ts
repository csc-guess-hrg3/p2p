/**
 * Dispatcher do modo demo — encaminha cada request HTTP simulado para o
 * handler correto. Cada handler é uma função pura que recebe
 * `(method, segments[, query], data?)` e devolve `DemoResponse | null`.
 * `null` significa "não trato" — devolvemos `[]` por padrão pra não
 * quebrar a UI quando alguma rota nova não tiver mock ainda.
 *
 * Os handlers são organizados por domínio em arquivos separados:
 *  - admin.ts  — auth, companies, users, teams, settings, notifications,
 *               delegations, admin-ad-sync
 *  - erp.ts    — integration (catálogos ERP), dashboard
 *  - documents.ts — requisitions, purchase-orders, fund-requests,
 *                  approvals (+ history interno)
 *  - operations.ts — receiving, attachments, product-orders-pa,
 *                   fiscal-item-requests
 */
import { ok, parseUrl, type DemoResponse } from './_shared';
import {
  handleAuth,
  handleCompanies,
  handleSettings,
  handleUsers,
  handleTeams,
  handleDelegations,
  handleNotifications,
  handleAdminAdSync,
  handleBranches,
} from './admin';
import { handleIntegration, handleDashboard } from './erp';
import { handleFinancial } from './financial';
import {
  handleRequisitions,
  handlePurchaseOrders,
  handleFundRequests,
  handleApprovals,
  handleQuotations,
} from './documents';
import {
  handleReceiving,
  handleAttachments,
  handleProductOrdersPa,
  handleFiscalItemRequests,
} from './operations';

export function routeDemoRequest(
  method: string,
  rawUrl: string,
  data?: unknown,
): DemoResponse {
  const m = method.toUpperCase();
  const { segments, query } = parseUrl(rawUrl);
  const root = segments[0];

  const handlers: Record<string, () => DemoResponse | null> = {
    auth: () => handleAuth(m, segments, data),
    companies: () => handleCompanies(m, segments, data),
    settings: () => handleSettings(m, segments, query, data),
    integration: () => handleIntegration(m, segments, query),
    requisitions: () => handleRequisitions(m, segments, query, data),
    approvals: () => handleApprovals(m, segments, data),
    'purchase-orders': () => handlePurchaseOrders(m, segments, query, data),
    'fund-requests': () => handleFundRequests(m, segments, query),
    receiving: () => handleReceiving(m, segments, query, data),
    dashboard: () => handleDashboard(m, segments, query),
    attachments: () => handleAttachments(m, segments, query, data),
    'product-orders-pa': () => handleProductOrdersPa(m, segments, query, data),
    'fiscal-item-requests': () =>
      handleFiscalItemRequests(m, segments, query, data),
    users: () => handleUsers(m, segments, query, data),
    teams: () => handleTeams(m, segments, data),
    delegations: () => handleDelegations(m, segments, query, data),
    notifications: () => handleNotifications(m, segments, query),
    admin: () => handleAdminAdSync(m, segments),
    branches: () => handleBranches(m, segments, query, data),
    quotations: () => handleQuotations(m, segments, data),
    financial: () => handleFinancial(m, segments, query),
  };

  const handler = handlers[root];
  if (handler) {
    const res = handler();
    if (res) return res;
  }

  // Rota não mapeada — devolve vazio para não quebrar UI.
  // eslint-disable-next-line no-console
  console.info(`[demo] rota não mapeada: ${m} ${rawUrl} — devolvendo []`);
  return ok([]);
}
