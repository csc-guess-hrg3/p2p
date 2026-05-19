import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { Placeholder } from '@/pages/Placeholder';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route
            index
            element={<Placeholder title="Dashboard" etapa="Etapa F7" />}
          />
          <Route
            path="requisicoes"
            element={<Placeholder title="Requisições" etapa="Etapa F3" />}
          />
          <Route
            path="aprovacoes"
            element={<Placeholder title="Aprovações" etapa="Etapa F4" />}
          />
          <Route
            path="pedidos"
            element={<Placeholder title="Pedidos de Compra" etapa="Etapa F5" />}
          />
          <Route
            path="solicitacoes-verba"
            element={
              <Placeholder title="Solicitações de Verba" etapa="Etapa F5" />
            }
          />
          <Route
            path="recebimentos"
            element={<Placeholder title="Recebimentos" etapa="Etapa F6" />}
          />
          <Route
            path="admin"
            element={<Placeholder title="Administração" etapa="Etapa F8" />}
          />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
