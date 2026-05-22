import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { QueryFundRequestsDto } from './dto/query-fund-requests.dto';

/**
 * Solicitações de Verba (SV).
 *
 * No MVP a SV é sempre criada pela conversão de uma requisição NF_FUTURA
 * (adiantamento — pagar antes da NF), em conjunto com o Pedido de Compra.
 * Este serviço expõe apenas leitura; a criação acontece em
 * PurchaseOrdersService.convert.
 */
@Injectable()
export class FundRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista solicitações de verba do escopo do usuário. */
  async findAll(user: AuthenticatedUser, query: QueryFundRequestsDto) {
    const { companyId, status, search, skip = 0, take = 50 } = query;
    if (companyId && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const where: Prisma.FundRequestWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(search ? { number: { contains: search } } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.fundRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
        },
      }),
      this.prisma.fundRequest.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /** Detalhe de uma solicitação de verba. */
  async findOne(user: AuthenticatedUser, id: string) {
    const sv = await this.prisma.fundRequest.findUnique({
      where: { id },
      include: {
        items: true,
        requester: { select: { id: true, name: true } },
        requisition: { select: { id: true, number: true } },
        purchaseOrder: { select: { id: true, number: true } },
      },
    });
    if (!sv || sv.deletedAt) {
      throw new NotFoundException('Solicitação de verba não encontrada.');
    }
    if (!user.companyIds.includes(sv.companyId)) {
      throw new ForbiddenException('Sem acesso a esta solicitação.');
    }
    return sv;
  }

  /**
   * Timeline da SV — espelha PO/Req.history: criação, submissão,
   * aprovação/rejeição, integração no ERP e decisões da cadeia.
   */
  async history(user: AuthenticatedUser, id: string) {
    const sv = await this.findOne(user, id);
    type Evt = {
      at: string;
      kind: string;
      label: string;
      who?: string | null;
      detail?: string | null;
    };
    const events: Evt[] = [];
    events.push({
      at: sv.createdAt.toISOString(),
      kind: 'created',
      label: 'Solicitação criada',
      who: sv.requester?.name ?? null,
    });
    if (sv.submittedAt) {
      events.push({
        at: sv.submittedAt.toISOString(),
        kind: 'submitted',
        label: 'Enviada para aprovação',
      });
    }
    if (sv.approvedAt) {
      events.push({
        at: sv.approvedAt.toISOString(),
        kind: 'approved',
        label: 'Solicitação aprovada',
      });
    }
    if (sv.rejectedAt) {
      events.push({
        at: sv.rejectedAt.toISOString(),
        kind: 'rejected',
        label: 'Solicitação rejeitada',
        detail: sv.rejectionReason,
      });
    }
    if (sv.integratedAt) {
      events.push({
        at: sv.integratedAt.toISOString(),
        kind: 'integrated',
        label: `Integrada ao ERP (${sv.erpSolicitacao ?? 'sem número'})`,
      });
    }
    const steps = await this.prisma.approvalStep.findMany({
      where: { fundRequestId: id, status: { not: 'PENDING' } },
      orderBy: { decidedAt: 'desc' },
      include: { decidedBy: { select: { name: true } } },
    });
    for (const s of steps) {
      if (!s.decidedAt) continue;
      events.push({
        at: s.decidedAt.toISOString(),
        kind:
          s.status === 'REVISION'
            ? 'step-revision'
            : `step-${s.status.toLowerCase()}`,
        label:
          s.status === 'REVISION'
            ? `${s.levelName}: devolveu para revisão`
            : `${s.levelName}: ${
                s.status === 'APPROVED' ? 'aprovou' : 'reprovou'
              }`,
        who: s.decidedBy?.name ?? null,
        detail: s.comments,
      });
    }
    return events.sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
    );
  }
}
