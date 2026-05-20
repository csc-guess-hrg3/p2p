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

export const PROFILE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gestor',
  OPERATOR: 'Operador',
  REVIEWER: 'Revisor',
};
