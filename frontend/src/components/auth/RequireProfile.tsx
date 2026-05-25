import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import type { Profile } from '@/components/layout/nav';

interface Props {
  roles: Profile[];
  /** Para onde mandar se não tiver permissão. Default: dashboard. */
  redirectTo?: string;
}

/**
 * Guard de rota por perfil. Funciona como wrapper no `<Routes>` — basta
 * declarar `<Route element={<RequireProfile roles={['ADMIN']} />}>` e
 * aninhar as rotas restritas dentro.
 *
 * Se o usuário tiver outro perfil, redireciona pra Dashboard. Como o menu
 * já esconde os itens, este guard cobre o caso de URL colada/digitada.
 */
export function RequireProfile({ roles, redirectTo = '/' }: Props) {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth já redirecionou
  if (!roles.includes(user.profile as Profile)) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}
