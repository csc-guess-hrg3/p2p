import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAreas } from '@/lib/portal';
import { Button } from '@/components/ui/button';

/**
 * Shell ISOLADO do portal externo — nada do app interno. Só a marca, as áreas
 * do usuário e o logout.
 */
export function ExternalLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const areas = useAreas();

  const onLogout = async () => {
    await logout();
    navigate('/externo/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">GUESS</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Portal do Representante
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground md:inline">
              {user?.name}
            </span>
            <Button size="sm" variant="outline" onClick={onLogout}>
              <LogOut className="size-4" />
              Sair
            </Button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2">
          <PortalNavLink to="/externo" end label="Início" />
          {(areas.data ?? []).map((a) => (
            <PortalNavLink key={a.key} to={`/externo/${a.key}`} label={a.title} />
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t py-3 text-center text-xs text-muted-foreground">
        GUESS · Área Externa
      </footer>
    </div>
  );
}

function PortalNavLink({
  to,
  label,
  end,
}: {
  to: string;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition ${
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-muted'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
