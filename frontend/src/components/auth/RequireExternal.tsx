import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/**
 * Guarda das rotas /externo (portal da Área Externa) — camada de CONFORTO
 * (a barreira dura é o ExternalRealmGuard no backend):
 *  - sem usuário → tela de login do portal;
 *  - usuário INTERNO → volta pro app interno (o portal não é dele);
 *  - usuário EXTERNAL → segue.
 */
export function RequireExternal() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/externo/login" replace />;
  if (user.realm !== 'EXTERNAL') return <Navigate to="/" replace />;
  return <Outlet />;
}
