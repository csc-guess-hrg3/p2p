import type { AuthenticatedUser } from './auth.types';

/**
 * Conta PADRÃO de bootstrap do P2P (criada pelo seed-admin). Email canônico e
 * único no schema. É a ÚNICA conta que enxerga registros ÓRFÃOS (sem dono) —
 * hoje: os pedidos externos importados do Linx cujo solicitante (REQUERIDO_POR)
 * não existe no P2P. NÃO é "todo perfil ADMIN": é só esta conta específica.
 * Decisão de produto (PO): os demais admins veem os pedidos de outros apenas
 * entrando no modo SIMULAÇÃO — e um pedido órfão não tem quem simular, então
 * fica reservado a esta conta.
 *
 * Observação: sob simulação a identidade EFETIVA é a do alvo, então
 * `user.email` deixa de ser o da conta padrão — o que é o comportamento correto
 * (ao simular alguém, você vê como aquele alguém).
 */
export const DEFAULT_ADMIN_EMAIL = 'admin@p2p.local';

export function isDefaultAdmin(user: Pick<AuthenticatedUser, 'email'>): boolean {
  return (user.email ?? '').toLowerCase() === DEFAULT_ADMIN_EMAIL;
}
