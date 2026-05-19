import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav';

/** Marca HRG3 — "HRG" em branco + "3" em quadrado azul (eco do logo). */
function Wordmark() {
  return (
    <div className="flex items-center gap-1 px-6 py-5">
      <span className="text-2xl font-extrabold tracking-tight text-white">
        HRG
      </span>
      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-xl font-extrabold text-white">
        3
      </span>
      <span className="ml-2 text-xs font-medium uppercase tracking-widest text-sidebar-foreground">
        P2P
      </span>
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <Wordmark />
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border px-6 py-4 text-xs text-sidebar-foreground/60">
        Procure-to-Pay · MVP
      </div>
    </aside>
  );
}
