import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LinxErpService } from '../integration/linx-erp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApprovalsService } from '../approvals/approvals.service';
import {
  NotificationType,
  RequisitionStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { ReturnSupplierValidationDto } from './dto/return-supplier-validation.dto';
import { QuerySupplierValidationsDto } from './dto/query-supplier-validations.dto';

const REQ_INCLUDE = {
  requisition: {
    select: {
      id: true,
      number: true,
      totalAmount: true,
      supplierName: true,
      supplierCnpj: true,
      supplierFantasia: true,
      supplierUf: true,
      status: true,
      requester: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.SupplierValidationInclude;

/**
 * Validação de fornecedor novo (Revisor) — RN do André.
 *
 * Quando a requisição traz um fornecedor NÃO cadastrado no ERP, ela para num
 * gate ANTES da cadeia do gestor: o Revisor confere os dados e Aprova (cadastra
 * no Linx + segue pra aprovação) ou Devolve com justificativa (volta pro
 * solicitante). O PedCom não é emitido enquanto o fornecedor não é validado
 * (guarda no conversor). O "quem é Revisor" segue a mesma regra da fila fiscal:
 * Admin ou membro da equipe Fiscal.
 */
@Injectable()
export class SupplierValidationService {
  private readonly logger = new Logger(SupplierValidationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly linx: LinxErpService,
    private readonly notifications: NotificationsService,
    private readonly approvals: ApprovalsService,
  ) {}

  /** O usuário valida fornecedor? Admin sempre; senão, equipe Fiscal. */
  private async isReviewer(user: AuthenticatedUser): Promise<boolean> {
    if (user.profile === UserProfile.ADMIN) return true;
    if (!user.teamId) return false;
    const team = await this.prisma.team.findUnique({
      where: { id: user.teamId },
    });
    return !!team?.isFiscal;
  }

  private async assertReviewer(user: AuthenticatedUser): Promise<void> {
    if (!(await this.isReviewer(user))) {
      throw new ForbiddenException(
        'Apenas a equipe Fiscal/Revisor pode validar fornecedores novos.',
      );
    }
  }

  /**
   * Abre (ou reabre, após devolução) o gate de validação de fornecedor de uma
   * requisição: cria/reseta a SupplierValidation em PENDING, coloca a
   * requisição em SUPPLIER_VALIDATION, marca a submissão e avisa os revisores.
   * Chamado pelo `submit` da requisição quando `needsSupplierErpCreation`.
   */
  async openGate(req: {
    id: string;
    companyId: string;
    number: string;
    supplierCnpj: string | null;
  }): Promise<void> {
    const cnpj = (req.supplierCnpj ?? '').replace(/\D/g, '');
    // Limpa qualquer cadeia de aprovação em curso — o gate pode abrir no MEIO
    // da aprovação (quando uma cotação vencedora traz fornecedor novo). Os
    // steps são regerados quando a validação é aprovada.
    await this.approvals.resetForRequisition(req.id);
    await this.prisma.supplierValidation.upsert({
      where: { requisitionId: req.id },
      create: {
        companyId: req.companyId,
        requisitionId: req.id,
        status: 'PENDING',
        supplierCnpj: cnpj,
      },
      update: {
        status: 'PENDING',
        supplierCnpj: cnpj,
        supplierErpCode: null,
        validatorId: null,
        justification: null,
        decidedAt: null,
      },
    });
    // Preserva submittedAt se a requisição já foi submetida (caso do gate no
    // meio da aprovação); senão marca agora.
    const current = await this.prisma.requisition.findUniqueOrThrow({
      where: { id: req.id },
      select: { submittedAt: true },
    });
    await this.prisma.requisition.update({
      where: { id: req.id },
      data: {
        status: RequisitionStatus.SUPPLIER_VALIDATION,
        submittedAt: current.submittedAt ?? new Date(),
      },
    });
    await this.notifyReviewers(req.companyId, req.number, req.id);
  }

  /** Avisa os revisores (equipe Fiscal) da empresa que há fornecedor a validar. */
  private async notifyReviewers(
    companyId: string,
    documentNumber: string,
    requisitionId: string,
  ): Promise<void> {
    const teams = await this.prisma.team.findMany({
      where: { isFiscal: true },
      select: { id: true },
    });
    if (teams.length === 0) return;
    const reviewers = await this.prisma.user.findMany({
      where: {
        teamId: { in: teams.map((t) => t.id) },
        status: 'ACTIVE',
        deletedAt: null,
        companies: { some: { companyId } },
      },
      select: { id: true },
    });
    for (const r of reviewers) {
      await this.notifications.create({
        companyId,
        userId: r.id,
        type: NotificationType.APPROVAL_REQUIRED,
        title: `Fornecedor novo para validar: ${documentNumber}`,
        body: `A requisição ${documentNumber} traz um fornecedor não cadastrado aguardando sua validação.`,
        entityType: 'SUPPLIER_VALIDATION',
        entityId: requisitionId,
        sendEmail: true,
      });
    }
  }

  /**
   * Fila de validações. Revisor vê todas do seu escopo de empresas; os demais
   * (o solicitante) veem só as das próprias requisições.
   */
  async findAll(user: AuthenticatedUser, query: QuerySupplierValidationsDto) {
    const reviewer = await this.isReviewer(user);
    const { companyId, status, skip = 0, take = 50 } = query;
    const where: Prisma.SupplierValidationWhereInput = {
      companyId:
        companyId && user.companyIds.includes(companyId)
          ? companyId
          : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(reviewer ? {} : { requisition: { requesterId: user.id } }),
    };
    const [data, total] = await Promise.all([
      this.prisma.supplierValidation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        include: REQ_INCLUDE,
      }),
      this.prisma.supplierValidation.count({ where }),
    ]);
    return { data, total, skip, take, isReviewer: reviewer };
  }

  /** Detalhe de uma validação (por requisição). */
  async findOne(user: AuthenticatedUser, requisitionId: string) {
    const sv = await this.prisma.supplierValidation.findUnique({
      where: { requisitionId },
      include: REQ_INCLUDE,
    });
    if (!sv) throw new NotFoundException('Validação de fornecedor não encontrada.');
    if (!user.companyIds.includes(sv.companyId)) {
      throw new ForbiddenException('Sem acesso a esta validação.');
    }
    return sv;
  }

  /**
   * Aprova: cadastra o fornecedor no Linx (idempotente, usa os dados da
   * requisição) e retoma a requisição pra cadeia de aprovação do gestor.
   */
  async approve(user: AuthenticatedUser, requisitionId: string) {
    await this.assertReviewer(user);
    const sv = await this.findOne(user, requisitionId);
    if (sv.status !== 'PENDING') {
      throw new BadRequestException('Esta validação já foi resolvida.');
    }
    // Cadastra no ERP (CADASTRO_CLI_FOR + FORNECEDORES) — idempotente por CNPJ.
    // Também seta req.supplierErpCode e needsSupplierErpCreation=false.
    const clifor = await this.linx.ensureSupplierForRequisition(requisitionId);

    await this.prisma.supplierValidation.update({
      where: { requisitionId },
      data: {
        status: 'APPROVED',
        supplierErpCode: clifor,
        validatorId: user.id,
        decidedAt: new Date(),
      },
    });

    // Só agora a requisição entra na cadeia de aprovação do gestor.
    await this.approvals.startRequisitionApprovalChain(requisitionId);

    await this.notifications.create({
      companyId: sv.companyId,
      userId: sv.requisition.requester.id,
      type: NotificationType.GENERAL,
      title: `Fornecedor validado: ${sv.requisition.number}`,
      body: `O fornecedor da requisição ${sv.requisition.number} foi cadastrado no ERP (${clifor}) e ela seguiu para aprovação.`,
      entityType: 'REQUISITION',
      entityId: requisitionId,
    });

    return this.findOne(user, requisitionId);
  }

  /**
   * Devolve: registra a justificativa e manda a requisição de volta pro
   * solicitante (DRAFT) — ele ajusta os dados do fornecedor e reenvia (o gate
   * reabre na próxima submissão).
   */
  async returnToRequester(
    user: AuthenticatedUser,
    requisitionId: string,
    dto: ReturnSupplierValidationDto,
  ) {
    await this.assertReviewer(user);
    const sv = await this.findOne(user, requisitionId);
    if (sv.status !== 'PENDING') {
      throw new BadRequestException('Esta validação já foi resolvida.');
    }
    await this.prisma.supplierValidation.update({
      where: { requisitionId },
      data: {
        status: 'RETURNED',
        justification: dto.justification,
        validatorId: user.id,
        decidedAt: new Date(),
      },
    });
    await this.prisma.requisition.update({
      where: { id: requisitionId },
      data: { status: RequisitionStatus.DRAFT },
    });
    await this.notifications.create({
      companyId: sv.companyId,
      userId: sv.requisition.requester.id,
      type: NotificationType.GENERAL,
      title: `Fornecedor devolvido: ${sv.requisition.number}`,
      body: `A validação do fornecedor da requisição ${sv.requisition.number} foi devolvida. Motivo: ${dto.justification}. Ajuste os dados e reenvie.`,
      entityType: 'REQUISITION',
      entityId: requisitionId,
    });
    return this.findOne(user, requisitionId);
  }
}
