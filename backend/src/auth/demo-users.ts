import { UserProfile } from '../common/enums';

/**
 * Catálogo fixo de usuários do "Modo Demonstração".
 *
 * Para que o login demo funcione é preciso (1) `DEMO_MODE_ENABLED=true`
 * no .env e (2) ter rodado o seed `node seed-demo.js` — ele cria a empresa
 * DEMO, a equipe demo e estes 4 usuários.
 *
 * IMPORTANTE: estes usuários NUNCA são criados em produção a menos que
 * `DEMO_MODE_ENABLED=true`. O endpoint `/auth/demo-login` simplesmente
 * recusa se a flag estiver desligada.
 */
export interface DemoUser {
  username: string;
  password: string; // só para exibição/auto-fill — não verificada server-side
  email: string;
  name: string;
  profile: string;
  description: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    username: 'demo.admin',
    password: 'demo1234',
    email: 'admin@demo.local',
    name: 'Alice (Administradora)',
    profile: UserProfile.ADMIN,
    description:
      'Acesso total: configura usuários, equipes, alçadas, parâmetros e ' +
      'visualiza tudo independente de filial/CC.',
  },
  {
    username: 'demo.gestor',
    password: 'demo1234',
    email: 'gestor@demo.local',
    name: 'Bruno (Gestor)',
    profile: UserProfile.MANAGER,
    description:
      'Aprova requisições e PCs dentro da alçada, acompanha consumo ' +
      'orçamentário da equipe.',
  },
  {
    username: 'demo.operador',
    password: 'demo1234',
    email: 'operador@demo.local',
    name: 'Camila (Operadora)',
    profile: UserProfile.OPERATOR,
    description:
      'Cria requisições, converte em PC, envia ao fornecedor e registra ' +
      'recebimento.',
  },
  {
    username: 'demo.revisor',
    password: 'demo1234',
    email: 'revisor@demo.local',
    name: 'Daniel (Revisor Fiscal)',
    profile: UserProfile.REVIEWER,
    description:
      'Classifica fiscalmente as requisições (CTB + natureza) e valida ' +
      'documentos antes da escrituração.',
  },
];

export function findDemoUser(username: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.username === username.toLowerCase());
}

export function isDemoModeEnabled(): boolean {
  const v = (process.env.DEMO_MODE_ENABLED ?? '').toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}
