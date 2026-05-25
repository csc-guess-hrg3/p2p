import {
  LayoutDashboard,
  FileBarChart,
  FileText,
  CheckSquare,
  ShoppingCart,
  Shirt,
  Banknote,
  PackageCheck,
  ClipboardCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type Profile = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'REVIEWER';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Quais perfis veem o item. Omitido = todos. */
  roles?: Profile[];
}

// Conjuntos reutilizados ao montar `roles` — deixa a tabela legível.
const ALL: Profile[] = ['ADMIN', 'MANAGER', 'OPERATOR', 'REVIEWER'];
const APPROVERS: Profile[] = ['ADMIN', 'MANAGER'];
const FISCAL: Profile[] = ['ADMIN', 'REVIEWER'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ALL },
  { to: '/requisicoes', label: 'Requisições', icon: FileText, roles: ALL },
  {
    to: '/aprovacoes',
    label: 'Aprovações',
    icon: CheckSquare,
    roles: APPROVERS,
  },
  {
    to: '/pedidos',
    label: 'Pedidos de Compra',
    icon: ShoppingCart,
    roles: ALL,
  },
  {
    to: '/pedidos-pa',
    label: 'Produto Acabado',
    icon: Shirt,
    roles: APPROVERS,
  },
  {
    to: '/solicitacoes-verba',
    label: 'Solicitações de Verba',
    icon: Banknote,
    roles: ALL,
  },
  {
    to: '/recebimentos',
    label: 'Recebimentos',
    icon: PackageCheck,
    roles: ['ADMIN', 'MANAGER', 'OPERATOR'],
  },
  {
    to: '/pendencias-fiscais',
    label: 'Pendências Fiscais',
    icon: ClipboardCheck,
    roles: FISCAL,
  },
  {
    to: '/relatorios',
    label: 'Relatórios',
    icon: FileBarChart,
    roles: ['ADMIN', 'MANAGER', 'REVIEWER'],
  },
  { to: '/admin', label: 'Administração', icon: Settings, roles: ['ADMIN'] },
];

/** True se o item está acessível ao perfil dado. */
export function canSeeNav(item: NavItem, profile?: string): boolean {
  if (!item.roles) return true;
  return !!profile && item.roles.includes(profile as Profile);
}
