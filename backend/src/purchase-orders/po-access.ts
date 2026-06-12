import { ForbiddenException } from '@nestjs/common';
import { UserProfile } from '../common/enums';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Isolamento de acesso a um Pedido de Compra.
 *
 * - Pedido P2P (origin P2P): além da empresa, não-admin só acessa pedidos da
 *   PRÓPRIA EQUIPE (via `po.teamId`, com fallback p/ a requisição de origem).
 *   Sem isto, operações por `:id` (detalhe, histórico, cancelar, editar) eram
 *   um IDOR cross-equipe (auditoria P1-1).
 * - Pedido EXTERNO (importado do Linx): não tem requisição nem equipe própria
 *   — visível por EMPRESA (qualquer usuário habilitado na empresa). Decisão de
 *   produto do cutover: o pedido é uma entidade única, a flag `origin` só
 *   distingue externo × plataforma.
 *
 * O caller deve carregar o PO incluindo os escalares (`origin`, `teamId`) e
 * `requisition: { select: { teamId } }`.
 */
export function assertPoTeamAccess(
  user: AuthenticatedUser,
  po: {
    companyId: string;
    origin?: string;
    teamId?: string | null;
    requisition?: { teamId: string | null } | null;
  },
): void {
  if (!user.companyIds.includes(po.companyId)) {
    throw new ForbiddenException('Sem acesso a este pedido.');
  }
  // EXTERNO: a checagem de empresa acima já basta.
  if (po.origin === 'EXTERNO') return;
  const teamId = po.teamId ?? po.requisition?.teamId ?? null;
  if (user.profile !== UserProfile.ADMIN && teamId !== user.teamId) {
    throw new ForbiddenException('Sem acesso a este pedido.');
  }
}
