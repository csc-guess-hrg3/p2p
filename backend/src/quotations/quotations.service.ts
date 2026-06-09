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
import { AuthenticatedUser } from '../auth/auth.types';
import { RequisitionStatus, UserProfile } from '../common/enums';

interface CreateQuotationInput {
  attachmentId?: string;
  supplierCnpj: string;
  /** Nome digitado pelo solicitante quando o CNPJ não está no ERP. */
  supplierNameOverride?: string;
  paymentConditionCode?: string;
  notes?: string;
  items: Array<{
    description: string;
    unit?: string;
    quantity: number;
    unitPrice: number;
  }>;
}

type UpdateQuotationInput = Partial<CreateQuotationInput>;

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
    private readonly cnpjPublic: CnpjPublicService,
  ) {}

  /** Normaliza CNPJ pra 14 dígitos. Aceita CPF (11 dígitos) também. */
  private cleanCnpj(raw: string): string {
    const d = (raw ?? '').replace(/\D/g, '');
    if (d.length < 11 || d.length > 14) {
      throw new BadRequestException(
        'Informe um CNPJ com 14 dígitos (ou CPF com 11).',
      );
    }
    return d;
  }

  private async assertReqEditable(user: AuthenticatedUser, reqId: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id: reqId },
      include: { company: true },
    });
    if (!req || req.deletedAt) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    // Cotação só pode ser criada/editada/deletada enquanto a req ainda
    // está aberta a mudanças (rascunho ou revisão). Depois disso é
    // histórico.
    const editable: string[] = [
      RequisitionStatus.DRAFT,
      RequisitionStatus.REVISION,
    ];
    if (!editable.includes(req.status)) {
      throw new BadRequestException(
        `Cotações só podem ser gerenciadas em rascunho ou revisão (atual: ${req.status}).`,
      );
    }
    if (req.requesterId !== user.id && user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Só o solicitante (ou Admin) pode gerenciar as cotações.',
      );
    }
    return req;
  }

  async list(user: AuthenticatedUser, requisitionId: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id: requisitionId },
      select: { companyId: true, teamId: true, deletedAt: true },
    });
    if (!req || req.deletedAt) throw new NotFoundException();
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    // Isolamento por equipe (espelha requisitions.findOne): não-admin só vê
    // cotações da própria equipe.
    if (user.profile !== UserProfile.ADMIN && req.teamId !== user.teamId) {
      throw new ForbiddenException('Sem acesso a esta requisição.');
    }
    return this.prisma.quotation.findMany({
      where: { requisitionId },
      orderBy: [{ isWinner: 'desc' }, { createdAt: 'asc' }],
      include: {
        items: { orderBy: { position: 'asc' } },
        attachment: { select: { id: true, filename: true, mimeType: true } },
        createdBy: { select: { name: true } },
        selectedBy: { select: { name: true } },
      },
    });
  }

  async create(
    user: AuthenticatedUser,
    requisitionId: string,
    dto: CreateQuotationInput,
  ) {
    const req = await this.assertReqEditable(user, requisitionId);
    const cnpj = this.cleanCnpj(dto.supplierCnpj);

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Informe ao menos 1 item na cotação.');
    }
    for (const it of dto.items) {
      if (!it.description?.trim()) {
        throw new BadRequestException('Item sem descrição.');
      }
      if (it.quantity <= 0) {
        throw new BadRequestException(
          `Quantidade inválida no item "${it.description}".`,
        );
      }
      if (it.unitPrice < 0) {
        throw new BadRequestException(
          `Preço unitário inválido no item "${it.description}".`,
        );
      }
    }

    // 1) Lookup no ERP — se achar, captura código + nome + condição padrão.
    // 2) Senão, consulta BrasilAPI pra trazer razão social + endereço.
    // 3) Senão, exige o nome digitado pelo solicitante (`supplierNameOverride`).
    const erp = await this.integration.findSupplierByCnpj(
      req.company.code,
      cnpj,
    );
    let supplierName = erp?.nome ?? '';
    let publicData: Awaited<ReturnType<CnpjPublicService['lookup']>> | null =
      null;
    if (!erp && cnpj.length === 14) {
      publicData = await this.cnpjPublic.lookup(cnpj);
      if (publicData.found) {
        supplierName = publicData.razaoSocial;
      }
    }
    if (!supplierName) {
      // Fallback final: nome digitado pelo usuário (caso CNPJ + BrasilAPI falhem).
      supplierName = dto.supplierNameOverride?.trim() ?? '';
    }
    if (!supplierName) {
      throw new BadRequestException(
        'Não foi possível identificar o fornecedor pelo CNPJ. Informe o nome do fornecedor manualmente.',
      );
    }

    // Condição de pagamento — se veio no DTO, busca a descrição; senão usa
    // a condição padrão do fornecedor (quando há).
    let paymentConditionDesc: string | null = null;
    let paymentConditionCode: string | null = dto.paymentConditionCode ?? null;
    if (paymentConditionCode) {
      const cond = await this.integration.findPaymentCondition(
        req.company.code,
        paymentConditionCode,
      );
      if (!cond) {
        throw new BadRequestException(
          `Condição de pagamento inválida: ${paymentConditionCode}.`,
        );
      }
      paymentConditionDesc = cond.descricao;
    } else if (erp?.condicaoPgto) {
      paymentConditionCode = erp.condicaoPgto;
      const cond = await this.integration.findPaymentCondition(
        req.company.code,
        erp.condicaoPgto,
      );
      paymentConditionDesc = cond?.descricao ?? null;
    }

    // Valida que o anexo, se informado, pertence à mesma requisição e
    // não está vinculado a outra cotação.
    if (dto.attachmentId) {
      const att = await this.prisma.attachment.findUnique({
        where: { id: dto.attachmentId },
        include: { quotation: true },
      });
      if (!att || att.requisitionId !== requisitionId) {
        throw new BadRequestException('Anexo inválido ou de outra requisição.');
      }
      if (att.quotation && att.quotation.requisitionId === requisitionId) {
        throw new BadRequestException(
          'Este anexo já está vinculado a outra cotação.',
        );
      }
    }

    const totalAmount = dto.items.reduce(
      (sum, it) => sum + it.quantity * it.unitPrice,
      0,
    );

    const pub = publicData?.found ? publicData : null;
    return this.prisma.quotation.create({
      data: {
        companyId: req.companyId,
        requisitionId,
        attachmentId: dto.attachmentId ?? null,
        supplierCnpj: cnpj,
        supplierName,
        supplierErpCode: erp?.codigo ?? null,
        supplierFantasia: pub?.nomeFantasia ?? null,
        supplierEmail: pub?.email ?? erp?.email ?? null,
        supplierTelefone: pub?.telefone ?? erp?.telefone ?? null,
        supplierLogradouro: pub?.logradouro ?? null,
        supplierNumero: pub?.numero ?? null,
        supplierBairro: pub?.bairro ?? null,
        supplierCidade: pub?.cidade ?? null,
        supplierUf: pub?.uf ?? null,
        supplierCep: pub?.cep ?? null,
        supplierCnae: pub?.cnaePrincipal ?? null,
        paymentConditionCode,
        paymentConditionDesc,
        totalAmount: new Prisma.Decimal(totalAmount.toFixed(2)),
        notes: dto.notes?.trim() || null,
        createdById: user.id,
        items: {
          create: dto.items.map((it, idx) => ({
            position: idx,
            description: it.description.trim(),
            unit: it.unit?.trim() || null,
            quantity: new Prisma.Decimal(it.quantity.toString()),
            unitPrice: new Prisma.Decimal(it.unitPrice.toString()),
            totalPrice: new Prisma.Decimal(
              (it.quantity * it.unitPrice).toFixed(2),
            ),
          })),
        },
      },
      include: {
        items: { orderBy: { position: 'asc' } },
      },
    });
  }

  async update(
    user: AuthenticatedUser,
    quotationId: string,
    dto: UpdateQuotationInput,
  ) {
    const existing = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Cotação não encontrada.');
    const req = await this.assertReqEditable(user, existing.requisitionId);

    // Se já é vencedora, bloqueia edição (precisa "des-selecionar" antes).
    if (existing.isWinner) {
      throw new BadRequestException(
        'Esta cotação foi selecionada como vencedora. Cancele a seleção antes de editar.',
      );
    }

    const data: Prisma.QuotationUpdateInput = {};
    if (dto.supplierCnpj !== undefined) {
      const cnpj = this.cleanCnpj(dto.supplierCnpj);
      const erp = await this.integration.findSupplierByCnpj(
        req.company.code,
        cnpj,
      );
      const name = erp?.nome ?? dto.supplierNameOverride?.trim() ?? '';
      if (!name) {
        throw new BadRequestException(
          'Fornecedor não está cadastrado no ERP — informe o nome do fornecedor.',
        );
      }
      data.supplierCnpj = cnpj;
      data.supplierName = name;
      data.supplierErpCode = erp?.codigo ?? null;
    } else if (dto.supplierNameOverride !== undefined) {
      data.supplierName = dto.supplierNameOverride.trim();
    }

    if (dto.paymentConditionCode !== undefined) {
      if (!dto.paymentConditionCode) {
        data.paymentConditionCode = null;
        data.paymentConditionDesc = null;
      } else {
        const cond = await this.integration.findPaymentCondition(
          req.company.code,
          dto.paymentConditionCode,
        );
        if (!cond) {
          throw new BadRequestException('Condição de pagamento inválida.');
        }
        data.paymentConditionCode = dto.paymentConditionCode;
        data.paymentConditionDesc = cond.descricao;
      }
    }

    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

    if (dto.items !== undefined) {
      if (dto.items.length === 0) {
        throw new BadRequestException('A cotação precisa de ao menos 1 item.');
      }
      const newTotal = dto.items.reduce(
        (sum, it) => sum + it.quantity * it.unitPrice,
        0,
      );
      // Apaga os itens antigos e cria os novos numa transação — simples
      // e suficiente pra essa escala.
      await this.prisma.$transaction([
        this.prisma.quotationItem.deleteMany({ where: { quotationId } }),
        ...dto.items.map((it, idx) =>
          this.prisma.quotationItem.create({
            data: {
              quotationId,
              position: idx,
              description: it.description.trim(),
              unit: it.unit?.trim() || null,
              quantity: new Prisma.Decimal(it.quantity.toString()),
              unitPrice: new Prisma.Decimal(it.unitPrice.toString()),
              totalPrice: new Prisma.Decimal(
                (it.quantity * it.unitPrice).toFixed(2),
              ),
            },
          }),
        ),
      ]);
      data.totalAmount = new Prisma.Decimal(newTotal.toFixed(2));
    }

    return this.prisma.quotation.update({
      where: { id: quotationId },
      data,
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async remove(user: AuthenticatedUser, quotationId: string) {
    const q = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
    });
    if (!q) throw new NotFoundException();
    await this.assertReqEditable(user, q.requisitionId);
    if (q.isWinner) {
      throw new BadRequestException(
        'Esta cotação foi selecionada como vencedora. Cancele a seleção antes de excluir.',
      );
    }
    await this.prisma.quotation.delete({ where: { id: quotationId } });
    return { ok: true };
  }

  /**
   * Aprovador (titular do step ou Admin) seleciona uma cotação como
   * vencedora. A requisição é sobrescrita com fornecedor + condição de
   * pagamento + itens da cotação.
   *
   * Se o fornecedor não está cadastrado no ERP (`supplierErpCode = null`),
   * marca `needsSupplierErpCreation = true` na requisição. Os dados
   * completos do fornecedor (razão social, endereço, CNAE, email,
   * telefone) já foram capturados via BrasilAPI no cadastro da cotação —
   * estão prontos pro cadastro automático no Linx.
   *
   * Implementação do cadastro no ERP fica em LinxErpService.createSupplier
   * (TODO documentado lá). O padrão é:
   *   1) `EXEC dbo.LX_SEQUENCIAL 'FORNECEDORES', @codigo OUT` — gera código
   *   2) INSERT em `dbo.cadastro_cli_for` (cadastro mestre cliente/fornecedor)
   *   3) INSERT em `dbo.fornecedores` (dados específicos de fornecedor)
   *   4) Atualiza quotation.supplierErpCode + req.needsSupplierErpCreation
   */
  async selectAsWinner(
    user: AuthenticatedUser,
    quotationId: string,
    reason: string,
  ) {
    const trimmed = (reason ?? '').trim();
    if (trimmed.length < 10) {
      throw new BadRequestException(
        'Informe uma justificativa (mín. 10 caracteres) explicando por que esta cotação foi escolhida.',
      );
    }
    const q = await this.prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!q) throw new NotFoundException('Cotação não encontrada.');

    const req = await this.prisma.requisition.findUnique({
      where: { id: q.requisitionId },
      include: { items: true },
    });
    if (!req || req.deletedAt) throw new NotFoundException();
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }

    // Validação: tem que estar em uma etapa de aprovação. Aprovador
    // (qualquer step pendente em qualquer nível) ou Admin pode escolher.
    const status: string = req.status;
    const inApproval =
      status === RequisitionStatus.IN_APPROVAL ||
      status === RequisitionStatus.SUBMITTED ||
      status === RequisitionStatus.REVISION;
    if (!inApproval) {
      throw new BadRequestException(
        'Cotações só podem ser selecionadas enquanto a requisição está em aprovação.',
      );
    }

    const isAdmin = user.profile === UserProfile.ADMIN;
    if (!isAdmin) {
      const myPending = await this.prisma.approvalStep.findFirst({
        where: {
          requisitionId: req.id,
          status: 'PENDING',
          assignedApproverId: user.id,
        },
      });
      if (!myPending) {
        throw new ForbiddenException(
          'Apenas o aprovador atual (ou Admin) pode selecionar uma cotação.',
        );
      }
    }

    // Resolve condição (re-busca a descrição se mudou).
    const paymentCode = q.paymentConditionCode ?? null;

    // Resolve a empresa pra usar o erpDbName no check de vínculo.
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: req.companyId },
    });

    // Template original (referência fora da transação pra usar no check
    // de vínculo depois). Garante existência.
    const template = req.items[0];
    if (!template) {
      throw new BadRequestException(
        'A requisição não tem itens — não dá pra aplicar a cotação.',
      );
    }

    // Mapeia os itens da cotação para os items da requisição:
    // - Apaga e recria (mesma lógica de antes), MAS:
    //   * Mantém `itemErpCode` original (não limpa) — se a cotação não
    //     tem item no catálogo do novo fornecedor, deixamos a pendência
    //     fiscal abrir e a aprovação fiscal vincula.
    //   * Grava SNAPSHOT da proposta original APENAS na primeira seleção
    //     pra suportar `clearWinner` (voltar pra proposta do solicitante).
    await this.prisma.$transaction(async (tx) => {
      // Snapshot da proposta original do solicitante — gravado só na
      // PRIMEIRA seleção. Trocar entre cotações alternativas não sobrescreve
      // o snapshot (continua sendo a proposta original do solicitante).
      if (!req.originalProposalSnapshot) {
        const snapshot = {
          supplierErpCode: req.supplierErpCode,
          supplierName: req.supplierName,
          supplierCnpj: req.supplierCnpj,
          paymentConditionCode: req.paymentConditionCode,
          paymentConditionDesc: req.paymentConditionDesc,
          totalAmount: req.totalAmount.toString(),
          needsSupplierErpCreation: req.needsSupplierErpCreation,
          items: req.items.map((it) => ({
            itemErpCode: it.itemErpCode,
            itemDescription: it.itemDescription,
            unit: it.unit,
            quantity: it.quantity.toString(),
            estimatedPrice: it.estimatedPrice.toString(),
            totalPrice: it.totalPrice.toString(),
            accountingAccount: it.accountingAccount,
            accountName: it.accountName,
            branchRateioCode: it.branchRateioCode,
            branchRateioDesc: it.branchRateioDesc,
            costCenterRateioCode: it.costCenterRateioCode,
            costCenterRateioDesc: it.costCenterRateioDesc,
            notes: it.notes,
          })),
        };
        await tx.requisition.update({
          where: { id: req.id },
          data: { originalProposalSnapshot: JSON.stringify(snapshot) },
        });
      }

      // Desmarca qualquer outra cotação vencedora desta req.
      await tx.quotation.updateMany({
        where: { requisitionId: req.id, isWinner: true, id: { not: q.id } },
        data: {
          isWinner: false,
          selectedAt: null,
          selectedById: null,
        },
      });
      await tx.quotation.update({
        where: { id: q.id },
        data: {
          isWinner: true,
          selectedAt: new Date(),
          selectedById: user.id,
          selectionReason: trimmed,
        },
      });

      // Apaga rateios e items antigos.
      await tx.requisitionItemRateio.deleteMany({
        where: { requisitionItemId: { in: req.items.map((i) => i.id) } },
      });
      await tx.requisitionItem.deleteMany({
        where: { requisitionId: req.id },
      });
      // Cria items novos a partir da cotação. itemErpCode herdado do
      // template original (NÃO limpa, mesmo se o fornecedor mudou) — a
      // checagem de vínculo + pendência fiscal cuida do resto abaixo.
      for (const qi of q.items) {
        await tx.requisitionItem.create({
          data: {
            requisitionId: req.id,
            itemErpCode: template.itemErpCode,
            itemDescription: qi.description,
            unit: qi.unit ?? template.unit,
            quantity: qi.quantity,
            estimatedPrice: qi.unitPrice,
            totalPrice: qi.totalPrice,
            accountingAccount: template.accountingAccount,
            accountName: template.accountName,
            branchRateioCode: template.branchRateioCode,
            branchRateioDesc: template.branchRateioDesc,
            costCenterRateioCode: template.costCenterRateioCode,
            costCenterRateioDesc: template.costCenterRateioDesc,
            notes: template.notes,
          },
        });
      }

      // Atualiza cabeçalho da requisição.
      await tx.requisition.update({
        where: { id: req.id },
        data: {
          supplierErpCode: q.supplierErpCode ?? req.supplierErpCode,
          supplierName: q.supplierName,
          paymentConditionCode: paymentCode,
          paymentConditionDesc: q.paymentConditionDesc,
          totalAmount: q.totalAmount,
          winningQuotationId: q.id,
          needsSupplierErpCreation: q.supplierErpCode === null,
        },
      });
    });

    // Pendência fiscal: pra cada item da nova vencedora, verifica se
    // (novoFornecedor, itemErpCode) está vinculado no Linx. Se não está
    // AND não existe FiscalItemRequest APPROVED prévio, abre uma nova
    // pendência. O convert bloqueia até resolução. Se o fornecedor é
    // externo (sem erpCode), a checagem fica pra depois (vínculo só
    // pode ser feito após o fornecedor existir no Linx).
    if (q.supplierErpCode && template.itemErpCode) {
      try {
        const linked = await this.integration.isSupplierItemLinked(
          company.erpDbName,
          q.supplierErpCode,
          template.itemErpCode,
        );
        if (!linked) {
          // Verifica se há pendência APPROVED prévia (mesmo fornecedor+item).
          const alreadyApproved = await this.prisma.fiscalItemRequest.findFirst(
            {
              where: {
                companyId: req.companyId,
                supplierErpCode: q.supplierErpCode,
                itemErpCode: template.itemErpCode,
                status: 'APPROVED',
              },
            },
          );
          // E se já tem PENDING aberta (não duplica).
          const alreadyPending = await this.prisma.fiscalItemRequest.findFirst({
            where: {
              companyId: req.companyId,
              supplierErpCode: q.supplierErpCode,
              itemErpCode: template.itemErpCode,
              status: 'PENDING',
            },
          });
          if (!alreadyApproved && !alreadyPending) {
            await this.prisma.fiscalItemRequest.create({
              data: {
                companyId: req.companyId,
                type: 'LINK',
                status: 'PENDING',
                supplierErpCode: q.supplierErpCode,
                supplierName: q.supplierName,
                itemErpCode: template.itemErpCode,
                itemDescription:
                  q.items[0]?.description ?? template.itemDescription,
                unit: template.unit,
                requestedById: user.id,
                notes:
                  `Pendência aberta automaticamente: cotação de "${q.supplierName}" ` +
                  `selecionada como vencedora pra requisição ${req.number}. ` +
                  `O item ${template.itemErpCode} não está vinculado a este fornecedor no Linx.`,
              },
            });
          }
        }
      } catch (err) {
        // Não derruba a seleção se a checagem de vínculo falhar — só loga.
        // O convert vai pegar a inconsistência depois.
        console.warn(
          `[selectAsWinner] Falha ao verificar vínculo item-fornecedor: ${(err as Error).message}`,
        );
      }
    }

    return this.prisma.quotation.findUniqueOrThrow({
      where: { id: q.id },
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  /**
   * Restaura a proposta original do solicitante a partir do snapshot
   * gravado no momento da primeira `selectAsWinner`. Usado quando o
   * aprovador muda de ideia depois de escolher uma cotação alternativa.
   */
  async clearWinner(user: AuthenticatedUser, requisitionId: string) {
    const req = await this.prisma.requisition.findUnique({
      where: { id: requisitionId },
      include: { items: true },
    });
    if (!req || req.deletedAt) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    if (!req.originalProposalSnapshot) {
      throw new BadRequestException(
        'Não há proposta original salva para restaurar.',
      );
    }
    // Aprovador da etapa pendente OU Admin (mesma regra de selectAsWinner).
    const isAdmin = user.profile === UserProfile.ADMIN;
    if (!isAdmin) {
      const myPending = await this.prisma.approvalStep.findFirst({
        where: {
          requisitionId: req.id,
          status: 'PENDING',
          assignedApproverId: user.id,
        },
      });
      if (!myPending) {
        throw new ForbiddenException(
          'Apenas o aprovador atual (ou Admin) pode restaurar a proposta.',
        );
      }
    }

    const snapshot = JSON.parse(req.originalProposalSnapshot) as {
      supplierErpCode: string | null;
      supplierName: string;
      supplierCnpj: string | null;
      paymentConditionCode: string | null;
      paymentConditionDesc: string | null;
      totalAmount: string;
      needsSupplierErpCreation: boolean;
      items: Array<{
        itemErpCode: string | null;
        itemDescription: string;
        unit: string;
        quantity: string;
        estimatedPrice: string;
        totalPrice: string;
        accountingAccount: string;
        accountName: string | null;
        branchRateioCode: string;
        branchRateioDesc: string | null;
        costCenterRateioCode: string;
        costCenterRateioDesc: string | null;
        notes: string | null;
      }>;
    };

    await this.prisma.$transaction(async (tx) => {
      // Desmarca a vencedora atual.
      await tx.quotation.updateMany({
        where: { requisitionId: req.id, isWinner: true },
        data: { isWinner: false, selectedAt: null, selectedById: null },
      });
      // Apaga items atuais e restaura do snapshot.
      await tx.requisitionItemRateio.deleteMany({
        where: { requisitionItemId: { in: req.items.map((i) => i.id) } },
      });
      await tx.requisitionItem.deleteMany({
        where: { requisitionId: req.id },
      });
      for (const it of snapshot.items) {
        await tx.requisitionItem.create({
          data: {
            requisitionId: req.id,
            itemErpCode: it.itemErpCode,
            itemDescription: it.itemDescription,
            unit: it.unit,
            quantity: it.quantity,
            estimatedPrice: it.estimatedPrice,
            totalPrice: it.totalPrice,
            accountingAccount: it.accountingAccount,
            accountName: it.accountName,
            branchRateioCode: it.branchRateioCode,
            branchRateioDesc: it.branchRateioDesc,
            costCenterRateioCode: it.costCenterRateioCode,
            costCenterRateioDesc: it.costCenterRateioDesc,
            notes: it.notes,
          },
        });
      }
      // Restaura cabeçalho. Mantém o snapshot pra permitir restore de
      // novo se o aprovador trocar/voltar várias vezes.
      await tx.requisition.update({
        where: { id: req.id },
        data: {
          supplierErpCode: snapshot.supplierErpCode,
          supplierName: snapshot.supplierName,
          supplierCnpj: snapshot.supplierCnpj,
          paymentConditionCode: snapshot.paymentConditionCode,
          paymentConditionDesc: snapshot.paymentConditionDesc,
          totalAmount: snapshot.totalAmount,
          winningQuotationId: null,
          needsSupplierErpCreation: snapshot.needsSupplierErpCreation,
        },
      });
    });

    return { ok: true };
  }
}
