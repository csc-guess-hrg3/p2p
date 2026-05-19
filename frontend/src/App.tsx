import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth';
import { CompanyProvider } from '@/lib/company';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { Placeholder } from '@/pages/Placeholder';

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
                <Route
                  path="requisicoes"
                  element={
                    <Placeholder title="Requisições" etapa="Etapa F3" />
                  }
                />
                <Route
                  path="aprovacoes"
                  element={
                    <Placeholder title="Aprovações" etapa="Etapa F4" />
                  }
                />
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
