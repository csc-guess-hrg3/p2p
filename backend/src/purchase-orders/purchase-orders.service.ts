import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NumberingService } from '../numbering/numbering.service';
import { LinxErpService } from '../integration/linx-erp.service';
import { EmailService } from '../integration/email.service';
import { IntegrationService } from '../integration/integration.service';
import {
  FundRequestStatus,
  PurchaseOrderStatus,
  RequisitionNfType,
  RequisitionStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { ConvertToPurchaseOrderDto } from './dto/convert-to-po.dto';
import { QueryPurchaseOrdersDto } from './dto/query-purchase-orders.dto';

interface SnapshotLine {
  kind: string;
  rateioCode: string;
  targetCode: string;
  branchCode: string | null;
  percentage: Prisma.Decimal;
}

@Injectable()
export class PurchaseOrdersService {
  private readonly logger = new Logger(PurchaseOrdersService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly linx: LinxErpService,
    private readonly email: EmailService,
    private readonly integration: IntegrationService,
  ) {}

  /**
   * Recalcula os valores das linhas de rateio para um novo total
   * (o preço negociado pode diferir do estimado da requisição).
   * Mantém os percentuais; a última linha de cada tipo absorve o resíduo.
   */
  private recomputeRateios(lines: SnapshotLine[], total: number) {
    const out: {
      kind: string;
      rateioCode: string;
      targetCode: string;
      branchCode: string | null;
      percentage: number;
      amount: number;
    }[] = [];
    for (const kind of ['BRANCH', 'COST_CENTER']) {
      const group = lines.filter((l) => l.kind === kind);
      let allocated = 0;
      group.forEach((l, i) => {
        const pct = Number(l.percentage);
        const isLast = i === group.length - 1;
        const amount = isLast
          ? Number((total - allocated).toFixed(2))
          : Number(((total * pct) / 100).toFixed(2));
        allocated += amount;
        out.push({
          kind: l.kind,
          rateioCode: l.rateioCode,
          targetCode: l.targetCode,
          branchCode: l.branchCode,
          percentage: pct,
          amount,
        });
      });
    }
    return out;
  }

  /**
   * Valida os dados antes de criar o PC e tentar gravar no Linx.
   * Erro aqui é amigável — agrupa todos os problemas em uma única
   * mensagem em vez de deixar o ERP estourar um "não aceita NULL"
   * críptico depois.
   */
  private validateForConvert(
    req: any,
    company: any,
    expectedDelivery: Date | null,
  ): void {
    const problems: string[] = [];
    if (!expectedDelivery) {
      problems.push('Data de entrega prevista é obrigatória.');
    }
    if (!req.tipoCompra) problems.push('Tipo de compra não preenchido.');
    if (req.ctbTipoOperacao == null)
      problems.push('Operação contábil (fiscal) não preenchida.');
    if (!req.naturezaEntrada)
      problems.push('Natureza de entrada (fiscal) não preenchida.');
    if (!req.paymentConditionCode)
      problems.push('Condição de pagamento não preenchida.');
    if (!company.erpConfig) {
      problems.push(
        `Empresa ${company.code} sem configuração de integração com o ERP.`,
      );
    }
    for (const it of req.items) {
      const tag = `item "${it.itemDescription}"`;
      if (!it.itemErpCode) problems.push(`${tag}: código do item ausente.`);
      if (!it.accountingAccount) problems.push(`${tag}: conta contábil ausente.`);
      if (!it.branchRateioCode) problems.push(`${tag}: rateio de filial ausente.`);
      if (!it.costCenterRateioCode)
        problems.push(`${tag}: rateio de centro de custo ausente.`);
      if (!it.unit) problems.push(`${tag}: unidade ausente.`);
      if (Number(it.quantity) <= 0) problems.push(`${tag}: quantidade <= 0.`);
    }
    if (problems.length > 0) {
      throw new BadRequestException(problems.join(' '));
    }
  }

  /**
   * Bucketiza os itens em grupos sem conflito de PK do Linx
   * (CONSUMIVEL, ENTREGA, PEDIDO). Cada bucket vira um PC separado.
   * Como PEDIDO é único por PC, a colisão real é em (itemErpCode,
   * ENTREGA) — que tipicamente é o `expectedDelivery` do PC inteiro.
   * Se a requisição tem duas linhas do mesmo item com rateios diferentes,
   * elas precisam ir para PCs diferentes pra não colidirem.
   */
  private bucketizeForPk(items: any[]): any[][] {
    const buckets: any[][] = [];
    for (const it of items) {
      const key = it.itemErpCode ?? `livre:${it.itemDescription}`;
      let placed = false;
      for (const b of buckets) {
        if (!b.some((x) => (x.itemErpCode ?? `livre:${x.itemDescription}`) === key)) {
          b.push(it);
          placed = true;
          break;
        }
      }
      if (!placed) buckets.push([it]);
    }
    return buckets;
  }

  /**
   * Converte uma requisição aprovada em Pedido(s) de Compra.
   *
   * Mudança importante (decisão (b) do time): a gravação no Linx é
   * automática, sem botão "Enviar ao fornecedor". Em consumíveis o
   * fluxo de e-mail foi descontinuado. Cada PC nasce APPROVED e vai
   * direto para INTEGRATED após a gravação no Linx.
   *
   * Quando a requisição tem linhas que colidiriam na PK do Linx
   * (mesmo CONSUMIVEL + mesma ENTREGA), os itens são desmembrados em
   * múltiplos PCs (ver `bucketizeForPk`).
   */
  async convert(user: AuthenticatedUser, dto: ConvertToPurchaseOrderDto) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não cria pedidos de compra.');
    }

    const req = await this.prisma.requisition.findUnique({
      where: { id: dto.requisitionId },
      include: { items: { include: { rateios: true } } },
    });
    if (!req || req.deletedAt) {
      throw new NotFoundException('Requisição não encontrada.');
    }
    if (!user.companyIds.includes(req.companyId)) {
      throw new ForbiddenException('Sem acesso a esta requisição.');
    }
    if (req.status !== RequisitionStatus.APPROVED) {
      throw new BadRequestException(
        'Só requisições aprovadas podem virar pedido de compra.',
      );
    }
    if (req.tipoNotaFiscal === RequisitionNfType.SEM_NF) {
      throw new BadRequestException(
        'Requisição sem nota fiscal não gera pedido de compra — gera Solicitação de Verba.',
      );
    }
    const existing = await this.prisma.purchaseOrder.findFirst({
      where: { requisitionId: req.id, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(
        'Esta requisição já foi convertida em pedido de compra.',
      );
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: req.companyId },
      include: { erpConfig: true },
    });

    const expectedDelivery = dto.expectedDelivery
      ? new Date(dto.expectedDelivery)
      : null;
    this.validateForConvert(req, company, expectedDelivery);

    // Transportadora: DTO (escolha do comprador no diálogo) ou fallback
    // pra default da empresa (CompanyErpConfig.transportadoraPadrao).
    // Pelo menos uma das duas precisa existir — o trigger LXI_COMPRAS
    // do Linx faz rollback se o valor enviado não bater com FK de
    // TRANSPORTADORAS, então é melhor falhar aqui com mensagem clara.
    const transportadora =
      dto.transportadora?.trim() ||
      company.erpConfig?.transportadoraPadrao ||
      null;
    if (!transportadora) {
      throw new BadRequestException(
        'Transportadora obrigatória. Escolha uma no diálogo de conversão ' +
          `ou configure a padrão da empresa ${company.code} em ` +
          'Administração → Integração ERP → Transportadora padrão.',
      );
    }

    const priceOverride = new Map(
      (dto.items ?? []).map((i) => [i.requisitionItemId, i.unitPrice]),
    );

    // Monta os itens enriquecidos a partir dos itens da requisição.
    const enrichedItems = req.items.map((it) => {
      const unitPrice = priceOverride.get(it.id) ?? Number(it.estimatedPrice);
      const totalPrice = Number((Number(it.quantity) * unitPrice).toFixed(2));
      return {
        requisitionItemId: it.id,
        itemErpCode: it.itemErpCode,
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice,
        totalPrice,
        accountingAccount: it.accountingAccount,
        accountName: it.accountName,
        branchRateioCode: it.branchRateioCode,
        branchRateioDesc: it.branchRateioDesc,
        costCenterRateioCode: it.costCenterRateioCode,
        costCenterRateioDesc: it.costCenterRateioDesc,
        notes: it.notes,
        rateios: it.rateios,
      };
    });

    // Divide em buckets — cada bucket vira um PC sem colisão de PK Linx.
    const buckets = this.bucketizeForPk(enrichedItems);
    const isAdvance = req.tipoNotaFiscal === RequisitionNfType.NF_FUTURA;
    const svDueDate = dto.fundRequestDueDate
      ? new Date(dto.fundRequestDueDate)
      : expectedDelivery ?? new Date();
    const now = new Date();
    const created: any[] = [];

    // Cria cada PC do bucket em uma transação separada — bucket pequeno
    // (1..N) e isolado por requisição, então segurança é OK.
    for (const bucket of buckets) {
      const number = await this.numbering.next(company.code, 'OC');
      const svNumber = isAdvance
        ? await this.numbering.next(company.code, 'SV')
        : null;
      const bucketTotal = bucket.reduce((s, x) => s + Number(x.totalPrice), 0);
      const poItems = bucket.map((it) => ({
        requisitionItemId: it.requisitionItemId,
        itemErpCode: it.itemErpCode,
        itemDescription: it.itemDescription,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice,
        accountingAccount: it.accountingAccount,
        accountName: it.accountName,
        branchRateioCode: it.branchRateioCode,
        branchRateioDesc: it.branchRateioDesc,
        costCenterRateioCode: it.costCenterRateioCode,
        costCenterRateioDesc: it.costCenterRateioDesc,
        notes: it.notes,
        rateios: {
          create: this.recomputeRateios(it.rateios, it.totalPrice),
        },
      }));

      const po = await this.prisma.$transaction(
        async (tx) => {
          const c = await tx.purchaseOrder.create({
            data: {
              number,
              requisitionId: req.id,
              companyId: req.companyId,
              branchErpCode: req.branchErpCode,
              branchName: req.branchName,
              supplierErpCode: req.supplierErpCode,
              supplierName: req.supplierName,
              buyerId: user.id,
              status: PurchaseOrderStatus.APPROVED,
              approvedAt: now,
              paymentCondition: dto.paymentCondition ?? null,
              transportadora,
              deliveryAddress: dto.deliveryAddress ?? null,
              expectedDelivery,
              totalAmount: Number(bucketTotal.toFixed(2)),
              items: { create: poItems },
            },
            include: { items: true },
          });
          if (isAdvance) {
            await tx.fundRequest.create({
              data: {
                number: svNumber as string,
                companyId: req.companyId,
                requisitionId: req.id,
                purchaseOrderId: c.id,
                requesterId: user.id,
                title: req.title,
                status: FundRequestStatus.APPROVED,
                approvedAt: now,
                totalAmount: c.totalAmount,
                items: {
                  create: c.items.map((it) => ({
                    itemErpCode: it.itemErpCode,
                    description: it.itemDescription,
                    beneficiaryName: req.supplierName,
                    accountingAccount: it.accountingAccount,
                    accountName: it.accountName,
                    branchRateioCode: it.branchRateioCode,
                    branchRateioDesc: it.branchRateioDesc,
                    costCenterRateioCode: it.costCenterRateioCode,
                    costCenterRateioDesc: it.costCenterRateioDesc,
                    amount: it.totalPrice,
                    dueDate: svDueDate,
                  })),
                },
              },
            });
          }
          return tx.purchaseOrder.findUniqueOrThrow({
            where: { id: c.id },
            include: {
              items: { include: { rateios: true } },
              fundRequest: true,
            },
          });
        },
        { maxWait: 15000, timeout: 30000 },
      );

      // Gravação automática no Linx — sem botão, sem e-mail.
      // Falha aqui aborta o convert inteiro (rollback do PC criado).
      try {
        const { pedido } = await this.linx.gravarPedidoCompra(po, user);
        await this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: {
            status: PurchaseOrderStatus.INTEGRATED,
            integratedAt: new Date(),
            erpPedido: pedido,
          },
        });
        created.push({ ...po, status: PurchaseOrderStatus.INTEGRATED, erpPedido: pedido });
      } catch (err) {
        // Rollback dos PCs já criados — soft delete pra preservar histórico.
        for (const c of created) {
          await this.prisma.purchaseOrder.update({
            where: { id: c.id },
            data: { deletedAt: new Date() },
          });
        }
        await this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { deletedAt: new Date() },
        });
        // Traduz erros conhecidos do trigger LXI_COMPRAS pra mensagens
        // que o usuário consegue agir. O Linx devolve "Impossível Incluir
        // #COMPRAS #porque #<TABELA> #não existe" no raiserror.
        const raw = (err as Error)?.message ?? '';
        const m = raw.match(
          /porque\s*#?(FORNECEDORES|FILIAIS|MOEDAS|COND_ENT_PGTOS|TRANSPORTADORAS|PRODUCAO_PROGRAMA|COMPRAS_TIPOS|COMPRAS_STATUS|VENDAS|CTB_CENTRO_CUSTO_RATEIO|CTB_FILIAL_RATEIO)\b/i,
        );
        if (m) {
          const friendly: Record<string, string> = {
            FORNECEDORES: 'Fornecedor não cadastrado no Linx (TRANSPORTADORAS/FORNECEDORES).',
            FILIAIS: 'Filial não cadastrada no Linx.',
            MOEDAS: 'Moeda não cadastrada no Linx.',
            COND_ENT_PGTOS: 'Condição de pagamento não cadastrada no Linx.',
            TRANSPORTADORAS:
              'Transportadora não cadastrada no Linx — verifique a escolhida no diálogo ou o padrão configurado em Administração → Integração ERP.',
            PRODUCAO_PROGRAMA: 'Programa de produção não encontrado.',
            COMPRAS_TIPOS: 'Tipo de compra não cadastrado no Linx.',
            COMPRAS_STATUS: 'Status de compra inválido.',
            VENDAS: 'Referência de venda não encontrada.',
            CTB_CENTRO_CUSTO_RATEIO: 'Rateio de centro de custo inválido.',
            CTB_FILIAL_RATEIO: 'Rateio de filial inválido.',
          };
          throw new BadRequestException(
            friendly[m[1].toUpperCase()] ??
              `Validação do Linx falhou: ${m[1]}.`,
          );
        }
        if (raw.includes('transaction ended in the trigger')) {
          throw new BadRequestException(
            'O Linx rejeitou o pedido (trigger interna abortou). ' +
              'Mensagem original: ' +
              raw,
          );
        }
        throw err;
      }
    }

    await this.prisma.requisition.update({
      where: { id: req.id },
      data: { status: RequisitionStatus.CONVERTED },
    });

    // Devolve o primeiro PC (compatível com o frontend que navega
    // pra /pedidos/:id após converter). Anexa `siblings` quando houver
    // mais de um, pra UI exibir "também foram criados PCs X e Y".
    const [first, ...rest] = created;
    return rest.length > 0
      ? { ...first, siblings: rest.map((p) => ({ id: p.id, number: p.number })) }
      : first;
  }

  /** Lista pedidos de compra do escopo do usuário. */
  async findAll(user: AuthenticatedUser, query: QueryPurchaseOrdersDto) {
    const { companyId, status, search, skip = 0, take = 50 } = query;
    if (companyId && !user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const where: Prisma.PurchaseOrderWhereInput = {
      deletedAt: null,
      companyId: companyId ? companyId : { in: user.companyIds },
      ...(status ? { status } : {}),
      ...(search ? { number: { contains: search } } : {}),
    };
    // Select enxuto — evita NVarChar(Max) inúteis (notes, cancellationReason)
    // e cobre o que a UI da listagem usa.
    const [data, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          supplierName: true,
          branchName: true,
          status: true,
          totalAmount: true,
          expectedDelivery: true,
          createdAt: true,
          buyer: { select: { id: true, name: true } },
        },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { data, total, skip, take };
  }

  /** Detalhe de um pedido de compra. */
  async findOne(user: AuthenticatedUser, id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { rateios: true } },
        buyer: { select: { id: true, name: true } },
        receivings: true,
      },
    });
    if (!po || po.deletedAt) {
      throw new NotFoundException('Pedido de compra não encontrado.');
    }
    if (!user.companyIds.includes(po.companyId)) {
      throw new ForbiddenException('Sem acesso a este pedido.');
    }
    return po;
  }

  /**
   * Envia o pedido ao fornecedor — fluxo completo:
   *  1) Grava no Linx (COMPRAS + COMPRAS_CONSUMIVEL + STATUS_LOG)
   *     usando LX_SEQUENCIAL para o nº do PEDIDO.
   *  2) Renderiza PDF, envia por e-mail (SMTP da empresa).
   *  3) Loga em COMPRAS_EMAIL_LOG (no Linx).
   *  4) Atualiza o PC: erpPedido, status SENT_TO_SUPPLIER, sentToSupplierAt.
   *
   * O e-mail pode ser pulado com `skipEmail=true` (caso o fornecedor não
   * tenha e-mail cadastrado e o comprador opte por enviar manualmente).
   */
  async sendToSupplier(
    user: AuthenticatedUser,
    id: string,
    opts: {
      recipientEmail?: string;
      skipEmail?: boolean;
      subject?: string;
      bodyText?: string;
    } = {},
  ) {
    const po = await this.findOne(user, id);
    if (po.status !== PurchaseOrderStatus.APPROVED) {
      throw new BadRequestException(
        'Só pedidos aprovados podem ser enviados ao fornecedor.',
      );
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });

    // 1) Grava no Linx (idempotente se já tiver erpPedido).
    const full = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
      include: { items: true },
    });
    const { pedido } = await this.linx.gravarPedidoCompra(full, user);

    // 2) Resolve destinatário e envia o e-mail (a menos que skipEmail).
    let emailSent = false;
    let emailRecipient: string | null = null;
    if (!opts.skipEmail) {
      let to = opts.recipientEmail?.trim() || '';
      if (!to) {
        const sup = await this.integration.findSupplier(
          company.code,
          po.supplierErpCode,
        );
        to = sup?.email?.trim() || '';
      }
      if (!to) {
        throw new BadRequestException(
          'Fornecedor sem e-mail cadastrado. Informe o destinatário ou marque ' +
            '"não notificar" para enviar manualmente.',
        );
      }
      const fullForEmail = await this.prisma.purchaseOrder.findUniqueOrThrow({
        where: { id: po.id },
        include: { items: true },
      });
      await this.email.sendPurchaseOrderEmail(
        { ...fullForEmail, erpPedido: pedido },
        {
          to,
          subject: opts.subject,
          bodyText: opts.bodyText,
        },
      );
      emailSent = true;
      emailRecipient = to;
      // 3) Log no Linx (best-effort).
      await this.linx.logEmail(
        company.erpDbName,
        pedido,
        to,
        user.name ?? user.adUsername ?? '',
        `Envio P2P PC ${po.number}`,
      );
    }

    // 4) Atualiza o PC.
    const now = new Date();
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT_TO_SUPPLIER,
        sentToSupplierAt: now,
        erpPedido: pedido,
        integratedAt: now,
      },
    });

    const updated = await this.findOne(user, id);
    return { ...updated, emailSent, emailRecipient };
  }

  /**
   * Cancela o pedido (RN-OC-02 / RN-OC-03). Por enquanto, **lean**:
   *  - Pedido com qualquer item já recebido (`receivedQty > 0`) é
   *    bloqueado — PRD diz que só os itens não recebidos podem ser
   *    cancelados. Cancelar item-a-item exige modelagem extra
   *    (`PurchaseOrderItem.cancelledQty`) e fica para a próxima rodada.
   *  - Cancelamento sempre exige motivo (validado pelo DTO).
   *  - Auditoria fica em `cancellationReason` + `cancelledAt`.
   *  - Não toca no Linx por enquanto (item da Rodada 4 — STATUS_COMPRA).
   */
  async cancel(
    user: AuthenticatedUser,
    id: string,
    cancellationReason: string,
  ) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não cancela pedido de compra.');
    }
    const po = await this.findOne(user, id);
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Pedido já está cancelado.');
    }
    if (po.status === PurchaseOrderStatus.FULLY_RECEIVED) {
      throw new BadRequestException(
        'Pedido totalmente recebido — não pode ser cancelado, apenas estornado.',
      );
    }
    const anyReceived = po.items.some((it) => Number(it.receivedQty) > 0);
    if (anyReceived) {
      throw new BadRequestException(
        'Pedido já tem recebimento. Use "Cancelar itens em aberto" pra ' +
          'cancelar só o saldo não recebido (PRD RN-OC-03).',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: PurchaseOrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason,
        },
      });
      // Marca cada item com cancelamento total — útil pra histórico.
      await tx.purchaseOrderItem.updateMany({
        where: { purchaseOrderId: id, cancelledAt: null },
        data: {
          cancelledAt: new Date(),
          cancellationReason,
        },
      });
      // Atualiza cancelledQty pra refletir o saldo cancelado
      // (quantity - receivedQty). Não dá pra fazer em updateMany simples
      // por depender de outra coluna — itera.
      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
        select: { id: true, quantity: true, receivedQty: true },
      });
      for (const it of items) {
        await tx.purchaseOrderItem.update({
          where: { id: it.id },
          data: {
            cancelledQty: Number(it.quantity) - Number(it.receivedQty),
          },
        });
      }
    });
    return this.findOne(user, id);
  }

  /**
   * RN-OC-03: cancelamento parcial de itens em aberto.
   *
   * Cancela só o saldo não-recebido dos itens informados (`quantity -
   * receivedQty`). Itens que já estão totalmente recebidos não podem
   * estar na lista. Se, após o cancelamento, **todos** os itens do
   * pedido estiverem fechados (recebidos OU cancelados), o pedido vira
   * CANCELLED como um todo — preservando saldo financeiro acertado.
   */
  async cancelItems(
    user: AuthenticatedUser,
    id: string,
    payload: { itemIds: string[]; reason: string },
  ) {
    if (user.profile === UserProfile.REVIEWER) {
      throw new ForbiddenException('Revisor não cancela itens de pedido.');
    }
    const reason = (payload.reason ?? '').trim();
    if (reason.length < 5) {
      throw new BadRequestException(
        'Motivo do cancelamento obrigatório (mínimo 5 caracteres).',
      );
    }
    if (!payload.itemIds || payload.itemIds.length === 0) {
      throw new BadRequestException('Informe pelo menos um item para cancelar.');
    }

    const po = await this.findOne(user, id);
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new BadRequestException('Pedido já está cancelado.');
    }

    const idSet = new Set(payload.itemIds);
    const targets = po.items.filter((it) => idSet.has(it.id));
    if (targets.length !== payload.itemIds.length) {
      throw new BadRequestException('Algum item informado não pertence ao pedido.');
    }
    for (const it of targets) {
      if (it.cancelledAt) {
        throw new BadRequestException(
          `Item ${it.itemDescription} já está cancelado.`,
        );
      }
      const saldo = Number(it.quantity) - Number(it.receivedQty);
      if (saldo <= 0) {
        throw new BadRequestException(
          `Item ${it.itemDescription} já foi totalmente recebido — não pode ser cancelado.`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      for (const it of targets) {
        const saldo = Number(it.quantity) - Number(it.receivedQty);
        await tx.purchaseOrderItem.update({
          where: { id: it.id },
          data: {
            cancelledQty: saldo,
            cancelledAt: now,
            cancellationReason: reason,
          },
        });
      }
      // Se todos os itens estão fechados → cancela o pedido inteiro.
      const remaining = await tx.purchaseOrderItem.count({
        where: {
          purchaseOrderId: id,
          cancelledAt: null,
          // Saldo aberto: quantity > receivedQty + cancelledQty
          // (atual: cancelledAt=null implica cancelledQty=0)
        },
      });
      const stillOpen = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id, cancelledAt: null },
        select: { quantity: true, receivedQty: true },
      });
      const anyOpen = stillOpen.some(
        (i) => Number(i.quantity) - Number(i.receivedQty) > 0,
      );
      if (remaining === 0 || !anyOpen) {
        await tx.purchaseOrder.update({
          where: { id },
          data: {
            status: PurchaseOrderStatus.CANCELLED,
            cancelledAt: now,
            cancellationReason: reason,
          },
        });
      }
    });
    this.logger.log(
      `PC ${po.number}: ${targets.length} itens cancelados por ${user.name} — ${reason}`,
    );
    return this.findOne(user, id);
  }

  /**
   * Reenvia o e-mail do pedido ao fornecedor. Não regrava no ERP — o
   * pedido já está lá (`erpPedido` setado). Útil quando o comprador
   * percebe que o e-mail anterior não chegou ou caiu em spam.
   */
  async resendToSupplier(
    user: AuthenticatedUser,
    id: string,
    opts: {
      recipientEmail?: string;
      subject?: string;
      bodyText?: string;
    } = {},
  ) {
    const po = await this.findOne(user, id);
    if (po.status !== PurchaseOrderStatus.SENT_TO_SUPPLIER &&
        po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED &&
        po.status !== PurchaseOrderStatus.FULLY_RECEIVED) {
      throw new BadRequestException(
        'Só pedidos já enviados podem ser reenviados.',
      );
    }
    if (!po.erpPedido) {
      throw new BadRequestException(
        'Pedido sem referência no ERP — use "Enviar ao Fornecedor" primeiro.',
      );
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: po.companyId },
    });

    let to = opts.recipientEmail?.trim() || '';
    if (!to) {
      const sup = await this.integration.findSupplier(
        company.code,
        po.supplierErpCode,
      );
      to = sup?.email?.trim() || '';
    }
    if (!to) {
      throw new BadRequestException(
        'E-mail do destinatário não informado.',
      );
    }

    const full = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: po.id },
      include: { items: true },
    });
    await this.email.sendPurchaseOrderEmail(full, {
      to,
      subject: opts.subject,
      bodyText: opts.bodyText,
    });
    await this.linx.logEmail(
      company.erpDbName,
      po.erpPedido,
      to,
      user.name ?? user.adUsername ?? '',
      `Reenvio P2P PC ${po.number}`,
    );
    return { ok: true, recipient: to };
  }
}
