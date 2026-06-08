import { ForbiddenException } from '@nestjs/common';
import { UserProfile } from '../common/enums';
import type { AuthenticatedUser } from '../auth/auth.types';

/**
 * Isolamento de acesso a um Pedido de Compra: além da empresa, não-admin
 * só acessa pedidos da PRÓPRIA EQUIPE (via a requisição de origem) —
 * espelha o filtro de `findAll`. Sem isto, operações por `:id` (detalhe,
 * histórico, cancelar, editar) eram um IDOR cross-equipe (auditoria P1-1).
 *
 * O caller deve carregar o PO incluindo `requisition: { select: { teamId } }`.
 */
export function assertPoTeamAccess(
  user: AuthenticatedUser,
  po: {
    companyId: string;
    requisition?: { teamId: string | null } | null;
  },
): void {
  if (!user.companyIds.includes(po.companyId)) {
    throw new ForbiddenException('Sem acesso a este pedido.');
  }
  if (
    user.profile !== UserProfile.ADMIN &&
    po.requisition?.teamId !== user.teamId
  ) {
    throw new ForbiddenException('Sem acesso a este pedido.');
  }
}
