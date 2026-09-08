import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import type { Module, Profile } from '@/components/layout/nav';
import { AccessDeniedPage } from '@/pages/StatusPages';

interface Props {
  /** Perfis sempre liberados. */
  roles: Profile[];
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
 * Sem o perfil (e sem o módulo liberado pra equipe), mostra a tela "Sem
 * acesso" NO LUGAR — mantendo a URL — em vez de jogar pra home sem aviso
 * (o antigo comportamento fazia o usuário achar que o app bugou; deep-link
 * de e-mail, bookmark após troca de perfil, link colado). O menu já esconde
 * os itens; este guard cobre o acesso por URL.
 */
export function RequireProfile({ roles, module }: Props) {
  const { user } = useAuth();
  if (!user) return null; // RequireAuth já redirecionou
  const profileOk = roles.includes(user.profile as Profile);
  const moduleOk = !!module && !!user.extraModules?.includes(module);
  if (!profileOk && !moduleOk) {
    return <AccessDeniedPage />;
  }
  return <Outlet />;
}
