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
  Wallet,
  Receipt,
  Barcode,
  Landmark,
  Gavel,
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
  | 'RECEIVING'
  | 'FINANCE';

export const MODULE_LABEL: Record<Module, string> = {
  PA: 'Produto Acabado',
  FISCAL_QUEUE: 'Pendências Fiscais',
  REPORTS: 'Relatórios',
  RECEIVING: 'Recebimentos',
  FINANCE: 'Financeiro',
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
  /**
   * Chave usada pra buscar o contador exibido como badge ao lado do label.
   * A Sidebar mapeia a chave para uma query (ex.: 'fiscal-pending' →
   * fiscal-item-requests com status PENDING).
   */
  badgeKey?: 'fiscal-pending';
}

/**
 * Grupo de navegação (Fiscal, Financeiro). Render é colapsável; quando
 * todos os filhos estão fora do alcance do usuário, o grupo some inteiro.
 *
 * `children` pode conter NavItems (rotas) ou outros NavGroups — assim
 * dá pra ter Financeiro > Contas a Pagar > [Títulos, DDAs, Provisões]
 * sem precisar de outro tipo. Limite prático: 2 níveis de aninhamento
 * pra não virar árvore que ninguém navega.
 */
export interface NavGroup {
  /** Chave única usada pra persistir o estado expandido/colapsado. */
  key: string;
  label: string;
  icon: LucideIcon;
  children: NavEntry[];
}

/** Top-level pode ser item solto ou grupo. */
export type NavEntry = NavItem | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).children !== undefined;
}

const ALL: Profile[] = ['ADMIN', 'MANAGER', 'OPERATOR', 'REVIEWER'];
const APPROVERS: Profile[] = ['ADMIN', 'MANAGER'];
const FISCAL: Profile[] = ['ADMIN', 'REVIEWER'];
// FINANCE segue o padrão FISCAL_QUEUE: só Admin vê por role, demais
// (incluindo Manager) só veem se a equipe tiver o módulo liberado.
// Quem opera CP no dia a dia entra na equipe Financeiro.
const FINANCE_ROLES: Profile[] = ['ADMIN'];

export const NAV_ITEMS: NavEntry[] = [
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
    // SV continua acessível no top-level pro solicitante ver as próprias.
    // No grupo Financeiro a mesma SV aparece como "provisão/adiantamento",
    // com ações distintas (gerar IAD vs ITP).
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
  // ─── Grupo Fiscal ───
  {
    key: 'fiscal',
    label: 'Fiscal',
    icon: Gavel,
    children: [
      {
        to: '/fiscal/pendencias-fiscais',
        label: 'Pendências Fiscais',
        icon: ClipboardCheck,
        roles: FISCAL,
        module: 'FISCAL_QUEUE',
        badgeKey: 'fiscal-pending',
      },
      {
        to: '/fiscal/notas-fiscais',
        label: 'Notas Fiscais',
        icon: ClipboardCheck,
        roles: FISCAL,
        module: 'FISCAL_QUEUE',
      },
    ],
  },
  // ─── Grupo Financeiro ───
  // Contas a Pagar é sub-grupo pra deixar espaço lateral pra outras
  // áreas futuras dentro de Financeiro (caixa, fluxo, conciliação
  // bancária etc.) sem entupir o top-level.
  {
    key: 'financeiro',
    label: 'Financeiro',
    icon: Landmark,
    children: [
      {
        key: 'financeiro.contas-pagar',
        label: 'Contas a Pagar',
        icon: Wallet,
        children: [
          {
            to: '/financeiro/contas-pagar',
            label: 'Títulos a Pagar (ITP)',
            icon: Wallet,
            roles: FINANCE_ROLES,
            module: 'FINANCE',
          },
          {
            to: '/financeiro/iads',
            label: 'Adiantamentos (IAD)',
            icon: Banknote,
            roles: FINANCE_ROLES,
            module: 'FINANCE',
          },
          {
            to: '/financeiro/ddas',
            label: 'DDAs',
            icon: Barcode,
            roles: FINANCE_ROLES,
            module: 'FINANCE',
          },
          {
            to: '/financeiro/provisoes',
            label: 'Provisões',
            icon: Receipt,
            roles: FINANCE_ROLES,
            module: 'FINANCE',
          },
        ],
      },
    ],
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

/**
 * Filtra entries recursivamente — grupos somem quando nenhum filho
 * (folha ou sub-grupo) sobra após o filtro. Funciona com aninhamento
 * de 2 níveis (Financeiro > Contas a Pagar > Títulos/DDAs/Provisões).
 */
export function filterNavEntries(
  entries: NavEntry[],
  profile?: string,
  access?: NavAccess,
): NavEntry[] {
  const out: NavEntry[] = [];
  for (const entry of entries) {
    if (isNavGroup(entry)) {
      const visibleChildren = filterNavEntries(
        entry.children,
        profile,
        access,
      );
      if (visibleChildren.length > 0) {
        out.push({ ...entry, children: visibleChildren });
      }
    } else if (canSeeNav(entry, profile, access)) {
      out.push(entry);
    }
  }
  return out;
}
