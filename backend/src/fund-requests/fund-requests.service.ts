import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { QueryFundRequestsDto } from './dto/query-fund-requests.dto';
import { CreateFundRequestDto } from './dto/create-fund-request.dto';
import { LinxErpService } from '../integration/linx-erp.service';
import { NumberingService } from '../numbering/numbering.service';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  ApprovalEntityType,
  FundRequestStatus,
  UserProfile,
} from '../common/enums';

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly linx: LinxErpService,
    private readonly numbering: NumberingService,
    private readonly approvals: ApprovalsService,
  ) {}

  /**
   * Cria uma Solicitação de Verba AVULSA (pagamento sem NF — taxas, reembolsos,
   * contribuições). Nasce em DRAFT; a integração ao Linx só acontece após a
   * aprovação (runPostApprovalErpEffects). Diferente da SV de adiantamento, que
   * nasce junto do PC já aprovada — aqui não há requisição/PC de origem.
   */
  async create(user: AuthenticatedUser, dto: CreateFundRequestDto) {
    if (!user.companyIds.includes(dto.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, deletedAt: null },
      select: { id: true, code: true },
    });
    if (!company) throw new BadRequestException('Empresa inválida.');

    const total = dto.items.reduce((s, it) => s + Number(it.amount), 0);
    const number = await this.numbering.next(company.code, 'SV');

    return this.prisma.fundRequest.create({
      data: {
        number,
        companyId: company.id,
        requesterId: user.id,
        title: dto.title.trim(),
        status: FundRequestStatus.DRAFT,
        totalAmount: total,
        items: {
          create: dto.items.map((it) => ({
            itemErpCode: it.itemErpCode ?? null,
            description: it.description,
            beneficiaryName: it.beneficiaryName,
            beneficiaryBank: it.beneficiaryBank ?? null,
            beneficiaryAgency: it.beneficiaryAgency ?? null,
            beneficiaryAccount: it.beneficiaryAccount ?? null,
            accountingAccount: it.accountingAccount,
            accountName: it.accountName ?? null,
            branchRateioCode: it.branchRateioCode,
            branchRateioDesc: it.branchRateioDesc ?? null,
            costCenterRateioCode: it.costCenterRateioCode,
            costCenterRateioDesc: it.costCenterRateioDesc ?? null,
            amount: it.amount,
            dueDate: new Date(it.dueDate),
            notes: it.notes ?? null,
          })),
        },
      },
      include: { items: true },
    });
  }

  /**
   * Submete a SV avulsa para aprovação. Usa a alçada da equipe do SOLICITANTE
   * (mesma regra das requisições) e o mesmo fail-safe: equipe sem alçada
   * configurada BLOQUEIA (não auto-aprova). A integração ao Linx acontece na
   * aprovação final (runPostApprovalErpEffects, ramo FUND_REQUEST).
   */
  async submit(user: AuthenticatedUser, id: string) {
    const sv = await this.prisma.fundRequest.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sv || sv.deletedAt) {
      throw new NotFoundException('Solicitação de verba não encontrada.');
    }
    if (!user.companyIds.includes(sv.companyId)) {
      throw new ForbiddenException('Sem acesso a esta solicitação.');
    }
    if (sv.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode submeter.');
    }
    if (sv.status !== FundRequestStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas solicitações em rascunho podem ser submetidas.',
      );
    }
    if (sv.items.length === 0) {
      throw new BadRequestException('A solicitação não tem itens.');
    }

    // Fail-safe (decisão PO): bloqueia se a equipe do solicitante não tem
    // alçada configurada — nunca auto-aprova pagamento.
    await this.approvals.assertChainConfigured(user.teamId);
    await this.approvals.resetForFundRequest(sv.id);
    const firstLevel = await this.approvals.startApproval({
      companyId: sv.companyId,
      teamId: user.teamId,
      entityType: ApprovalEntityType.FUND_REQUEST,
      fundRequestId: sv.id,
      amount: Number(sv.totalAmount),
      documentNumber: sv.number,
    });

    await this.prisma.fundRequest.update({
      where: { id },
      data: {
        status: FundRequestStatus.IN_APPROVAL,
        submittedAt: new Date(),
        currentTierLevel: firstLevel ?? undefined,
      },
    });
    return this.findOne(user, id);
  }

  /**
   * Reprocessa a integração de uma SV no Linx.
   *
   * A SV é criada com status APPROVED no convert() do PC; a integração
   * com o Linx é disparada na sequência. Se a integração falhar (campo
   * obrigatório, restrição do trigger, indisponibilidade do ERP, etc.),
   * o erro fica em `lastErpError` e o usuário pode reintegrar por aqui.
   *
   * Idempotência: se a SV já tem `erpSolicitacao`, devolve o número
   * existente sem nova gravação. Se não tem mas o Linx encontra uma SV
   * com o mesmo OBS (P2P <number>), faz re-acoplamento.
   */
  async retryErp(user: AuthenticatedUser, id: string) {
    const sv = await this.prisma.fundRequest.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sv || sv.deletedAt) {
      throw new NotFoundException('Solicitação de verba não encontrada.');
    }
    if (!user.companyIds.includes(sv.companyId)) {
      throw new ForbiddenException('Sem acesso a esta solicitação.');
    }
    if (sv.status === FundRequestStatus.DRAFT) {
      throw new BadRequestException(
        'SV ainda não foi aprovada — não há o que integrar no Linx.',
      );
    }
    const { solicitacao } = await this.linx.gravarSolicitacaoVerba(sv);
    // gravarSolicitacaoVerba já atualiza erpSolicitacao + integratedAt
    // + limpa lastErpError. Aqui só promovemos o status pra INTEGRATED.
    await this.prisma.fundRequest.update({
      where: { id: sv.id },
      data: { status: FundRequestStatus.INTEGRATED },
    });
    return { erpSolicitacao: solicitacao };
  }

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
      // Escopo de equipe (igual às requisições): não-admin só vê as SVs da
      // PRÓPRIA equipe (via a equipe do solicitante) — antes via TODAS da
      // empresa, o que expunha SV de outros usuários (bug visto na simulação).
      ...(user.profile !== UserProfile.ADMIN
        ? { requester: { teamId: user.teamId } }
        : {}),
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
        requester: { select: { id: true, name: true, teamId: true } },
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
    // Escopo de equipe: não-admin só abre SV da própria equipe (fecha o
    // acesso direto por id a SV de outro usuário/equipe).
    if (
      user.profile !== UserProfile.ADMIN &&
      sv.requester?.teamId !== user.teamId
    ) {
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
