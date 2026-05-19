import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { CompanyProvider } from '@/lib/company';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { Placeholder } from '@/pages/Placeholder';
import { RequisitionsListPage } from '@/pages/requisitions/RequisitionsListPage';
import { RequisitionFormPage } from '@/pages/requisitions/RequisitionFormPage';
import { RequisitionDetailPage } from '@/pages/requisitions/RequisitionDetailPage';
import { FiscalQueuePage } from '@/pages/fiscal/FiscalQueuePage';
import { ApprovalsPage } from '@/pages/approvals/ApprovalsPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CompanyProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route
                  index
                  element={<Placeholder title="Dashboard" etapa="Etapa F7" />}
                />
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
                <Route path="aprovacoes" element={<ApprovalsPage />} />
                <Route
                  path="pedidos"
                  element={
                    <Placeholder title="Pedidos de Compra" etapa="Etapa F5" />
                  }
                />
                <Route
                  path="solicitacoes-verba"
                  element={
                    <Placeholder
                      title="Solicitações de Verba"
                      etapa="Etapa F5"
                    />
                  }
                />
                <Route
                  path="recebimentos"
                  element={
                    <Placeholder title="Recebimentos" etapa="Etapa F6" />
                  }
                />
                <Route
                  path="pendencias-fiscais"
                  element={<FiscalQueuePage />}
                />
                <Route
                  path="admin"
                  element={
                    <Placeholder title="Administração" etapa="Etapa F8" />
                  }
                />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </CompanyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
