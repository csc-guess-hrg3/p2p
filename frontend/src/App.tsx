import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { CompanyProvider } from '@/lib/company';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { RequireProfile } from '@/components/auth/RequireProfile';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RequisitionsListPage } from '@/pages/requisitions/RequisitionsListPage';
import { RequisitionFormPage } from '@/pages/requisitions/RequisitionFormPage';
import { RequisitionDetailPage } from '@/pages/requisitions/RequisitionDetailPage';
import { FiscalQueuePage } from '@/pages/fiscal/FiscalQueuePage';
import { FiscalDocumentsListPage } from '@/pages/fiscal-documents/FiscalDocumentsListPage';
import { FiscalDocumentDetailPage } from '@/pages/fiscal-documents/FiscalDocumentDetailPage';
import { ContasPagarPage } from '@/pages/financeiro/ContasPagarPage';
import { IadsPage } from '@/pages/financeiro/IadsPage';
import { ProvisoesPage } from '@/pages/financeiro/ProvisoesPage';
import { DdasPage } from '@/pages/financeiro/DdasPage';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';
import { PurchaseOrdersListPage } from '@/pages/purchase-orders/PurchaseOrdersListPage';
import { PurchaseOrderDetailPage } from '@/pages/purchase-orders/PurchaseOrderDetailPage';
import { FundRequestsListPage } from '@/pages/fund-requests/FundRequestsListPage';
import { FundRequestDetailPage } from '@/pages/fund-requests/FundRequestDetailPage';
import { ReceivingsListPage } from '@/pages/receiving/ReceivingsListPage';
import { ReceivingDetailPage } from '@/pages/receiving/ReceivingDetailPage';
import { PaOrdersListPage } from '@/pages/product-orders-pa/PaOrdersListPage';
import { PaOrderDetailPage } from '@/pages/product-orders-pa/PaOrderDetailPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AdminPage } from '@/pages/admin/AdminPage';
import { ErpConfigPage } from '@/pages/admin/ErpConfigPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { TeamsPage } from '@/pages/admin/TeamsPage';
import { DelegationsPage } from '@/pages/admin/DelegationsPage';
import { AdSyncPage } from '@/pages/admin/AdSyncPage';
import { PositionsPage } from '@/pages/admin/PositionsPage';
import { BranchesPage } from '@/pages/admin/BranchesPage';
import { BranchDetailPage } from '@/pages/admin/BranchDetailPage';
import { SetupPasswordPage } from '@/pages/SetupPasswordPage';
import { Toaster } from '@/components/ui/toaster';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/definir-senha" element={<SetupPasswordPage />} />
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
                    path="solicitacoes-verba/:id"
                    element={<FundRequestDetailPage />}
                  />

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

                  {/* Administração — Admin somente. */}
                  <Route element={<RequireProfile roles={['ADMIN']} />}>
                    <Route path="admin" element={<AdminPage />} />
                    <Route
                      path="admin/integracao-erp"
                      element={<ErpConfigPage />}
                    />
                    <Route path="admin/parametros" element={<SettingsPage />} />
                    <Route path="admin/usuarios" element={<UsersPage />} />
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
            <Toaster />
          </CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
