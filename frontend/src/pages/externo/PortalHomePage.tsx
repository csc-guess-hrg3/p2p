import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAreas } from '@/lib/portal';

const AREA_ICON: Record<string, typeof Users> = {
  'consulta-clientes': Users,
};

/** Início do portal — saudação + as áreas (telas) disponíveis para o usuário. */
export function PortalHomePage() {
  const { user } = useAuth();
  const areas = useAreas();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Olá, {user?.name?.split(' ')[0] ?? 'representante'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha uma área para começar.
        </p>
      </div>

      {areas.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : areas.isError ? (
        <p className="text-sm text-destructive">
          Não foi possível carregar suas áreas. Tente novamente.
        </p>
      ) : (areas.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma área disponível para o seu acesso.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(areas.data ?? []).map((a) => {
            const Icon = AREA_ICON[a.key] ?? Users;
            return (
              <Link
                key={a.key}
                to={`/externo/${a.key}`}
                className="flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition hover:shadow-sm"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-4" />
                  Área
                </div>
                <div className="font-medium">{a.title}</div>
                <p className="text-xs text-muted-foreground">{a.description}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
