import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, canSeeNav } from './nav';
import { useAuth } from '@/lib/auth';

interface SidebarProps {
  mobileOpen: boolean;
  onClose: () => void;
}

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

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  const items = NAV_ITEMS.filter((i) => canSeeNav(i, user?.profile));
  return (
    <>
      {/* Backdrop só em mobile, quando drawer aberto. Clique fora fecha. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform duration-200',
          // ≥ lg: vira parte do flow normal, sem transform.
          'lg:static lg:transform-none',
          // < lg: drawer — fechado fora da tela, aberto desliza.
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="flex items-center justify-between pr-2 lg:pr-0">
          <Wordmark />
          <button
            onClick={onClose}
            className="rounded p-2 text-sidebar-foreground hover:bg-sidebar-accent lg:hidden"
            aria-label="Fechar menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {items.map((item) => (
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
    </>
  );
}
