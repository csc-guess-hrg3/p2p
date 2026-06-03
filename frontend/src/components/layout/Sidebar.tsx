import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NAV_SECTIONS,
  filterNavEntries,
  isNavGroup,
  type NavItem,
  type NavGroup,
} from './nav';
import { useAuth } from '@/lib/auth';
import { useFiscalItemRequests } from '@/lib/fiscal';

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

// Storage da expansão dos grupos. Antes a chave era "p2p:nav:collapsed"
// e o default era "aberto" (mais ergonômico p/ quem usa só Financeiro).
// Mudamos pra ser "expanded" e default "fechado" — menu nasce limpo, o
// usuário expande quando precisar e o estado fica memorizado.
// Chave nova evita herdar o estado antigo (que vinha como "fechado=undefined,
// aberto=true" no formato anterior).
const STORAGE_KEY = 'p2p:nav:expanded';

function loadExpanded(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function NavLeaf({
  item,
  badges,
}: {
  item: NavItem;
  badges: Record<string, number | undefined>;
}) {
  const count = item.badgeKey ? badges[item.badgeKey] : undefined;
  return (
    <NavLink
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
      <span className="flex-1">{item.label}</span>
      {typeof count === 'number' && count > 0 && (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </NavLink>
  );
}

/**
 * Verifica recursivamente se o pathname atual cai em alguma folha do
 * grupo — usado pra auto-expandir grupos/sub-grupos quando a rota ativa
 * pertence a eles.
 */
function groupContainsPath(group: NavGroup, pathname: string): boolean {
  for (const c of group.children) {
    if (isNavGroup(c)) {
      if (groupContainsPath(c, pathname)) return true;
    } else if (pathname.startsWith(c.to)) {
      return true;
    }
  }
  return false;
}

function NavGroupBlock({
  group,
  depth,
  expandedMap,
  onToggle,
  badges,
}: {
  group: NavGroup;
  depth: number;
  expandedMap: Record<string, boolean>;
  onToggle: (key: string) => void;
  badges: Record<string, number | undefined>;
}) {
  const location = useLocation();
  const hasActive = groupContainsPath(group, location.pathname);
  // Grupo nasce FECHADO. Abre quando:
  //   1) Rota ativa está dentro (auto-expand) — UX importante: chegou
  //      via link direto pra um filho, o grupo precisa estar aberto.
  //   2) Usuário clicou pra abrir (registrado em expandedMap).
  const open = hasActive || expandedMap[group.key] === true;

  // Sub-grupos (depth>0) recebem tipografia menor pra hierarquia ficar
  // visível sem precisar de bordas/cores extras.
  const headerClass =
    depth === 0
      ? 'text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/70'
      : 'text-xs font-medium text-sidebar-foreground/85';

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(group.key)}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-3 py-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          headerClass,
        )}
      >
        <span className="flex items-center gap-3">
          <group.icon className="size-4" />
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            'size-4 transition-transform',
            open ? 'rotate-0' : '-rotate-90',
          )}
        />
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-3">
          {group.children.map((c) =>
            isNavGroup(c) ? (
              <NavGroupBlock
                key={c.key}
                group={c}
                depth={depth + 1}
                expandedMap={expandedMap}
                onToggle={onToggle}
                badges={badges}
              />
            ) : (
              <NavLeaf key={c.to} item={c} badges={badges} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const { user } = useAuth();
  // Filtra cada seção pelo perfil/módulos; seções que ficam vazias somem
  // (ex.: a seção Administração não aparece para quem não é admin).
  const sections = NAV_SECTIONS.map((s) => ({
    heading: s.heading,
    entries: filterNavEntries(s.entries, user?.profile, {
      extraModules: user?.extraModules,
    }),
  })).filter((s) => s.entries.length > 0);

  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    loadExpanded(),
  );

  // Contadores exibidos como badge ao lado do label. Hoje só
  // "Pendências Fiscais" tem badge. O hook é chamado incondicionalmente
  // (regra de hooks); pra usuários sem permissão o backend devolve 403
  // e o `data` fica undefined — o badge simplesmente não aparece.
  const fiscalPendingQ = useFiscalItemRequests({ status: 'PENDING' });
  const badges: Record<string, number | undefined> = {
    'fiscal-pending': fiscalPendingQ.data?.total,
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  function toggle(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

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
        <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-2">
          {sections.map((section, idx) => (
            <div
              key={section.heading ?? `sec-${idx}`}
              className={cn(
                'space-y-1',
                idx > 0 &&
                  'mt-3 border-t border-sidebar-border/60 pt-3',
              )}
            >
              {section.heading && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                  {section.heading}
                </p>
              )}
              {section.entries.map((entry) =>
                isNavGroup(entry) ? (
                  <NavGroupBlock
                    key={entry.key}
                    group={entry}
                    depth={0}
                    expandedMap={expanded}
                    onToggle={toggle}
                    badges={badges}
                  />
                ) : (
                  <NavLeaf key={entry.to} item={entry} badges={badges} />
                ),
              )}
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border px-6 py-4 text-xs text-sidebar-foreground/60">
          Procure-to-Pay · MVP
        </div>
      </aside>
    </>
  );
}
