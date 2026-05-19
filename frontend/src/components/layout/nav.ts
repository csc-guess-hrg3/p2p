import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  ShoppingCart,
  Banknote,
  PackageCheck,
  ClipboardCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/requisicoes', label: 'Requisições', icon: FileText },
  { to: '/aprovacoes', label: 'Aprovações', icon: CheckSquare },
  { to: '/pedidos', label: 'Pedidos de Compra', icon: ShoppingCart },
  { to: '/solicitacoes-verba', label: 'Solicitações de Verba', icon: Banknote },
  { to: '/recebimentos', label: 'Recebimentos', icon: PackageCheck },
  {
    to: '/pendencias-fiscais',
    label: 'Pendências Fiscais',
    icon: ClipboardCheck,
  },
  { to: '/admin', label: 'Administração', icon: Settings },
];
