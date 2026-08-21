import { lazy, Suspense, type ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { CompanyProvider } from '@/lib/company';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireProfile } from '@/components/auth/RequireProfile';
import { RequireExternal } from '@/components/auth/RequireExternal';
import { AppLayout } from '@/components/layout/AppLayout';
import { ExternalLayout } from '@/components/layout/ExternalLayout';
import { LoginPage } from '@/pages/LoginPage';
import { Toaster } from '@/components/ui/toaster';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ImpersonationBanner } from '@/components/ImpersonationBanner';

function lazyPage<T extends ComponentType>(
  loader: () => Promise<Record<string, T>>,
  exportName: string,
) {
  return lazy(async () => ({
    default: (await loader())[exportName] as T,
  }));
}

const SetupPasswordPage = lazyPage(
  () => import('@/pages/SetupPasswordPage'),
  'SetupPasswordPage',
);
// Área Externa (portal do representante) — shell isolado do app interno.
const ExternalLoginPage = lazyPage(
  () => import('@/pages/externo/ExternalLoginPage'),
  'ExternalLoginPage',
);
const PortalHomePage = lazyPage(
  () => import('@/pages/externo/PortalHomePage'),
  'PortalHomePage',
);
const ConsultaClientesListPage = lazyPage(
  () => import('@/pages/externo/consulta-clientes/ConsultaClientesListPage'),
  'ConsultaClientesListPage',
);
const ClienteDetailPage = lazyPage(
  () => import('@/pages/externo/consulta-clientes/ClienteDetailPage'),
  'ClienteDetailPage',
);
const DashboardPage = lazyPage(() => import('@/pages/DashboardPage'), 'DashboardPage');
const RequisitionsListPage = lazyPage(
  () => import('@/pages/requisitions/RequisitionsListPage'),
  'RequisitionsListPage',
);
const RequisitionFormPage = lazyPage(
  () => import('@/pages/requisitions/RequisitionFormPage'),
  'RequisitionFormPage',
);
const RequisitionDetailPage = lazyPage(
  () => import('@/pages/requisitions/RequisitionDetailPage'),
  'RequisitionDetailPage',
);
const ApprovalsPage = lazyPage(
  () => import('@/pages/approvals/ApprovalsPage'),
  'ApprovalsPage',
);
const PaOrdersListPage = lazyPage(
  () => import('@/pages/product-orders-pa/PaOrdersListPage'),
  'PaOrdersListPage',
);
const PaOrderDetailPage = lazyPage(
  () => import('@/pages/product-orders-pa/PaOrderDetailPage'),
  'PaOrderDetailPage',
);
const PurchaseOrdersListPage = lazyPage(
  () => import('@/pages/purchase-orders/PurchaseOrdersListPage'),
  'PurchaseOrdersListPage',
);
const PurchaseOrderDetailPage = lazyPage(
  () => import('@/pages/purchase-orders/PurchaseOrderDetailPage'),
  'PurchaseOrderDetailPage',
);
const FundRequestsListPage = lazyPage(
  () => import('@/pages/fund-requests/FundRequestsListPage'),
  'FundRequestsListPage',
);
const FundRequestFormPage = lazyPage(
  () => import('@/pages/fund-requests/FundRequestFormPage'),
  'FundRequestFormPage',
);
const FundRequestDetailPage = lazyPage(
  () => import('@/pages/fund-requests/FundRequestDetailPage'),
  'FundRequestDetailPage',
);
const ReceivingsListPage = lazyPage(
  () => import('@/pages/receiving/ReceivingsListPage'),
  'ReceivingsListPage',
);
const ReceivingDetailPage = lazyPage(
  () => import('@/pages/receiving/ReceivingDetailPage'),
  'ReceivingDetailPage',
);
const FiscalQueuePage = lazyPage(
  () => import('@/pages/fiscal/FiscalQueuePage'),
  'FiscalQueuePage',
);
const FiscalDocumentsListPage = lazyPage(
  () => import('@/pages/fiscal-documents/FiscalDocumentsListPage'),
  'FiscalDocumentsListPage',
);
const FiscalDocumentDetailPage = lazyPage(
  () => import('@/pages/fiscal-documents/FiscalDocumentDetailPage'),
  'FiscalDocumentDetailPage',
);
const ContasPagarPage = lazyPage(
  () => import('@/pages/financeiro/ContasPagarPage'),
  'ContasPagarPage',
);
const IadsPage = lazyPage(() => import('@/pages/financeiro/IadsPage'), 'IadsPage');
const ProvisoesPage = lazyPage(
  () => import('@/pages/financeiro/ProvisoesPage'),
  'ProvisoesPage',
);
const DdasPage = lazyPage(() => import('@/pages/financeiro/DdasPage'), 'DdasPage');
const ReportsPage = lazyPage(() => import('@/pages/ReportsPage'), 'ReportsPage');
const LegacyOrdersListPage = lazyPage(
  () => import('@/pages/legacy-orders/LegacyOrdersListPage'),
  'LegacyOrdersListPage',
);
const LegacyOrderDetailPage = lazyPage(
  () => import('@/pages/legacy-orders/LegacyOrderDetailPage'),
  'LegacyOrderDetailPage',
);
const AdminPage = lazyPage(() => import('@/pages/admin/AdminPage'), 'AdminPage');
const ErpConfigPage = lazyPage(
  () => import('@/pages/admin/ErpConfigPage'),
  'ErpConfigPage',
);
const SettingsPage = lazyPage(
  () => import('@/pages/admin/SettingsPage'),
  'SettingsPage',
);
const UsersPage = lazyPage(() => import('@/pages/admin/UsersPage'), 'UsersPage');
const BudgetPage = lazyPage(
  () => import('@/pages/admin/BudgetPage'),
  'BudgetPage',
);
const TeamsPage = lazyPage(() => import('@/pages/admin/TeamsPage'), 'TeamsPage');
const DelegationsPage = lazyPage(
  () => import('@/pages/admin/DelegationsPage'),
  'DelegationsPage',
);
const AdSyncPage = lazyPage(() => import('@/pages/admin/AdSyncPage'), 'AdSyncPage');
const PositionsPage = lazyPage(
  () => import('@/pages/admin/PositionsPage'),
  'PositionsPage',
);
const BranchesPage = lazyPage(
  () => import('@/pages/admin/BranchesPage'),
  'BranchesPage',
);
const BranchDetailPage = lazyPage(
  () => import('@/pages/admin/BranchDetailPage'),
  'BranchDetailPage',
);
const SuppliersPage = lazyPage(
  () => import('@/pages/suppliers/SuppliersPage'),
  'SuppliersPage',
);
const SupplierDetailPage = lazyPage(
  () => import('@/pages/suppliers/SupplierDetailPage'),
  'SupplierDetailPage',
);

