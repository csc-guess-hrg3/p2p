import { useLocation, useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/lib/company';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckItem,
} from '@/components/ui/dropdown-menu';
import { NAV_ITEMS } from './nav';
import { EnvironmentSwitch } from './EnvironmentSwitch';

const PROFILE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  REVIEWER: 'Revisor',
};

function currentTitle(pathname: string): string {
  const match = NAV_ITEMS.find((i) =>
    i.end ? pathname === i.to : pathname.startsWith(i.to),
  );
  return match?.label ?? 'P2P';
}

export function Topbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { companies, activeCompany, setActiveCompany } = useCompany();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold text-foreground">
        {currentTitle(pathname)}
      </h1>

      <div className="flex items-center gap-3">
        {/* Ambiente: produção / homologação */}
        <EnvironmentSwitch />

        {/* Seletor de empresa */}
        {companies.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
              <Building2 className="size-4 text-muted-foreground" />
              {activeCompany?.name ?? 'Empresa'}
              <ChevronDown className="size-4 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Empresa ativa</DropdownMenuLabel>
              {companies.map((c) => (
                <DropdownMenuCheckItem
                  key={c.id}
                  checked={c.id === activeCompany?.id}
                  onSelect={() => setActiveCompany(c.id)}
                >
                  {c.name}
                </DropdownMenuCheckItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          activeCompany && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Building2 className="size-4" />
              {activeCompany.name}
            </span>
          )
        )}

        {/* Menu do usuário */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <UserIcon className="size-5 text-muted-foreground" />
            <span className="font-medium text-foreground">{user?.name}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuLabel>
              {user ? PROFILE_LABELS[user.profile] ?? user.profile : ''}
            </DropdownMenuLabel>
            <div className="px-2 pb-1 text-xs text-muted-foreground">
              {user?.email}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleLogout}>
              <LogOut className="size-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
