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

/**
 * Módulos restritos que o Admin pode liberar por equipe.
 * Cada NavItem que tem um destes em `module` pode ser destravado para
 * usuários cuja equipe tenha o módulo no `extraModules` (vindo do
 * `/auth/me`), além dos perfis listados em `roles`.
 */
export type Module =
  | 'PA'
  | 'FISCAL_QUEUE'
  | 'REPORTS'
  | 'RECEIVING';

export const MODULE_LABEL: Record<Module, string> = {
  PA: 'Produto Acabado',
  FISCAL_QUEUE: 'Pendências Fiscais',
  REPORTS: 'Relatórios',
  RECEIVING: 'Recebimentos',
};

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Perfis que sempre veem o item. Omitido = todos. */
  roles?: Profile[];
  /** Se a equipe tiver este módulo liberado, o item aparece além de `roles`. */
  module?: Module;
}

const ALL: Profile[] = ['ADMIN', 'MANAGER', 'OPERATOR', 'REVIEWER'];
const APPROVERS: Profile[] = ['ADMIN', 'MANAGER'];
const FISCAL: Profile[] = ['ADMIN', 'REVIEWER'];

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, roles: ALL },
  { to: '/requisicoes', label: 'Requisições', icon: FileText, roles: ALL },
  {
    // Aprovações é módulo padrão. O conteúdo difere por perfil:
    //  - Admin/Manager: requisições que precisam da decisão deles.
    //  - Operador: requisições próprias aguardando o gestor decidir.
    // Reviewer não tem caso de uso (não submete nem aprova).
    to: '/aprovacoes',
    label: 'Aprovações',
    icon: CheckSquare,
    roles: ['ADMIN', 'MANAGER', 'OPERATOR'],
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
    module: 'PA',
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
    module: 'RECEIVING',
  },
  {
    to: '/pendencias-fiscais',
    label: 'Pendências Fiscais',
    icon: ClipboardCheck,
    roles: FISCAL,
    module: 'FISCAL_QUEUE',
  },
  {
    to: '/relatorios',
    label: 'Relatórios',
    icon: FileBarChart,
    roles: ['ADMIN', 'MANAGER', 'REVIEWER'],
    module: 'REPORTS',
  },
  { to: '/admin', label: 'Administração', icon: Settings, roles: ['ADMIN'] },
];

/** Contexto extra de permissão derivado do usuário logado. */
export interface NavAccess {
  /** Módulos liberados pela equipe (chega via /auth/me.extraModules). */
  extraModules?: string[];
}

/** True se o item está acessível ao perfil + módulos liberados. */
export function canSeeNav(
  item: NavItem,
  profile?: string,
  access?: NavAccess,
): boolean {
  if (!item.roles && !item.module) return true;
  const byProfile =
    !!item.roles && !!profile && item.roles.includes(profile as Profile);
  const byModule =
    !!item.module && !!access?.extraModules?.includes(item.module);
  return byProfile || byModule;
}
