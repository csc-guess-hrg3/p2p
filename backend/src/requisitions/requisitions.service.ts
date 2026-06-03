import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { CnpjPublicService } from '../integration/cnpj-public.service';
import { NumberingService } from '../numbering/numbering.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { SettingsService } from '../settings/settings.service';
import { SETTING_KEYS } from '../settings/setting-defs';
import {
  ApprovalEntityType,
  RequisitionStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateRequisitionDto,
  CreateRequisitionItemDto,
} from './dto/create-requisition.dto';
import { UpdateRequisitionDto } from './dto/update-requisition.dto';
import { QueryRequisitionsDto } from './dto/query-requisitions.dto';
import {
  isQuotationWaiverReason,
  QUOTATION_WAIVER_LABELS,
  QUOTATION_WAIVER_MIN_NOTE,
  QUOTATION_WAIVER_REASONS,
  type QuotationWaiverReason,
} from './quotation-waiver';

@Injectable()
export class RequisitionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly cnpjPublic: CnpjPublicService,
    private readonly numbering: NumberingService,
    private readonly approvals: ApprovalsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Resolução do fornecedor — duas vias:
   *
   *  1) `supplierErpCode` informado → procura no ERP. Devolve os dados
   *     já cadastrados; `needsErp = false`.
   *
   *  2) `supplierErpCode` vazio + `supplierCnpj` informado → "fornecedor
   *     externo". Lookup em ordem:
   *       a) ERP por CNPJ (pode estar lá, só o solicitante não escolheu)
   *       b) BrasilAPI (Receita Federal)
   *       c) Nome digitado manualmente (`supplierNameOverride`)
   *     `needsErp = true` SE o ERP não tem o CNPJ (vai ser criado quando
   *     a requisição for aprovada).
   *
   * Devolve um objeto pronto pra usar nos campos do Requisition.
   */
  private async resolveSupplierForRequisition(
    companyCode: string,
    dto: {
      supplierErpCode?: string;
      supplierCnpj?: string;
      supplierNameOverride?: string;
    },
  ): Promise<{
    supplierErpCode: string | null;
    supplierName: string;
    supplierCnpj: string | null;
    supplierFantasia: string | null;
    supplierEmail: string | null;
    supplierTelefone: string | null;
    supplierLogradouro: string | null;
    supplierNumero: string | null;
    supplierBairro: string | null;
    supplierCidade: string | null;
    supplierUf: string | null;
    supplierCep: string | null;
    supplierCnae: string | null;
    needsSupplierErpCreation: boolean;
  }> {
    const erpCode = dto.supplierErpCode?.trim();
    if (erpCode) {
      const sup = await this.integration.findSupplier(companyCode, erpCode);
      if (!sup) {
        throw new BadRequestException(`Fornecedor inválido: ${erpCode}`);
      }
      return {
        supplierErpCode: erpCode,
        supplierName: sup.nome,
        supplierCnpj: (sup.cnpjCpf ?? '').replace(/\D/g, '') || null,
        supplierFantasia: null,
        supplierEmail: sup.email ?? null,
        supplierTelefone: sup.telefone ?? null,
        supplierLogradouro: null,
        supplierNumero: null,
        supplierBairro: null,
        supplierCidade: null,
        supplierUf: null,
        supplierCep: null,
        supplierCnae: null,
        needsSupplierErpCreation: false,
      };
    }
    // Sem código ERP — fornecedor externo via CNPJ.
    const cnpj = (dto.supplierCnpj ?? '').replace(/\D/g, '');
    if (cnpj.length < 11 || cnpj.length > 14) {
      throw new BadRequestException(
        'Informe um fornecedor cadastrado OU um CNPJ válido para fornecedor externo.',
      );
    }
    // (a) talvez exista no ERP por CNPJ — usa, ignora o "externo".
    const erpByCnpj = await this.integration.findSupplierByCnpj(
      companyCode,
      cnpj,
    );
    if (erpByCnpj) {
      return {
        supplierErpCode: erpByCnpj.codigo,
        supplierName: erpByCnpj.nome,
        supplierCnpj: cnpj,
        supplierFantasia: null,
        supplierEmail: erpByCnpj.email ?? null,
        supplierTelefone: erpByCnpj.telefone ?? null,
        supplierLogradouro: null,
        supplierNumero: null,
        supplierBairro: null,
        supplierCidade: null,
        supplierUf: null,
        supplierCep: null,
        supplierCnae: null,
        needsSupplierErpCreation: false,
      };
    }
    // (b) BrasilAPI
    let name = dto.supplierNameOverride?.trim() ?? '';
    let pub: Awaited<ReturnType<CnpjPublicService['lookup']>> | null = null;
    if (cnpj.length === 14) {
      pub = await this.cnpjPublic.lookup(cnpj);
      if (pub.found) name = pub.razaoSocial;
    }
    if (!name) {
      throw new BadRequestException(
        'Não foi possível identificar o fornecedor pelo CNPJ. Informe o nome do fornecedor manualmente.',
      );
    }
    const found = pub?.found ? pub : null;
    return {
      supplierErpCode: null,
      supplierName: name,
      supplierCnpj: cnpj,
      supplierFantasia: found?.nomeFantasia ?? null,
      supplierEmail: found?.email ?? null,
      supplierTelefone: found?.telefone ?? null,
      supplierLogradouro: found?.logradouro ?? null,
      supplierNumero: found?.numero ?? null,
      supplierBairro: found?.bairro ?? null,
      supplierCidade: found?.cidade ?? null,
      supplierUf: found?.uf ?? null,
      supplierCep: found?.cep ?? null,
      supplierCnae: found?.cnaePrincipal ?? null,
      needsSupplierErpCreation: true,
    };
  }

  /**
   * Verifica a regra de cotações mínimas (RN-REQ-02 / REQ-08) — Admin define
   * o threshold (valor da requisição a partir do qual exige cotações) e o
   * mínimo (quantas cotações) em SystemSetting. Threshold 0 desliga a regra.
   *
   * IMPORTANTE: o pedido original (fornecedor + itens + valores escolhidos
   * pelo solicitante) **conta como Cotação 1**. Logo, com minRequired=3 e o
   * solicitante anexando 2 cotações alternativas, atende a política. O
   * parâmetro `attachedQuotationsCount` é só as ANEXADAS — o +1 é interno.
   */
  private async assertQuotationsPolicy(
    companyId: string,
    totalAmount: number,
    attachedQuotationsCount: number,
  ): Promise<void> {
    const threshold = await this.settings.getNumber(
      companyId,
      SETTING_KEYS.REQUISITIONS_MIN_QUOTATIONS_THRESHOLD_AMOUNT,
    );
    if (threshold <= 0) return; // regra desligada
    if (totalAmount < threshold) return; // abaixo do gatilho
    const minRequired = await this.settings.getNumber(
      companyId,
      SETTING_KEYS.REQUISITIONS_MIN_QUOTATIONS_REQUIRED,
    );
    // +1 = a própria proposta do solicitante (Cotação 1 implícita).
    const totalCount = attachedQuotationsCount + 1;
    if (totalCount < minRequired) {
      const missing = minRequired - totalCount;
      const formatted = totalAmount.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      const thresholdFmt = threshold.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      throw new BadRequestException(
        `Requisição de ${formatted} exige ${minRequired} cotações no total ` +
          `(sua proposta + ${minRequired - 1} alternativas). ` +
          `Acima de ${thresholdFmt}. Faltam ${missing} cotação(ões) alternativa(s).`,
      );
    }
  }

  /** Garante que o usuário tem acesso à empresa e devolve o código do ERP. */
  private async resolveCompany(
    user: AuthenticatedUser,
    companyId: string,
  ): Promise<{ id: string; code: string }> {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company || company.deletedAt) {
      throw new BadRequestException('Empresa inválida.');
    }
    return { id: company.id, code: company.code };
  }

  /** Carrega os rateios liberados para a equipe na empresa. */
  private async loadTeamRateios(
    teamId: string | null,
    companyId: string,
  ): Promise<{ branch: Set<string>; cc: Set<string> } | null> {
    if (!teamId) return null; // sem equipe (ex.: admin) — sem restrição
    const [branch, cc] = await Promise.all([
      this.prisma.teamBranchRateio.findMany({ where: { teamId, companyId } }),
      this.prisma.teamCostCenterRateio.findMany({
        where: { teamId, companyId },
      }),
    ]);
    return {
      branch: new Set(branch.map((b) => b.branchRateioCode)),
      cc: new Set(cc.map((c) => c.costCenterRateioCode)),
    };
  }

  /**
   * Congela as linhas de um rateio: valida soma = 100% e calcula os
   * valores; a última linha absorve o resíduo de arredondamento.
   */
  private snapshotLines(
    kind: 'BRANCH' | 'COST_CENTER',
    rateioCode: string,
    rawLines: { targetCode: string; branchCode: string | null; percentage: number }[],
    total: number,
  ) {
    if (rawLines.length === 0) {
      throw new BadRequestException(
        `O rateio ${rateioCode} não tem linhas no ERP.`,
      );
    }
    const sumPct = rawLines.reduce((s, l) => s + l.percentage, 0);
    if (Math.abs(sumPct - 100) > 0.01) {
      throw new BadRequestException(
        `O rateio ${rateioCode} soma ${sumPct.toFixed(2)}% — deveria somar 100%.`,
      );
    }
    let allocated = 0;
    return rawLines.map((l, i) => {
      const isLast = i === rawLines.length - 1;
      const amount = isLast
        ? Number((total - allocated).toFixed(2))
        : Number(((total * l.percentage) / 100).toFixed(2));
      allocated += amount;
      return {
        kind,
        rateioCode,
        targetCode: l.targetCode,
        branchCode: l.branchCode,
        percentage: l.percentage,
        amount,
      };
    });
  }

  /** Valida itens contra o ERP (+ escopo da equipe) e monta os dados + total. */
  private async buildItems(
    companyCode: string,
    items: CreateRequisitionItemDto[],
    teamRateios: { branch: Set<string>; cc: Set<string> } | null,
  ) {
    const built: {
      fields: Prisma.RequisitionItemCreateWithoutRequisitionInput;
    }[] = [];
    let totalAmount = 0;

    for (const it of items) {
      const account = await this.integration.findAccount(
        companyCode,
        it.accountingAccount,
      );
      if (!account) {
        throw new BadRequestException(
          `Conta contábil inválida: ${it.accountingAccount}`,
        );
      }
      const branchRateio = await this.integration.findBranchRateio(
        companyCode,
        it.branchRateioCode,
      );
      if (!branchRateio) {
        throw new BadRequestException(
          `Rateio de filial inválido: ${it.branchRateioCode}`,
        );
      }
      const ccRateio = await this.integration.findCostCenterRateio(
        companyCode,
        it.costCenterRateioCode,
      );
      if (!ccRateio) {
        throw new BadRequestException(
          `Rateio de centro de custo inválido: ${it.costCenterRateioCode}`,
        );
      }
      if (it.itemErpCode) {
        const erpItem = await this.integration.findItem(
          companyCode,
          it.itemErpCode,
        );
        if (!erpItem) {
          throw new BadRequestException(`Item inválido: ${it.itemErpCode}`);
        }
      }

      // Escopo da equipe: o item só pode usar rateios liberados para ela.
      if (teamRateios) {
        if (!teamRateios.branch.has(it.branchRateioCode)) {
          throw new BadRequestException(
            `O rateio de filial ${it.branchRateioCode} não está liberado para a sua equipe.`,
          );
        }
        if (!teamRateios.cc.has(it.costCenterRateioCode)) {
          throw new BadRequestException(
            `O rateio de centro de custo ${it.costCenterRateioCode} não está liberado para a sua equipe.`,
          );
        }
      }

      const totalPrice = Number((it.quantity * it.estimatedPrice).toFixed(2));
      totalAmount += totalPrice;

      // Snapshot do rateio — congela as linhas no momento da criação.
      const branchLines = await this.integration.getBranchRateioLines(
        companyCode,
        it.branchRateioCode,
      );
      const ccLines = await this.integration.getCostCenterRateioLines(
        companyCode,
        it.costCenterRateioCode,
      );
      const rateioSnapshot = [
        ...this.snapshotLines(
          'BRANCH',
          it.branchRateioCode,
          branchLines.map((l) => ({
            targetCode: l.filialCodigo,
            branchCode: null,
            percentage: l.porcentagem,
          })),
          totalPrice,
        ),
        ...this.snapshotLines(
          'COST_CENTER',
          it.costCenterRateioCode,
          ccLines.map((l) => ({
            targetCode: l.centroCustoCodigo,
            branchCode: l.filialCodigo,
            percentage: l.porcentagem,
          })),
          totalPrice,
        ),
      ];

      built.push({
        fields: {
          itemErpCode: it.itemErpCode ?? null,
          itemDescription: it.itemDescription,
          quantity: it.quantity,
          unit: it.unit,
          estimatedPrice: it.estimatedPrice,
          totalPrice,
          accountingAccount: it.accountingAccount,
          accountName: account.nome,
          branchRateioCode: it.branchRateioCode,
          branchRateioDesc: branchRateio.descricao,
          costCenterRateioCode: it.costCenterRateioCode,
          costCenterRateioDesc: ccRateio.descricao,
          notes: it.notes ?? null,
          rateios: { create: rateioSnapshot },
        },
      });
    }

    return { built, totalAmount: Number(totalAmount.toFixed(2)) };
  }

  /** Cria uma requisição em rascunho. */
  async create(user: AuthenticatedUser, dto: CreateRequisitionDto) {
    const company = await this.resolveCompany(user, dto.companyId);

    const branch = await this.integration.findBranch(
      company.code,
      dto.branchErpCode,
    );
    if (!branch) {
      throw new BadRequestException(`Filial inválida: ${dto.branchErpCode}`);
    }
    const supplier = await this.resolveSupplierForRequisition(company.code, {
      supplierErpCode: dto.supplierErpCode,
      supplierCnpj: dto.supplierCnpj,
      supplierNameOverride: dto.supplierNameOverride,
    });

    const paymentCondition = await this.integration.findPaymentCondition(
      company.code,
      dto.paymentConditionCode,
    );
    if (!paymentCondition) {
      throw new BadRequestException(
        `Condição de pagamento inválida: ${dto.paymentConditionCode}`,
      );
    }

    const teamRateios = await this.loadTeamRateios(user.teamId, company.id);
    const { built, totalAmount } = await this.buildItems(
      company.code,
      dto.items,
      teamRateios,
    );
    const number = await this.numbering.next(company.code, 'REQ');

    return this.prisma.requisition.create({
      data: {
        number,
        companyId: company.id,
        branchErpCode: dto.branchErpCode,
        branchName: branch.nome,
        supplierErpCode: supplier.supplierErpCode,
        supplierName: supplier.supplierName,
        supplierCnpj: supplier.supplierCnpj,
        supplierFantasia: supplier.supplierFantasia,
        supplierEmail: supplier.supplierEmail,
        supplierTelefone: supplier.supplierTelefone,
        supplierLogradouro: supplier.supplierLogradouro,
        supplierNumero: supplier.supplierNumero,
        supplierBairro: supplier.supplierBairro,
        supplierCidade: supplier.supplierCidade,
        supplierUf: supplier.supplierUf,
        supplierCep: supplier.supplierCep,
        supplierCnae: supplier.supplierCnae,
        needsSupplierErpCreation: supplier.needsSupplierErpCreation,
        requesterId: user.id,
        teamId: user.teamId,
        title: dto.title,
        justification: dto.justification,
        tipoNotaFiscal: dto.tipoNotaFiscal,
        status: RequisitionStatus.DRAFT,
        totalAmount,
        paymentConditionCode: dto.paymentConditionCode,
        paymentConditionDesc: paymentCondition.descricao,
        recurring: dto.recurring ?? false,
        recurrenceMonths: dto.recurring ? (dto.recurrenceMonths ?? null) : null,
        contractRef: dto.contractRef ?? null,
        tipoCompra: dto.tipoCompra ?? null,
        quotationsCount: dto.quotationsCount ?? 0,
        items: { create: built.map((b) => b.fields) },
      },
      include: { items: { include: { rateios: true } } },
    });
  }

  /** Lista requisições do escopo do usuário. */
  async findAll(user: AuthenticatedUser, query: QueryRequisitionsDto) {
    const { companyId, status, search, mine, skip = 0, take = 50 } = query;

    if (companyId && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }

    const where: Prisma.RequisitionWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      // Escopo de visibilidade: não-admin vê só a própria equipe.
      ...(user.profile !== UserProfile.ADMIN
        ? { teamId: user.teamId }
        : {}),
      ...(status ? { status } : {}),
      ...(mine === 'true' ? { requesterId: user.id } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search } },
              { title: { contains: search } },
            ],
          }
        : {}),
    };

    // Select enxuto: a tela só precisa desses campos. Trazer o modelo
    // inteiro arrasta NVarChar(Max) (justification, rejectionReason,
    // cancellationReason) — pesa muito em 50 linhas.
    const [data, total] = await Promise.all([
      this.prisma.requisition.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          title: true,
          supplierName: true,
          tipoNotaFiscal: true,
          status: true,
          totalAmount: true,
          ctbTipoOperacao: true,
          naturezaEntrada: true,
          createdAt: true,
          requester: { select: { id: true, name: true } },
        },
      }),
      this.prisma.requisition.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /**
   * Garante que um não-admin só acesse recursos da própria equipe.
   * Espelha o filtro `teamId: user.teamId` aplicado em findAll, para que
   * listagem e detalhe/clone tenham o MESMO escopo de visibilidade.
   * ADMIN passa sempre.
   */
  private assertSameTeam(user: AuthenticatedUser, teamId: string | null) {
    if (user.profile === UserProfile.ADMIN) return;
    if (teamId !== user.teamId) {
      throw new ForbiddenException('Sem acesso a esta requisição.');
    }
  }

  /** Detalhe de uma requisição. */
  async findOne(user: AuthenticatedUser, id: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id },
      include: {
        items: { include: { rateios: true } },
        requester: { select: { id: true, name: true } },
        approvalSteps: {
          orderBy: { level: 'asc' },
          include: {
            // Nome de quem decidiu (aprovou/reprovou/devolveu) e o nome
            // do aprovador esperado quando ainda está PENDING — pra UI
            // mostrar "Quem" em cada linha do fluxo, sem ?.
            decidedBy: { select: { name: true } },
            assignedApprover: { select: { name: true } },
          },
        },
        // Pedidos de Compra gerados a partir desta requisição — usado
        // pela UI pra oferecer atalho de navegação quando a req já foi
        // convertida. Pode haver mais de um se a req foi quebrada em
        // múltiplos PCs no futuro, então mandamos array.
        purchaseOrders: {
          where: { deletedAt: null },
          select: {
            id: true,
            number: true,
            status: true,
            erpPedido: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!req || req.deletedAt) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta requisição.');
    }
    // Escopo por equipe: espelha o filtro de findAll. Não-admin só
    // acessa o detalhe de requisições da própria equipe — sem isto, a
    // listagem filtra por equipe mas o GET :id vazava (IDOR de equipe).
    this.assertSameTeam(user, req.teamId);

    // Pendências fiscais que afetam ESTA requisição. O modelo
    // FiscalItemRequest é por (supplier + item), não tem FK pra req.
    // A lógica: se há pendências para (supplierErpCode, itemDescription)
    // dos itens desta req, listamos aqui para que a UI mostre o status
    // ao solicitante SEM precisar dar acesso ao módulo Fiscal.
    const itemDescs = req.items.map((it) => it.itemDescription);
    const fiscalRows = req.supplierErpCode && itemDescs.length > 0
      ? await this.prisma.fiscalItemRequest.findMany({
          where: {
            companyId: req.companyId,
            supplierErpCode: req.supplierErpCode,
            itemDescription: { in: itemDescs },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            itemErpCode: true,
            itemDescription: true,
            rejectionReason: true,
            createdAt: true,
            resolvedAt: true,
          },
        })
      : [];

    // Achata os nomes pra simplificar consumo no front (campos flat
    // `decidedByName`/`assignedApproverName` em vez de objetos aninhados).
    return {
      ...req,
      approvalSteps: req.approvalSteps.map((s) => ({
        id: s.id,
        level: s.level,
        levelName: s.levelName,
        status: s.status,
        decidedAt: s.decidedAt,
        decidedByName: s.decidedBy?.name ?? null,
        assignedApproverName: s.assignedApprover?.name ?? null,
        comments: s.comments,
      })),
      pendingFiscalItems: fiscalRows,
    };
  }

  /** Edita uma requisição em rascunho (apenas o solicitante ou admin). */
  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateRequisitionDto,
  ) {
    const req = await this.findOne(user, id);

    const editableStatuses: string[] = [
      RequisitionStatus.DRAFT,
      RequisitionStatus.IN_APPROVAL,
      RequisitionStatus.REVISION,
      // APPROVED só edita se ainda não virou PC — checa abaixo.
      RequisitionStatus.APPROVED,
    ];
    if (!editableStatuses.includes(req.status)) {
      throw new BadRequestException(
        `Requisições em status "${req.status}" não podem ser editadas.`,
      );
    }
    if (req.status === RequisitionStatus.APPROVED) {
      // Bloqueia se já tem PC vivo — o caminho certo é editar o PC ou
      // cancelar o PC antes (a edição da req invalidaria PC existente).
      const hasPo = await this.prisma.purchaseOrder.findFirst({
        where: { requisitionId: req.id, deletedAt: null },
        select: { id: true, number: true },
      });
      if (hasPo) {
        throw new BadRequestException(
          `Esta requisição já gerou o pedido ${hasPo.number}. ` +
            'Edite o pedido diretamente, ou cancele-o antes de editar a requisição.',
        );
      }
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode editar.');
    }
    // O motivo da edição é OPCIONAL. Quando o aprovador devolve a req pra
    // revisão, o solicitante só está cumprindo o que foi pedido (anexar
    // cotações, corrigir um item etc.) — forçá-lo a justificar a própria
    // edição é fricção desnecessária, já que o motivo da DEVOLUÇÃO já fica
    // registrado pelo aprovador. Se vier um motivo no DTO, é gravado em
    // lastEditReason (abaixo) pra trilha de auditoria; se não vier, segue
    // sem bloquear — vale pra DRAFT, IN_APPROVAL e REVISION.
    const reason = (dto.editReason ?? '').trim();

    const company = await this.resolveCompany(user, req.companyId);
    const data: Prisma.RequisitionUpdateInput = {};

    if (dto.title !== undefined) data.title = dto.title;
    if (dto.justification !== undefined) {
      data.justification = dto.justification;
    }
    if (dto.recurring !== undefined) {
      data.recurring = dto.recurring;
      data.recurrenceMonths = dto.recurring
        ? (dto.recurrenceMonths ?? null)
        : null;
    }
    if (dto.contractRef !== undefined) {
      data.contractRef = dto.contractRef || null;
    }
    if (dto.quotationsCount !== undefined) {
      data.quotationsCount = dto.quotationsCount;
    }
    if (dto.paymentConditionCode !== undefined) {
      const cond = await this.integration.findPaymentCondition(
        company.code,
        dto.paymentConditionCode,
      );
      if (!cond) {
        throw new BadRequestException(
          `Condição de pagamento inválida: ${dto.paymentConditionCode}`,
        );
      }
      data.paymentConditionCode = dto.paymentConditionCode;
      data.paymentConditionDesc = cond.descricao;
    }
    if (dto.branchErpCode !== undefined) {
      const branch = await this.integration.findBranch(
        company.code,
        dto.branchErpCode,
      );
      if (!branch) {
        throw new BadRequestException(
          `Filial inválida: ${dto.branchErpCode}`,
        );
      }
      data.branchErpCode = dto.branchErpCode;
      data.branchName = branch.nome;
    }
    // Fornecedor: re-resolve quando QUALQUER campo de fornecedor veio no
    // DTO. Trata os 3 caminhos (ERP / CNPJ externo / fallback manual).
    if (
      dto.supplierErpCode !== undefined ||
      dto.supplierCnpj !== undefined ||
      dto.supplierNameOverride !== undefined
    ) {
      const supplier = await this.resolveSupplierForRequisition(company.code, {
        supplierErpCode: dto.supplierErpCode,
        supplierCnpj: dto.supplierCnpj,
        supplierNameOverride: dto.supplierNameOverride,
      });
      data.supplierErpCode = supplier.supplierErpCode;
      data.supplierName = supplier.supplierName;
      data.supplierCnpj = supplier.supplierCnpj;
      data.supplierFantasia = supplier.supplierFantasia;
      data.supplierEmail = supplier.supplierEmail;
      data.supplierTelefone = supplier.supplierTelefone;
      data.supplierLogradouro = supplier.supplierLogradouro;
      data.supplierNumero = supplier.supplierNumero;
      data.supplierBairro = supplier.supplierBairro;
      data.supplierCidade = supplier.supplierCidade;
      data.supplierUf = supplier.supplierUf;
      data.supplierCep = supplier.supplierCep;
      data.supplierCnae = supplier.supplierCnae;
      data.needsSupplierErpCreation = supplier.needsSupplierErpCreation;
    }

    if (dto.items) {
      const teamRateios = await this.loadTeamRateios(
        user.teamId,
        company.id,
      );
      const { built, totalAmount } = await this.buildItems(
        company.code,
        dto.items,
        teamRateios,
      );
      data.totalAmount = totalAmount;

      const oldItems = await this.prisma.requisitionItem.findMany({
        where: { requisitionId: id },
        select: { id: true },
      });
      const oldIds = oldItems.map((o) => o.id);

      // Apaga o snapshot antigo, depois os itens, e recria com snapshot novo.
      await this.prisma.$transaction([
        this.prisma.requisitionItemRateio.deleteMany({
          where: { requisitionItemId: { in: oldIds } },
        }),
        this.prisma.requisitionItem.deleteMany({
          where: { requisitionId: id },
        }),
        ...built.map((b) =>
          this.prisma.requisitionItem.create({
            data: { ...b.fields, requisitionId: id },
          }),
        ),
      ]);
    }

    // Registra motivo + autor da última edição (visível em /history).
    if (reason) {
      data.lastEditReason = reason;
      data.lastEditedAt = new Date();
      data.lastEditedById = user.id;
    }

    await this.prisma.requisition.update({ where: { id }, data });

    // RN-REQ-05: edição após envio (ou retorno de revisão) reinicia o
    // fluxo de aprovação — e revalida a política de cotações, senão
    // dava pra burlar a regra fugindo pelo update().
    const reapprove =
      req.status === RequisitionStatus.IN_APPROVAL ||
      req.status === RequisitionStatus.REVISION;
    if (reapprove) {
      const updated = await this.prisma.requisition.findUniqueOrThrow({
        where: { id },
      });
      // Mesmo cheque do submit(): respeita dispensa, senão conta
      // anexos kind=QUOTATION.
      if (updated.quotationWaiverReason) {
        if (
          !updated.quotationWaiverNote ||
          updated.quotationWaiverNote.trim().length < QUOTATION_WAIVER_MIN_NOTE
        ) {
          throw new BadRequestException(
            `A dispensa de cotação precisa de uma justificativa de no mínimo ${QUOTATION_WAIVER_MIN_NOTE} caracteres.`,
          );
        }
      } else {
        const realQuotationsCount = await this.prisma.attachment.count({
          where: { requisitionId: id, kind: 'QUOTATION' },
        });
        await this.assertQuotationsPolicy(
          updated.companyId,
          Number(updated.totalAmount),
          realQuotationsCount,
        );
      }
      await this.approvals.resetForRequisition(id);
      const firstLevel = await this.approvals.startApproval({
        companyId: updated.companyId,
        teamId: updated.teamId,
        entityType: ApprovalEntityType.REQUISITION,
        requisitionId: id,
        amount: Number(updated.totalAmount),
        documentNumber: updated.number,
      });
      await this.prisma.requisition.update({
        where: { id },
        data:
          firstLevel === null
            ? {
                status: RequisitionStatus.APPROVED,
                approvedAt: new Date(),
                revisionReason: null,
                revisionRequestedAt: null,
                revisionRequestedById: null,
              }
            : {
                status: RequisitionStatus.IN_APPROVAL,
                currentTierLevel: firstLevel,
                revisionReason: null,
                revisionRequestedAt: null,
                revisionRequestedById: null,
              },
      });
    }
    return this.findOne(user, id);
  }

  /**
   * Re-submete uma requisição em REVISION sem precisar abrir o form de
   * edição. Usado quando o solicitante anexou cotações faltantes (ou
   * pediu dispensa) e quer mandar de volta pra aprovação. Reaproveita
   * a mesma lógica de reapprove do update().
   */
  async resubmitFromRevision(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);
    if (req.status !== RequisitionStatus.REVISION) {
      throw new BadRequestException(
        'Só requisições em revisão podem ser re-submetidas por este caminho. Use editar e salvar.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode re-submeter.');
    }
    if (req.items.length === 0) {
      throw new BadRequestException('A requisição não tem itens.');
    }
    if (req.quotationWaiverReason) {
      if (
        !req.quotationWaiverNote ||
        req.quotationWaiverNote.trim().length < QUOTATION_WAIVER_MIN_NOTE
      ) {
        throw new BadRequestException(
          `A dispensa de cotação precisa de uma justificativa de no mínimo ${QUOTATION_WAIVER_MIN_NOTE} caracteres.`,
        );
      }
    } else {
      const realQuotationsCount = await this.prisma.attachment.count({
        where: { requisitionId: id, kind: 'QUOTATION' },
      });
      await this.assertQuotationsPolicy(
        req.companyId,
        Number(req.totalAmount),
        realQuotationsCount,
      );
    }
    await this.approvals.resetForRequisition(id);
    const firstLevel = await this.approvals.startApproval({
      companyId: req.companyId,
      teamId: req.teamId,
      entityType: ApprovalEntityType.REQUISITION,
      requisitionId: id,
      amount: Number(req.totalAmount),
      documentNumber: req.number,
    });
    await this.prisma.requisition.update({
      where: { id },
      data:
        firstLevel === null
          ? {
              status: RequisitionStatus.APPROVED,
              approvedAt: new Date(),
              revisionReason: null,
              revisionRequestedAt: null,
              revisionRequestedById: null,
            }
          : {
              status: RequisitionStatus.IN_APPROVAL,
              currentTierLevel: firstLevel,
              revisionReason: null,
              revisionRequestedAt: null,
              revisionRequestedById: null,
            },
    });
    return this.findOne(user, id);
  }

  /**
   * Solicita dispensa de cotação (RN-REQ-02 — exceção). Só faz sentido
   * enquanto a requisição é DRAFT (depois entra na cadeia de aprovação
   * normalmente). Quem pode pedir: o próprio solicitante ou Admin.
   */
  async setQuotationWaiver(
    user: AuthenticatedUser,
    id: string,
    reason: string,
    note: string,
  ) {
    const req = await this.findOne(user, id);
    // Aceita DRAFT e REVISION — em revisão o solicitante pode optar
    // pela dispensa em vez de anexar cotações.
    if (
      req.status !== RequisitionStatus.DRAFT &&
      req.status !== RequisitionStatus.REVISION
    ) {
      throw new BadRequestException(
        'A dispensa de cotação só pode ser solicitada em rascunho ou revisão.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Só o solicitante pode pedir a dispensa.',
      );
    }
    if (!isQuotationWaiverReason(reason)) {
      throw new BadRequestException(
        `Motivo inválido. Valores aceitos: ${QUOTATION_WAIVER_REASONS.join(', ')}.`,
      );
    }
    const trimmed = (note ?? '').trim();
    if (trimmed.length < QUOTATION_WAIVER_MIN_NOTE) {
      throw new BadRequestException(
        `A justificativa precisa ter no mínimo ${QUOTATION_WAIVER_MIN_NOTE} caracteres.`,
      );
    }
    await this.prisma.requisition.update({
      where: { id },
      data: {
        quotationWaiverReason: reason satisfies QuotationWaiverReason,
        quotationWaiverNote: trimmed,
        quotationWaiverAt: new Date(),
      },
    });
    return {
      ok: true,
      reasonLabel: QUOTATION_WAIVER_LABELS[reason],
    };
  }

  /** Remove a dispensa — a regra padrão de cotações volta a valer. */
  async clearQuotationWaiver(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);
    if (
      req.status !== RequisitionStatus.DRAFT &&
      req.status !== RequisitionStatus.REVISION
    ) {
      throw new BadRequestException(
        'A dispensa só pode ser removida em rascunho ou revisão.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Só o solicitante pode remover a dispensa.',
      );
    }
    await this.prisma.requisition.update({
      where: { id },
      data: {
        quotationWaiverReason: null,
        quotationWaiverNote: null,
        quotationWaiverAt: null,
      },
    });
    return { ok: true };
  }

  /** Submete a requisição: gera o fluxo de aprovação por alçada. */
  async submit(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);

    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas requisições em rascunho podem ser submetidas.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode submeter.');
    }
    if (req.items.length === 0) {
      throw new BadRequestException('A requisição não tem itens.');
    }

    // RN-REQ-02 — exige cotações quando o total atinge o threshold do Admin.
    // Exceção: se houver `quotationWaiverReason` com justificativa, pula
    // a checagem (o aprovador vai validar o motivo na cadeia normal).
    if (req.quotationWaiverReason) {
      // Sanidade: nota não pode estar vazia se a dispensa foi setada.
      // Em teoria o endpoint de set já garante, mas defendemos aqui também.
      if (
        !req.quotationWaiverNote ||
        req.quotationWaiverNote.trim().length < QUOTATION_WAIVER_MIN_NOTE
      ) {
        throw new BadRequestException(
          `A dispensa de cotação precisa de uma justificativa de no mínimo ${QUOTATION_WAIVER_MIN_NOTE} caracteres.`,
        );
      }
    } else {
      // Contagem REAL via attachments(kind=QUOTATION) — o campo legacy
      // `quotationsCount` é só um cache; aqui usamos a fonte da verdade
      // pra não dar pra burlar editando o contador.
      const realQuotationsCount = await this.prisma.attachment.count({
        where: { requisitionId: req.id, kind: 'QUOTATION' },
      });
      await this.assertQuotationsPolicy(
        req.companyId,
        Number(req.totalAmount),
        realQuotationsCount,
      );
    }

    // Limpa qualquer cadeia órfã antes de gerar a nova (audit M13): se um
    // submit anterior falhou DEPOIS do createMany dos steps mas ANTES do
    // update do status, a requisição ficou DRAFT com steps PENDING órfãos;
    // sem este reset, um novo submit DUPLICARIA a cadeia. Mesmo padrão
    // defensivo já usado no fluxo de re-submissão (resubmit).
    await this.approvals.resetForRequisition(req.id);

    const firstLevel = await this.approvals.startApproval({
      companyId: req.companyId,
      teamId: req.teamId,
      entityType: ApprovalEntityType.REQUISITION,
      requisitionId: req.id,
      amount: Number(req.totalAmount),
      documentNumber: req.number,
    });

    // Cadeia vazia → auto-aprovado já na submissão.
    await this.prisma.requisition.update({
      where: { id },
      data:
        firstLevel === null
          ? {
              status: RequisitionStatus.APPROVED,
              submittedAt: new Date(),
              approvedAt: new Date(),
            }
          : {
              status: RequisitionStatus.IN_APPROVAL,
              submittedAt: new Date(),
              currentTierLevel: firstLevel,
            },
    });
    return this.findOne(user, id);
  }

  /**
   * Preenche a classificação fiscal da requisição (CTB + natureza,
   * opcionalmente tipoCompra). Restrito a REVIEWER/ADMIN. Pode ser
   * chamado antes ou depois da aprovação — mas obrigatório antes da
   * conversão em PC (a gravação no Linx exige esses campos).
   */
  async fiscalClassify(
    user: AuthenticatedUser,
    id: string,
    dto: { ctbTipoOperacao: number; naturezaEntrada: string; tipoCompra?: string },
  ) {
    if (
      user.profile !== UserProfile.REVIEWER &&
      user.profile !== UserProfile.ADMIN
    ) {
      throw new ForbiddenException(
        'Somente o fiscal/revisor pode classificar fiscalmente.',
      );
    }
    const req = await this.findOne(user, id);
    if (req.status === RequisitionStatus.CONVERTED) {
      throw new BadRequestException(
        'Requisição já convertida em PC — não é possível reclassificar.',
      );
    }
    await this.prisma.requisition.update({
      where: { id },
      data: {
        ctbTipoOperacao: dto.ctbTipoOperacao,
        naturezaEntrada: dto.naturezaEntrada,
        ...(dto.tipoCompra ? { tipoCompra: dto.tipoCompra } : {}),
      },
    });
    return this.findOne(user, id);
  }

  /**
   * Timeline da requisição (espelha PO.history): junta criação,
   * submissão, decisões da cadeia, edição, classificação fiscal,
   * recorrência e cancelamento. Ordem decrescente.
   */
  async history(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);
    type Evt = {
      at: string;
      kind: string;
      label: string;
      who?: string | null;
      detail?: string | null;
    };
    const events: Evt[] = [];
    events.push({
      at: req.createdAt.toISOString(),
      kind: 'created',
      label: 'Requisição criada',
      who: req.requester?.name ?? null,
    });
    if (req.submittedAt) {
      // Quem submete é sempre o solicitante (regra do submit()).
      events.push({
        at: req.submittedAt.toISOString(),
        kind: 'submitted',
        label: 'Submetida para aprovação',
        who: req.requester?.name ?? null,
      });
    }
    // Aprovação final e rejeição vêm da última step decidida do tipo
    // correspondente — assim sabemos exatamente quem assinou embaixo.
    // `findOne` retorna approvalSteps achatadas com decidedByName, então
    // pegamos a mais recente de cada status pra atribuir o `who`.
    const decidedSteps = req.approvalSteps
      .filter((s) => s.decidedAt)
      .sort(
        (a, b) =>
          new Date(b.decidedAt!).getTime() - new Date(a.decidedAt!).getTime(),
      );
    const lastApprovedName = decidedSteps.find((s) => s.status === 'APPROVED')
      ?.decidedByName;
    const lastRejectedName = decidedSteps.find((s) => s.status === 'REJECTED')
      ?.decidedByName;
    if (req.approvedAt) {
      events.push({
        at: req.approvedAt.toISOString(),
        kind: 'approved',
        label: 'Requisição aprovada',
        who: lastApprovedName ?? null,
      });
    }
    if (req.rejectedAt) {
      events.push({
        at: req.rejectedAt.toISOString(),
        kind: 'rejected',
        label: 'Requisição rejeitada',
        who: lastRejectedName ?? null,
        detail: req.rejectionReason,
      });
    }
    // NB: a devolução para revisão NÃO é emitida aqui a partir dos campos
    // req.revisionRequestedAt/Reason — isso duplicava o evento, porque a
    // mesma devolução também aparece no loop de steps abaixo
    // ("<nível>: devolveu para revisão") com texto e timestamp idênticos.
    // Mantemos só a versão por step (mais informativa: diz qual nível
    // devolveu e preserva o histórico de múltiplos ciclos de revisão).
    if (req.lastEditedAt) {
      const editor = req.lastEditedById
        ? await this.prisma.user.findUnique({
            where: { id: req.lastEditedById },
            select: { name: true },
          })
        : null;
      events.push({
        at: req.lastEditedAt.toISOString(),
        kind: 'edited',
        label: 'Requisição editada',
        who: editor?.name ?? null,
        detail: req.lastEditReason,
      });
    }
    if (req.recurrenceParentId) {
      events.push({
        at: req.createdAt.toISOString(),
        kind: 'recurrence',
        label: 'Gerada automaticamente por recorrência',
      });
    }
    if (req.deletedAt && req.status === RequisitionStatus.CANCELLED) {
      events.push({
        at: req.deletedAt.toISOString(),
        kind: 'cancelled',
        label: 'Requisição cancelada',
      });
    }
    // Aprovações step-by-step.
    const steps = await this.prisma.approvalStep.findMany({
      where: { requisitionId: id, status: { not: 'PENDING' } },
      orderBy: { decidedAt: 'desc' },
      include: { decidedBy: { select: { name: true } } },
    });
    // Uma única devolução marca TODOS os steps pendentes do doc como
    // REVISION com o mesmo decidedAt (updateMany em requestRevision). Sem
    // dedupe, um nível com vários aprovadores em paralelo geraria N linhas
    // idênticas. Colapsamos por timestamp.
    const seenRevisionAt = new Set<string>();
    for (const s of steps) {
      if (!s.decidedAt) continue;
      const atIso = s.decidedAt.toISOString();
      if (s.status === 'REVISION') {
        if (seenRevisionAt.has(atIso)) continue;
        seenRevisionAt.add(atIso);
      }
      events.push({
        at: atIso,
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

  /** Exclui uma requisição em rascunho (soft delete). */
  async remove(user: AuthenticatedUser, id: string) {
    const req = await this.findOne(user, id);
    if (req.status !== RequisitionStatus.DRAFT) {
      throw new BadRequestException(
        'Apenas requisições em rascunho podem ser excluídas.',
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException('Só o solicitante pode excluir.');
    }
    await this.prisma.requisition.update({
      where: { id },
      data: { deletedAt: new Date(), status: RequisitionStatus.CANCELLED },
    });
    return { ok: true };
  }

  /**
   * Clona uma requisição existente como rascunho. Útil quando o
   * solicitante quer reaproveitar uma compra antiga e ajustar só
   * alguns dados (item, valor, vencimento).
   *
   * O clone:
   *   - mantém solicitante (usuário logado) — mesmo que a original
   *     seja de outra pessoa, o clone vira do usuário atual
   *   - mantém empresa, filial, equipe, fornecedor (se cadastrado),
   *     título, justificativa, tipo NF, condição pgto, contrato ref,
   *     tipo de compra
   *   - copia itens com seus rateios
   *   - **zera**: status (DRAFT), datas de aprovação/submissão/rejeição,
   *     número (gera novo), erp fields, anexos, cotações, aprovações
   *   - **não copia** flags `recurring` (a cópia não recorre)
   *   - **não copia** `quotationWaiverReason` (cada cópia decide)
   *
   * Devolve o `id` do novo rascunho — o front redireciona pra edição.
   */
  async clone(user: AuthenticatedUser, sourceId: string) {
    const src = await this.prisma.requisition.findUniqueOrThrow({
      where: { id: sourceId },
      include: {
        items: { include: { rateios: true } },
        company: { select: { code: true } },
      },
    });
    if (!user.companyIds.includes(src.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    // Mesmo escopo por equipe do findOne — não-admin não clona
    // requisição de outra equipe (copiaria itens/rateios/justificativa).
    this.assertSameTeam(user, src.teamId);
    const number = await this.numbering.next(src.company.code, 'REQ');
    const stamp = new Date().toLocaleDateString('pt-BR');
    const created = await this.prisma.requisition.create({
      select: { id: true, number: true },
      data: {
        number,
        companyId: src.companyId,
        branchErpCode: src.branchErpCode,
        branchName: src.branchName,
        supplierErpCode: src.supplierErpCode,
        supplierName: src.supplierName,
        requesterId: user.id,
        teamId: user.teamId,
        title: `${src.title} (cópia ${stamp})`,
        justification: src.justification,
        tipoNotaFiscal: src.tipoNotaFiscal,
        status: RequisitionStatus.DRAFT,
        totalAmount: src.totalAmount,
        paymentConditionCode: src.paymentConditionCode,
        paymentConditionDesc: src.paymentConditionDesc,
        contractRef: src.contractRef,
        tipoCompra: src.tipoCompra,
        ctbTipoOperacao: src.ctbTipoOperacao,
        naturezaEntrada: src.naturezaEntrada,
        recurring: false,
        items: {
          create: src.items.map((it) => ({
            itemErpCode: it.itemErpCode,
            itemDescription: it.itemDescription,
            quantity: it.quantity,
            unit: it.unit,
            estimatedPrice: it.estimatedPrice,
            totalPrice: it.totalPrice,
            accountingAccount: it.accountingAccount,
            accountName: it.accountName,
            branchRateioCode: it.branchRateioCode,
            branchRateioDesc: it.branchRateioDesc,
            costCenterRateioCode: it.costCenterRateioCode,
            costCenterRateioDesc: it.costCenterRateioDesc,
            notes: it.notes,
            rateios: {
              create: it.rateios.map((r) => ({
                kind: r.kind,
                rateioCode: r.rateioCode,
                targetCode: r.targetCode,
                branchCode: r.branchCode,
                percentage: r.percentage,
                amount: r.amount,
              })),
            },
          })),
        },
      },
    });
    return created;
  }
}