function RouteFallback() {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
      Carregando...
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            {/* Coluna de altura fixa: a faixa de simulação fica no topo e a
                área roteada ocupa o resto. Sem isso, o portal externo (que
                usa scroll do documento) fica preso pelo overflow:hidden global
                do #root — some a barra de rolagem. */}
            <div className="flex h-screen flex-col">
              <ImpersonationBanner />
              <div className="flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/definir-senha" element={<SetupPasswordPage />} />

                {/* Área Externa — portal do representante (fora do app interno) */}
                <Route path="/externo/login" element={<ExternalLoginPage />} />
                <Route path="/externo" element={<RequireExternal />}>
                  <Route element={<ExternalLayout />}>
                    <Route index element={<PortalHomePage />} />
                    <Route
                      path="consulta-clientes"
                      element={<ConsultaClientesListPage />}
                    />
                    <Route
                      path="consulta-clientes/:codigo"
                      element={<ClienteDetailPage />}
                    />
                  </Route>
                </Route>

                <Route element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="requisicoes" element={<RequisitionsListPage />} />
                  <Route
                    path="requisicoes/nova"
                    element={<RequisitionFormPage />}
                  />
                  <Route
                    path="requisicoes/:id"
                    element={<RequisitionDetailPage />}
                  />
                  <Route
                    path="requisicoes/:id/editar"
                    element={<RequisitionFormPage />}
                  />
                  {/* Aprovações — Admin/Manager (aprovador) e Operador
                      (solicitante vendo onde a requisição está). */}
                  <Route
                    element={
                      <RequireProfile
                        roles={['ADMIN', 'MANAGER', 'OPERATOR']}
                      />
                    }
                  >
                    <Route path="aprovacoes" element={<ApprovalsPage />} />
                  </Route>

                  {/* PA — Admin/Manager + equipes com módulo PA (Compras). */}
                  <Route
                    element={
                      <RequireProfile
                        roles={['ADMIN', 'MANAGER']}
                        module="PA"
                      />
                    }
                  >
                    <Route path="pedidos-pa" element={<PaOrdersListPage />} />
                    <Route
                      path="pedidos-pa/:pedido"
                      element={<PaOrderDetailPage />}
                    />
                  </Route>

                  <Route path="pedidos" element={<PurchaseOrdersListPage />} />
                  <Route
                    path="pedidos/:id"
                    element={<PurchaseOrderDetailPage />}
                  />
                  <Route
                    path="solicitacoes-verba"
                    element={<FundRequestsListPage />}
                  />
                  <Route
                    path="solicitacoes-verba/nova"
                    element={<FundRequestFormPage />}
                  />
                  <Route
                    path="solicitacoes-verba/:id"
                    element={<FundRequestDetailPage />}
                  />

                  {/* Fornecedores — módulo (De-Para Linx). Admin/Revisor. */}
                  <Route
                    element={<RequireProfile roles={['ADMIN', 'REVIEWER']} />}
                  >
                    <Route path="fornecedores" element={<SuppliersPage />} />
                    <Route
                      path="fornecedores/:codigo"
                      element={<SupplierDetailPage />}
                    />
                  </Route>

                  {/* Recebimentos — Admin/Manager/Operador + equipes com RECEIVING. */}
                  <Route
                    element={
                      <RequireProfile
                        roles={['ADMIN', 'MANAGER', 'OPERATOR']}
                        module="RECEIVING"
                      />
                    }
                  >
                    <Route
                      path="recebimentos"
                      element={<ReceivingsListPage />}
                    />
                    <Route
                      path="recebimentos/:id"
                      element={<ReceivingDetailPage />}
                    />
                  </Route>

                  {/* Pendências Fiscais — Admin/Revisor + equipes com FISCAL_QUEUE.
                      URL nova é hierárquica (/fiscal/pendencias-fiscais);
                      a antiga redireciona pra não quebrar bookmarks. */}
                  <Route
                    element={
                      <RequireProfile
                        roles={['ADMIN', 'REVIEWER']}
                        module="FISCAL_QUEUE"
                      />
                    }
                  >
                    <Route
                      path="fiscal/pendencias-fiscais"
                      element={<FiscalQueuePage />}
                    />
                    <Route
                      path="fiscal/notas-fiscais"
                      element={<FiscalDocumentsListPage />}
                    />
                    <Route
                      path="fiscal/notas-fiscais/:id"
                      element={<FiscalDocumentDetailPage />}
                    />
                  </Route>
                  <Route
                    path="pendencias-fiscais"
                    element={<Navigate to="/fiscal/pendencias-fiscais" replace />}
                  />

                  {/* Financeiro — Admin + equipes com módulo FINANCE
                      liberado (padrão FISCAL_QUEUE). */}
                  <Route
                    element={
                      <RequireProfile roles={['ADMIN']} module="FINANCE" />
                    }
                  >
                    <Route
                      path="financeiro/contas-pagar"
                      element={<ContasPagarPage />}
                    />
                    <Route path="financeiro/iads" element={<IadsPage />} />
                    <Route
                      path="financeiro/provisoes"
                      element={<ProvisoesPage />}
                    />
                    <Route path="financeiro/ddas" element={<DdasPage />} />
                  </Route>

                  {/* Relatórios — Admin/Manager/Revisor + equipes com REPORTS. */}
                  <Route
                    element={
                      <RequireProfile
                        roles={['ADMIN', 'MANAGER', 'REVIEWER']}
                        module="REPORTS"
                      />
                    }
                  >
                    <Route path="relatorios" element={<ReportsPage />} />
                  </Route>

                  {/* Pedidos Legados — Admin somente (read-through Linx). */}
                  <Route element={<RequireProfile roles={['ADMIN']} />}>
                    <Route
                      path="legacy-orders"
                      element={<LegacyOrdersListPage />}
                    />
                    <Route
                      path="legacy-orders/:companyId/:pedido"
                      element={<LegacyOrderDetailPage />}
                    />
                  </Route>

                  {/* Administração — Admin somente. */}
                  <Route element={<RequireProfile roles={['ADMIN']} />}>
                    <Route path="admin" element={<AdminPage />} />
                    <Route
                      path="admin/integracao-erp"
                      element={<ErpConfigPage />}
                    />
                    <Route path="admin/parametros" element={<SettingsPage />} />
                    <Route path="admin/usuarios" element={<UsersPage />} />
                    <Route path="admin/orcamento" element={<BudgetPage />} />
                    <Route path="admin/equipes" element={<TeamsPage />} />
                    <Route
                      path="admin/delegacoes"
                      element={<DelegationsPage />}
                    />
                    <Route path="admin/ad-sync" element={<AdSyncPage />} />
                    <Route path="admin/cargos" element={<PositionsPage />} />
                    <Route path="admin/filiais" element={<BranchesPage />} />
                    <Route
                      path="admin/filiais/:code"
                      element={<BranchDetailPage />}
                    />
                  </Route>
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
                </Suspense>
              </div>
            </div>
            <Toaster />
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
