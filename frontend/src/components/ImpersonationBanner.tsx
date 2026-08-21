import { useNavigate } from 'react-router-dom';
import { UserCog, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';

const PAPEL: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  REVIEWER: 'Revisor',
};

/**
 * Barra fixa de SIMULAÇÃO DE LOGIN. Aparece em qualquer tela (interna ou
 * externa) quando o admin está "vendo como" outro usuário. Não renderiza nada
 * em sessão normal.
 */
export function ImpersonationBanner() {
  const { user, exitImpersonation } = useAuth();
  const navigate = useNavigate();

  if (!user?.impersonatedBy) return null;

  const papel =
    user.realm === 'EXTERNAL'
      ? user.externalCategory === 'REPRESENTANTE'
        ? 'Representante'
        : 'Externo'
      : (PAPEL[user.profile] ?? user.profile);

  const onExit = async () => {
    const admin = await exitImpersonation();
    navigate(admin.realm === 'EXTERNAL' ? '/externo' : '/', { replace: true });
  };

  return (
    <div className="sticky top-0 z-[70] flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-amber-950">
      <UserCog className="size-4 shrink-0" />
      <span>
        Você está vendo como <b>{user.name}</b> · {papel}
      </span>
      <button
        type="button"
        onClick={() => void onExit()}
        className="inline-flex items-center gap-1 rounded-md bg-amber-950/15 px-2.5 py-0.5 text-xs font-semibold transition hover:bg-amber-950/25"
      >
        <X className="size-3.5" />
        Sair da simulação
      </button>
    </div>
  );
}
