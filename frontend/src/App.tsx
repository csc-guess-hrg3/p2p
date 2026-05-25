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

                  {/* Pendências Fiscais — Admin/Revisor + equipes com FISCAL_QUEUE. */}
                  <Route
                    element={
                      <RequireProfile
                        roles={['ADMIN', 'REVIEWER']}
                        module="FISCAL_QUEUE"
                      />
                    }
                  >
                    <Route
                      path="pendencias-fiscais"
                      element={<FiscalQueuePage />}
                    />
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
