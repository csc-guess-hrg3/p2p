/**
 * Catálogo fixo do Modo Demonstração (frontend-only).
 * Esses dados são plantados no localStorage ao ligar o modo demo.
 */

export interface DemoUser {
  username: string;
  name: string;
  profile: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'REVIEWER';
  description: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    username: 'demo.admin',
    name: 'Alice (Administradora)',
    profile: 'ADMIN',
    description:
      'Acesso total: usuários, equipes, alçadas, parâmetros e visualiza ' +
      'tudo independente de filial/CC.',
  },
  {
    username: 'demo.gestor',
    name: 'Bruno (Gestor)',
    profile: 'MANAGER',
    description:
      'Aprova requisições e PCs dentro da alçada (R$ 50.000). Acompanha ' +
      'consumo orçamentário da equipe.',
  },
  {
    username: 'demo.operador',
    name: 'Camila (Operadora)',
    profile: 'OPERATOR',
    description:
      'Cria requisições, converte em PC, simula envio ao fornecedor e ' +
      'registra recebimento.',
  },
  {
    username: 'demo.revisor',
    name: 'Daniel (Revisor Fiscal)',
    profile: 'REVIEWER',
    description:
      'Classifica fiscalmente as requisições (CTB + natureza). Atua como ' +
      'aprovador final (alçada ilimitada).',
  },
];

export function findDemoUser(username: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.username === username.toLowerCase());
}

/**
 * Vendedores demo — espelham as entradas plantadas em
 * `state.lojaVendedores` (seed). Usados pelo bloco demo do login no
 * modo "Loja" para mostrar atalhos de acesso de vendedor.
 */
export interface DemoStoreUser {
  cpf: string;
  cpfMasked: string;
  name: string;
  branchHint: string;
  needsSetup: boolean;
  description: string;
}

export const DEMO_STORE_USERS: DemoStoreUser[] = [
  {
    cpf: '11122233344',
    cpfMasked: '111.222.333-44',
    name: 'Ana Vendedora',
    branchHint: 'Matriz SP + Rio',
    needsSetup: true,
    description:
      'Primeiro acesso — vai abrir a tela de definir senha. Atua em 2 filiais.',
  },
  {
    cpf: '55566677788',
    cpfMasked: '555.666.777-88',
    name: 'Beto Loja',
    branchHint: 'CD Campinas',
    needsSetup: false,
    description: 'Senha já cadastrada (demo1234) — entra direto.',
  },
];

export const PROFILE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  REVIEWER: 'Revisor',
};
