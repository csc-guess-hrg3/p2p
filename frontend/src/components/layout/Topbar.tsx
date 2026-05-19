import { useLocation } from 'react-router-dom';
import { Building2, User as UserIcon } from 'lucide-react';
import { NAV_ITEMS } from './nav';

function currentTitle(pathname: string): string {
  const match = NAV_ITEMS.find((i) =>
    i.end ? pathname === i.to : pathname.startsWith(i.to),
  );
  return match?.label ?? 'P2P';
}

export function Topbar() {
  const { pathname } = useLocation();
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-6">
      <h1 className="text-lg font-semibold text-foreground">
        {currentTitle(pathname)}
      </h1>
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Building2 className="size-4" />
          {/* F2: seletor de empresa */}
          Empresa
        </span>
        <span className="flex items-center gap-2 font-medium text-foreground">
          <UserIcon className="size-5 text-muted-foreground" />
          {/* F2: usuário autenticado */}
          Usuário
        </span>
      </div>
    </header>
  );
}
