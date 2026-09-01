import { ForbiddenException } from '@nestjs/common';
import { UserProfile } from '../common/enums';
import type { AuthenticatedUser } from '../auth/auth.types';
import { isDefaultAdmin } from '../auth/default-admin';

/**
 * Isolamento de acesso a um Pedido de Compra — pela identidade EFETIVA.
 *
 * Um PC é UMA ponta da cadeia de compra (requisição → PC → SV). São "donos"
 * da mesma compra e podem abrir o PC:
 *  - o COMPRADOR (buyerId — quem converteu);
 *  - o SOLICITANTE da requisição de origem (requisition.requesterId) — vê o PC
 *    gerado da própria requisição, mesmo que outro tenha convertido;
 *  - o REVISOR fiscal — casa NF-e ↔ PC (fiscal-documents), de qualquer um.
 * Exceção: a conta PADRÃO admin abre os PCs ÓRFÃOS (buyerId nulo, externos do
 * Linx sem dono), que não têm quem simular. Os demais (inclusive admin) abrem o
 * de outro via modo SIMULAÇÃO (decisão PO). O caller carrega o PO com
 * `companyId`, `buyerId` e `requisition: { requesterId }`.
 */
export function assertPoTeamAccess(
  user: AuthenticatedUser,
  po: {
    companyId: string;
    buyerId: string | null;
    requisition?: { requesterId: string | null } | null;
  },
): void {
  if (!user.companyIds.includes(po.companyId)) {
    throw new ForbiddenException('Sem acesso a este pedido.');
  }
  const isOwner =
    po.buyerId === user.id || po.requisition?.requesterId === user.id;
  const isReviewer = user.profile === UserProfile.REVIEWER;
  const isOrphanForDefaultAdmin =
    po.buyerId === null && isDefaultAdmin(user);
  if (!isOwner && !isReviewer && !isOrphanForDefaultAdmin) {
    throw new ForbiddenException('Sem acesso a este pedido.');
  }
}
