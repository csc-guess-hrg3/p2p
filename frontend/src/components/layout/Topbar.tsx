import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Building2,
  ChevronDown,
  FlaskConical,
  LogOut,
  Menu,
  User as UserIcon,
} from 'lucide-react';
import { getEnvironment } from '@/lib/api';
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
import { NAV_ITEMS, isNavGroup, type NavItem } from './nav';
import { NotificationsBell } from './NotificationsBell';

const PROFILE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  REVIEWER: 'Revisor',
};

/**
 * Badge informativo do ambiente atual. Só aparece quando está em HML —
 * em PROD não polui. A escolha do ambiente é feita na LoginPage e fica
 * travada durante a sessão; pra trocar, o usuário desloga e escolhe
 * novamente.
 */
function EnvironmentBadge() {
  if (getEnvironment() !== 'HML') return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-warning">
      <FlaskConical className="size-3.5" />
      Homologação
    </span>
  );
}

function flattenLeaves(entries: typeof NAV_ITEMS): NavItem[] {
  const out: NavItem[] = [];
  for (const e of entries) {
    if (isNavGroup(e)) out.push(...flattenLeaves(e.children));
    else out.push(e);
  }
  return out;
}

function currentTitle(pathname: string): string {
  // Casamento por prefixo, sem filtrar por perfil — se a URL existir, o
  // título precisa aparecer mesmo que o item esteja escondido no menu
  // (ex.: usuário com link direto pra detalhe). Achata grupos
  // recursivamente pra varrer só os leaves.
  const leaves = flattenLeaves(NAV_ITEMS);
  // Match mais específico (caminho mais longo) ganha — evita "/" comer
  // todas as rotas. Ordena desc por comprimento do `to`.
  const sorted = [...leaves].sort((a, b) => b.to.length - a.to.length);
  const match = sorted.find((i) =>
    i.end ? pathname === i.to : pathname.startsWith(i.to),
  );
  return match?.label ?? 'P2P';
}

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { companies, activeCompany, setActiveCompany } = useCompany();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          className="rounded-md p-2 hover:bg-accent lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="size-5" />
        </button>
        <h1 className="truncate text-base font-semibold text-foreground md:text-lg">
          {currentTitle(pathname)}
        </h1>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {/* Manual do usuário — HTML estático em /public, abre em nova aba.
            Disponível em qualquer tela, independente de perfil. */}
        <a
          href="/manual.html"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Abrir manual do usuário"
          title="Manual do usuário"
        >
          <BookOpen className="size-5" />
        </a>

        <NotificationsBell />
        <EnvironmentBadge />

        {/* Seletor de empresa */}
        {companies.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm hover:bg-accent md:px-3">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="hidden max-w-[8rem] truncate sm:inline">
                {activeCompany?.name ?? 'Empresa'}
              </span>
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
            <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <Building2 className="size-4" />
              {activeCompany.name}
            </span>
          )
        )}

        {/* Menu do usuário */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
            <UserIcon className="size-5 text-muted-foreground" />
            <span className="hidden max-w-[10rem] truncate font-medium text-foreground sm:inline">
              {user?.name}
            </span>
            <ChevronDown className="hidden size-4 text-muted-foreground sm:inline" />
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
