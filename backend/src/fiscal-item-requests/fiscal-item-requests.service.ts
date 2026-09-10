import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationService } from '../integration/integration.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { UserProfile } from '../common/enums';
import { CreateFiscalItemRequestDto } from './dto/create-fiscal-item-request.dto';
import {
  ApproveFiscalItemRequestDto,
  RejectFiscalItemRequestDto,
} from './dto/resolve-fiscal-item-request.dto';
import { QueryFiscalItemRequestsDto } from './dto/query-fiscal-item-requests.dto';
import {
  CreateClassifiedItemDto,
  LinkItemDto,
} from './dto/classify-item.dto';
import type { ErpItem } from '../integration/integration.types';

const REQUESTER = { select: { id: true, name: true } };

@Injectable()
export class FiscalItemRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: IntegrationService,
  ) {}

  /** O usuário resolve pendências fiscais? Admin sempre pode; senão, equipe Fiscal. */
  private async isFiscalUser(user: AuthenticatedUser): Promise<boolean> {
    if (user.profile === UserProfile.ADMIN) return true;
    if (!user.teamId) return false;
    const team = await this.prisma.team.findUnique({
      where: { id: user.teamId },
    });
    return !!team?.isFiscal;
  }

  private async assertFiscalUser(user: AuthenticatedUser) {
    if (!(await this.isFiscalUser(user))) {
      throw new ForbiddenException(
        'Apenas a equipe Fiscal pode resolver pendências de item.',
      );
    }
  }

  /**
   * Abre uma pendência fiscal de VÍNCULO item-fornecedor. O cadastro de
   * itens novos é feito diretamente no Linx — o P2P só vincula.
   */
  async create(user: AuthenticatedUser, dto: CreateFiscalItemRequestDto) {
    if (!user.companyIds.includes(dto.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: dto.companyId },
    });
    const supplier = await this.integration.findSupplier(
      company.code,
      dto.supplierErpCode,
    );
    if (!supplier) {
      throw new BadRequestException('Fornecedor não encontrado no ERP.');
    }
    if (!dto.itemErpCode) {
      throw new BadRequestException('Informe o código do item para o vínculo.');
    }
    const item = await this.integration.findItem(company.code, dto.itemErpCode);
    if (!item) {
      throw new BadRequestException('Item não encontrado no catálogo.');
    }
    return this.prisma.fiscalItemRequest.create({
      data: {
        companyId: dto.companyId,
        type: 'LINK',
        status: 'PENDING',
        supplierErpCode: dto.supplierErpCode,
        supplierName: supplier.nome,
        itemErpCode: dto.itemErpCode,
        itemDescription: dto.itemDescription,
        unit: dto.unit ?? null,
        requestedById: user.id,
        notes: dto.notes ?? null,
      },
    });
  }

  /**
   * Lista pendências. A equipe Fiscal vê todas do seu escopo de empresas;
   * os demais veem apenas as que abriram.
   */
  async findAll(user: AuthenticatedUser, query: QueryFiscalItemRequestsDto) {
    const fiscal = await this.isFiscalUser(user);
    const { companyId, status, skip = 0, take = 50 } = query;
    const where: Prisma.FiscalItemRequestWhereInput = {
      companyId:
        companyId && user.companyIds.includes(companyId)
          ? companyId
          : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(fiscal ? {} : { requestedById: user.id }),
    };
    const [data, total] = await Promise.all([
      this.prisma.fiscalItemRequest.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
      }),
      this.prisma.fiscalItemRequest.count({ where }),
    ]);
    return { data, total, skip, take, isFiscalUser: fiscal };
  }

  /** Detalhe de uma pendência fiscal. */
  async findOne(user: AuthenticatedUser, id: string) {
    const req = await this.prisma.fiscalItemRequest.findUnique({
      where: { id },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });
    if (!req) {
      throw new NotFoundException('Pendência fiscal não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta pendência.');
    }
    // Rastro reverso: como o modelo é por (fornecedor+item) e não tem FK
    // pra requisição, listamos aqui as requisições que casam (mesma empresa,
    // fornecedor e descrição do item) — incluindo as deletadas, pra explicar
    // pendências órfãs (ex.: a req de origem foi cancelada).
    const relatedRequisitions = await this.prisma.requisition.findMany({
      where: {
        companyId: req.companyId,
        supplierErpCode: req.supplierErpCode,
        items: { some: { itemDescription: req.itemDescription } },
      },
      select: {
        id: true,
        number: true,
        status: true,
        deletedAt: true,
        createdAt: true,
        requester: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { ...req, relatedRequisitions };
  }

  /**
   * Aprova a pendência e grava o vínculo item-fornecedor no Linx
   * (SS_ITEM_FISCAL_FORNECEDOR).
   *
   * A equipe Fiscal não rejeita: se discordar do item, informa em
   * `itemErpCode` o item correto — o vínculo é feito com ele e o
   * solicitante é notificado da alteração.
   */
  async approve(
    user: AuthenticatedUser,
    id: string,
    dto: ApproveFiscalItemRequestDto,
  ) {
    await this.assertFiscalUser(user);
    const req = await this.findOne(user, id);
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Esta pendência já foi resolvida.');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: req.companyId },
    });

    // Item a vincular: o original, ou o corrigido pela equipe Fiscal.
    let itemCode = req.itemErpCode as string;
    const itemChanged = !!dto.itemErpCode && dto.itemErpCode !== itemCode;
    if (itemChanged) {
      const corrected = await this.integration.findItem(
        company.code,
        dto.itemErpCode as string,
      );
      if (!corrected) {
        throw new BadRequestException(
          'Item corrigido não encontrado no catálogo do Linx.',
        );
      }
      itemCode = dto.itemErpCode as string;
    }

    await this.integration.linkSupplierItem(
      company.erpDbName,
      req.supplierErpCode,
      itemCode,
    );

    const updated = await this.prisma.fiscalItemRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        itemErpCode: itemCode,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });

    // Notifica o solicitante se a equipe Fiscal trocou o item.
    if (itemChanged) {
      await this.prisma.notification.create({
        data: {
          companyId: req.companyId,
          userId: req.requestedById,
          type: 'GENERAL',
          title: 'Item alterado pela equipe Fiscal',
          body:
            `A equipe Fiscal vinculou o item ${itemCode} no lugar de ` +
            `${req.itemErpCode} na pendência "${req.itemDescription}".`,
          entityType: 'FISCAL_ITEM_REQUEST',
          entityId: req.id,
        },
      });
    }
    return updated;
  }

  /**
   * Rejeita/descarta uma pendência (ex.: órfã — a requisição de origem foi
   * cancelada). Vira REJECTED e sai da fila. Só equipe Fiscal.
   */
  async reject(
    user: AuthenticatedUser,
    id: string,
    dto: RejectFiscalItemRequestDto,
  ) {
    await this.assertFiscalUser(user);
    const req = await this.findOne(user, id);
    if (req.status !== 'PENDING') {
      throw new BadRequestException('Esta pendência já foi resolvida.');
    }
    const updated = await this.prisma.fiscalItemRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: dto.rejectionReason,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
      include: { requestedBy: REQUESTER, resolvedBy: REQUESTER },
    });
    await this.prisma.notification.create({
      data: {
        companyId: req.companyId,
        userId: req.requestedById,
        type: 'GENERAL',
        title: 'Pendência fiscal rejeitada',
        body:
          `A pendência "${req.itemDescription}" foi rejeitada pela equipe ` +
          `Fiscal. Motivo: ${dto.rejectionReason}`,
        entityType: 'FISCAL_ITEM_REQUEST',
        entityId: req.id,
      },
    });
    return updated;
  }

  // ============================================================
  // Classificação de item LIVRE (descrição solta, sem código no ERP).
  // O solicitante descreveu o item; a equipe fiscal vincula um item que
  // já existe OU cria um novo no Linx. Em ambos, a conta contábil volta
  // pro item da requisição e o vínculo item↔fornecedor é gravado (assim
  // da próxima vez o item já aparece nos itens do fornecedor).
  // ============================================================

  /** Só itens livres em requisições vivas (enviadas/aprovadas, não convertidas). */
  private static readonly CLASSIFY_STATUSES = ['SUBMITTED', 'APPROVED'];

  /** Palavras-chave da descrição, pra buscar itens parecidos no catálogo. */
  private keywords(text: string): string[] {
    const stop = new Set([
      'para', 'com', 'sem', 'dos', 'das', 'que', 'por', 'nos', 'nas', 'uma',
      'item', 'itens', 'servico', 'serviço', 'produto', 'novo', 'nova',
    ]);
    return Array.from(
      new Set(
        (text || '')
          .toLowerCase()
          .split(/[^a-zà-ú0-9]+/i)
          .filter((w) => w.length >= 4 && !stop.has(w)),
      ),
    ).slice(0, 4);
  }

  /** Fila do fiscal: itens livres aguardando classificação. */
  async classificationQueue(
    user: AuthenticatedUser,
    query: QueryFiscalItemRequestsDto,
  ) {
    await this.assertFiscalUser(user);
    const { companyId, skip = 0, take = 50 } = query;
    const companyFilter =
      companyId && user.companyIds.includes(companyId)
        ? companyId
        : { in: user.companyIds };
    const where: Prisma.RequisitionItemWhereInput = {
      itemErpCode: null,
      requisition: {
        companyId: companyFilter,
        deletedAt: null,
        status: { in: FiscalItemRequestsService.CLASSIFY_STATUSES },
      },
    };
    const [data, total] = await Promise.all([
      this.prisma.requisitionItem.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          itemDescription: true,
          quantity: true,
          unit: true,
          estimatedPrice: true,
          branchRateioCode: true,
          costCenterRateioCode: true,
          createdAt: true,
          requisition: {
            select: {
              id: true,
              number: true,
              companyId: true,
              status: true,
              supplierErpCode: true,
              supplierName: true,
              company: { select: { code: true } },
              requester: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.requisitionItem.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /** Carrega um item da fila e valida acesso + que ainda está livre. */
  private async loadFreeItem(user: AuthenticatedUser, reqItemId: string) {
    const item = await this.prisma.requisitionItem.findUnique({
      where: { id: reqItemId },
      include: { requisition: { include: { company: true } } },
    });
    if (!item) {
      throw new NotFoundException('Item da requisição não encontrado.');
    }
    const requisition = item.requisition;
    if (!user.companyIds.includes(requisition.companyId)) {
      throw new ForbiddenException('Sem acesso a este item.');
    }
    if (item.itemErpCode) {
      throw new BadRequestException('Este item já está classificado.');
    }
    if (!FiscalItemRequestsService.CLASSIFY_STATUSES.includes(requisition.status)) {
      throw new BadRequestException(
        'A requisição não está num estado que permita classificar itens.',
      );
    }
    return { item, requisition, company: requisition.company };
  }

  /** Sugestões: itens existentes parecidos com a descrição (vinculados no topo). */
  async classificationSuggestions(user: AuthenticatedUser, reqItemId: string) {
    await this.assertFiscalUser(user);
    const { item, requisition, company } = await this.loadFreeItem(
      user,
      reqItemId,
    );
    const kws = this.keywords(item.itemDescription);
    const terms = kws.length ? kws : [item.itemDescription.trim()];

    const hits = new Map<string, { item: ErpItem; n: number }>();
    for (const t of terms) {
      const rows = await this.integration.getItems(company.code, {
        search: t,
        onlyActive: true,
      });
      for (const r of rows) {
        const cur = hits.get(r.codigo);
        if (cur) cur.n += 1;
        else hits.set(r.codigo, { item: r, n: 1 });
      }
    }

    const linked = requisition.supplierErpCode
      ? new Set(
          (
            await this.integration.getSupplierItems(
              company.code,
              requisition.supplierErpCode,
            )
          ).map((i) => i.codigo),
        )
      : new Set<string>();

    const suggestions = Array.from(hits.values())
      .map(({ item: i, n }) => ({
        codigo: i.codigo,
        descricao: i.descricao,
        unidade: i.unidade,
        contaContabilPadrao: i.contaContabilPadrao,
        grupo: i.grupo,
        linked: linked.has(i.codigo),
        score: n,
      }))
      .sort(
        (a, b) =>
          Number(b.linked) - Number(a.linked) ||
          b.score - a.score ||
          a.descricao.localeCompare(b.descricao),
      )
      .slice(0, 12);

    return { description: item.itemDescription, suggestions };
  }

  /** Notifica o solicitante que o item livre foi classificado. */
  private async notifyClassified(
    requisition: { id: string; companyId: string; requesterId: string },
    description: string,
    itemCode: string,
    created: boolean,
  ) {
    await this.prisma.notification.create({
      data: {
        companyId: requisition.companyId,
        userId: requisition.requesterId,
        type: 'GENERAL',
        title: 'Item classificado pela equipe Fiscal',
        body:
          `O item "${description}" foi ${created ? 'cadastrado' : 'vinculado'} ` +
          `pela equipe Fiscal (${itemCode}). A requisição já pode virar pedido.`,
        entityType: 'REQUISITION',
        entityId: requisition.id,
      },
    });
  }

  /**
   * Registra a ação do fiscal (vincular/cadastrar) como um FiscalItemRequest
   * já APROVADO — é o rastro de histórico. Fica na mesma fonte do "a vincular"
   * resolvido, então a aba Histórico mostra tudo junto (Vinculado = LINK,
   * Cadastrado = NEW).
   */
  private async recordItemAction(
    user: AuthenticatedUser,
    requisition: {
      companyId: string;
      requesterId: string;
      supplierErpCode: string | null;
      supplierName: string;
    },
    type: 'LINK' | 'NEW',
    itemErpCode: string,
    item: { itemDescription: string; unit: string },
  ) {
    await this.prisma.fiscalItemRequest.create({
      data: {
        companyId: requisition.companyId,
        type,
        status: 'APPROVED',
        supplierErpCode: requisition.supplierErpCode ?? '',
        supplierName: requisition.supplierName,
        itemErpCode,
        itemDescription: item.itemDescription,
        unit: item.unit,
        requestedById: requisition.requesterId,
        resolvedById: user.id,
        resolvedAt: new Date(),
        notes:
          type === 'NEW'
            ? 'Item livre cadastrado no Linx pela equipe fiscal.'
            : 'Item livre vinculado a um item existente pela equipe fiscal.',
      },
    });
  }

  /** Vincula um item JÁ existente do Linx ao item livre da requisição. */
  async resolveLink(
    user: AuthenticatedUser,
    reqItemId: string,
    dto: LinkItemDto,
  ) {
    await this.assertFiscalUser(user);
    const { requisition, company } = await this.loadFreeItem(user, reqItemId);
    const erpItem = await this.integration.findItem(
      company.code,
      dto.itemErpCode,
    );
    if (!erpItem) {
      throw new BadRequestException('Item não encontrado no catálogo do Linx.');
    }
    const conta = erpItem.contaContabilPadrao?.trim();
    if (!conta) {
      throw new BadRequestException(
        'O item escolhido não tem conta contábil no Linx. Escolha outro ou cadastre um novo.',
      );
    }
    const account = await this.integration.findAccount(company.code, conta);

    // Vínculo item↔fornecedor (se o fornecedor já está no ERP).
    if (requisition.supplierErpCode) {
      await this.integration.linkSupplierItem(
        company.erpDbName,
        requisition.supplierErpCode,
        erpItem.codigo,
      );
    }
    const updated = await this.prisma.requisitionItem.update({
      where: { id: reqItemId },
      data: {
        itemErpCode: erpItem.codigo,
        accountingAccount: conta,
        accountName: account?.nome ?? null,
      },
    });
    await this.recordItemAction(
      user,
      requisition,
      'LINK',
      erpItem.codigo,
      updated,
    );
    await this.notifyClassified(
      requisition,
      updated.itemDescription,
      erpItem.codigo,
      false,
    );
    return updated;
  }

  /**
   * Cria um item fiscal novo no Linx e o vincula ao item livre. Com
   * `confirm !== true`, só devolve a PRÉVIA do que será gravado (não grava).
   */
  async resolveCreate(
    user: AuthenticatedUser,
    reqItemId: string,
    dto: CreateClassifiedItemDto,
  ) {
    await this.assertFiscalUser(user);
    const { item, requisition, company } = await this.loadFreeItem(
      user,
      reqItemId,
    );
    const account = await this.integration.findAccount(
      company.code,
      dto.accountingAccount,
    );
    if (!account) {
      throw new BadRequestException(
        `Conta contábil inválida: ${dto.accountingAccount}`,
      );
    }
    const fields = {
      descricao: (dto.descricao ?? item.itemDescription).trim().slice(0, 80),
      unidade: (dto.unidade ?? item.unit).trim().slice(0, 5),
      contaContabil: dto.accountingAccount,
      ncm: dto.ncm?.trim() || null,
      origem: dto.origem?.trim() || null,
      grupo: dto.grupo?.trim() || null,
      tipoSped: dto.tipoSped?.trim() || null,
      cfop: dto.cfop ?? null,
      rateioFilial: item.branchRateioCode || null,
      rateioCc: item.costCenterRateioCode || null,
    };

    // Prévia: mostra o item EXATO que vai ser gravado, sem gravar.
    if (dto.confirm !== true) {
      const codigo = await this.integration.nextItemFiscalCode(
        company.erpDbName,
      );
      return {
        preview: true,
        item: {
          codigo,
          ...fields,
          ncm: fields.ncm ?? '00000000',
          origem: fields.origem ?? '0',
          contaNome: account.nome,
        },
      };
    }

    const codigo = await this.integration.createItemFiscal(
      company.erpDbName,
      fields,
    );
    if (requisition.supplierErpCode) {
      await this.integration.linkSupplierItem(
        company.erpDbName,
        requisition.supplierErpCode,
        codigo,
      );
    }
    const updated = await this.prisma.requisitionItem.update({
      where: { id: reqItemId },
      data: {
        itemErpCode: codigo,
        accountingAccount: dto.accountingAccount,
        accountName: account.nome,
      },
    });
    await this.recordItemAction(user, requisition, 'NEW', codigo, updated);
    await this.notifyClassified(
      requisition,
      updated.itemDescription,
      codigo,
      true,
    );
    return { preview: false, created: codigo, item: updated };
  }
}
