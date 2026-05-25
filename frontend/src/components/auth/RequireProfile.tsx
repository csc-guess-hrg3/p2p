import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import type { Module, Profile } from '@/components/layout/nav';

interface Props {
  /** Perfis sempre liberados. */
  roles: Profile[];
  /** Para onde mandar se não tiver permissão. Default: dashboard. */
  redirectTo?: string;
  /**
   * Se o usuário tiver este módulo liberado pela equipe (via
   * `extraModules`), também passa — mesmo sem perfil compatível.
   */
  module?: Module;
}

/**
 * Guard de rota por perfil + módulo. Funciona como wrapper no `<Routes>`:
 *   <Route element={<RequireProfile roles={['ADMIN']} />}>...</Route>
 *
 * Se o usuário tiver outro perfil e o módulo não estiver liberado pra
 * equipe dele, redireciona pra Dashboard. Como o menu já esconde os
 * itens, este guard cobre o caso de URL colada/digitada.
 */
export function RequireProfile({ roles, redirectTo = '/', module }: Props) {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth já redirecionou
  const profileOk = roles.includes(user.profile as Profile);
  const moduleOk = !!module && !!user.extraModules?.includes(module);
  if (!profileOk && !moduleOk) {
    return <Navigate to={redirectTo} replace />;
  }
  return <Outlet />;
}
