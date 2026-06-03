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
import {
  FundRequestStatus,
  IntegrationLogStatus,
  PurchaseOrderStatus,
  RequisitionNfType,
  RequisitionStatus,
  UserProfile,
} from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { ConvertToPurchaseOrderDto } from './dto/convert-to-po.dto';
import {
  publicErpErrorMessage,
  sanitizeErpErrorDetail,
} from '../common/erp/erp-error-sanitizer';

/** Linha de rateio congelada na requisição que será reaproveitada no PC. */
interface RateioSnapshotLine {
  kind: string;
  rateioCode: string;
  targetCode: string;
  branchCode: string | null;
  percentage: Prisma.Decimal;
}

/** Item da requisição enriquecido com preço efetivo do PC. */
interface EnrichedRequisitionItem {
  requisitionItemId: string;
  itemErpCode: string | null;
  itemDescription: string;
  quantity: Prisma.Decimal;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  accountingAccount: string;
  accountName: string | null;
  branchRateioCode: string;
  branchRateioDesc: string | null;
  costCenterRateioCode: string;
  costCenterRateioDesc: string | null;
  notes: string | null;
  rateios: RateioSnapshotLine[];
}

/**
 * Converte uma Requisição aprovada em um ou mais Pedidos de Compra.
 *
 * Mantido como serviço próprio porque a conversão é o trecho mais
 * arriscado do módulo: valida campos obrigatórios, divide a requisição
 * em "buckets" sem colisão de PK no Linx, grava cada PC + (opcional) SV,
 * dispara escrita no ERP via `LinxErpService` e traduz erros do trigger
 * `LXI_COMPRAS` em mensagens úteis.
 */
@Injectable()
export class PurchaseOrderConverterService {
  private readonly logger = new Logger(PurchaseOrderConverterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
    private readonly linx: LinxErpService,
  ) {}

  /**
   * Recalcula os valores das linhas de rateio para um novo total
   * (o preço negociado pode diferir do estimado da requisição).
   * Mantém os percentuais; a última linha de cada tipo absorve o resíduo.
   */
  private recomputeRateios(lines: RateioSnapshotLine[], total: number) {
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
    req: {
      tipoCompra: string | null;
      ctbTipoOperacao: number | null;
      naturezaEntrada: string | null;
      paymentConditionCode: string | null;
      items: Array<{
        itemDescription: string;
        itemErpCode: string | null;
        accountingAccount: string | null;
        branchRateioCode: string | null;
        costCenterRateioCode: string | null;
        unit: string | null;
        quantity: { toString: () => string } | number | string;
      }>;
    },
    company: { code: string; erpConfig: unknown | null },
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
      if (!it.branchRateioCode)
        problems.push(`${tag}: rateio de filial ausente.`);
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
  private bucketizeForPk(
    items: EnrichedRequisitionItem[],
  ): EnrichedRequisitionItem[][] {
    const buckets: EnrichedRequisitionItem[][] = [];
    for (const it of items) {
      const key = it.itemErpCode ?? `livre:${it.itemDescription}`;
      let placed = false;
      for (const b of buckets) {
        if (
          !b.some(
            (x) => (x.itemErpCode ?? `livre:${x.itemDescription}`) === key,
          )
        ) {
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
   * Mapeia o erro raw do trigger `LXI_COMPRAS` para uma mensagem
   * acionável pelo usuário. O Linx devolve textos como
   * "Impossível Incluir #COMPRAS #porque #TRANSPORTADORAS #não existe".
   */
  private translateLinxError(err: unknown): never {
    const raw = (err as Error)?.message ?? '';
    const m = raw.match(
      /porque\s*#?(FORNECEDORES|FILIAIS|MOEDAS|COND_ENT_PGTOS|TRANSPORTADORAS|PRODUCAO_PROGRAMA|COMPRAS_TIPOS|COMPRAS_STATUS|VENDAS|CTB_CENTRO_CUSTO_RATEIO|CTB_FILIAL_RATEIO)\b/i,
    );
    if (m) {
      const friendly: Record<string, string> = {
        FORNECEDORES:
          'Fornecedor não cadastrado no Linx (TRANSPORTADORAS/FORNECEDORES).',
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
        friendly[m[1].toUpperCase()] ?? `Validação do Linx falhou: ${m[1]}.`,
      );
    }
    if (raw.includes('transaction ended in the trigger')) {
      throw new BadRequestException(
        'O Linx rejeitou o pedido (trigger interna abortou). ' +
          'Detalhe seguro: ' +
          sanitizeErpErrorDetail(raw),
      );
    }
    throw new BadRequestException(publicErpErrorMessage(err));
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
    // Chokepoint do cadastro de fornecedor. A conversão cria PC + SV, que
    // exigem o CLIFOR no Linx. Se a requisição ainda não tem
    // supplierErpCode — fornecedor externo, falha do best-effort na
    // aprovação, ou fluxo de dispensa de cotação (sem Quotation) —
    // cadastra agora a partir dos dados da própria requisição, garantindo
    // que nenhum PC/SV suba sem fornecedor cadastrado.
    const supplierErpCode: string = req.supplierErpCode
      ? req.supplierErpCode
      : await this.linx.ensureSupplierForRequisition(req.id);
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

    // RN-FIS-02: bloqueia se há FiscalItemRequest PENDING aberto pra
    // qualquer combinação (req.supplierErpCode, item.itemErpCode) da req.
    // Casos típicos: cotação vencedora de outro fornecedor cujo item
    // não está vinculado no Linx. Aprovar a pendência fiscal antes do
    // convert evita gravar PC com item-fornecedor incoerente no Linx.
    if (supplierErpCode) {
      const itemCodes = req.items
        .map((it) => it.itemErpCode)
        .filter((c): c is string => !!c);
      if (itemCodes.length > 0) {
        const pendings = await this.prisma.fiscalItemRequest.findMany({
          where: {
            companyId: req.companyId,
            supplierErpCode,
            itemErpCode: { in: itemCodes },
            status: 'PENDING',
          },
          select: { itemErpCode: true, itemDescription: true },
        });
        if (pendings.length > 0) {
          const summary = pendings
            .map((p) => `• ${p.itemErpCode} — ${p.itemDescription}`)
            .join('\n');
          throw new BadRequestException(
            `Conversão bloqueada — há ${pendings.length} pendência(s) fiscal(is) ` +
              `aberta(s) pro fornecedor ${supplierErpCode}:\n${summary}\n\n` +
              'O time fiscal precisa aprovar o vínculo item-fornecedor antes do PC ' +
              'ser gravado no Linx. Acompanhe em Pendências Fiscais.',
          );
        }
      }
    }

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
    const enrichedItems: EnrichedRequisitionItem[] = req.items.map((it) => {
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
    const created: Array<{ id: string; number: string; status: string }> = [];

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
              supplierErpCode,
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
      // Falha aqui aborta o convert inteiro (rollback dos PCs criados).
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
        // Se o PC tem SV vinculada (NF_FUTURA), grava a SV em seguida.
        // A SV já está APROVADA + com vencimento preenchido aqui (decidido
        // no diálogo de conversão), então temos todas as informações
        // necessárias pra integrar com o Linx automaticamente — sem
        // depender do envio de e-mail nem de ação manual posterior.
        //
        // Falha do envio de SV NÃO derruba o convert: o PC continua íntegro
        // no Linx, a SV fica com `lastErpError` setado, e o usuário pode
        // reintegrar pela tela de detalhe da SV.
        if (po.fundRequest) {
          const svFull = await this.prisma.fundRequest.findUniqueOrThrow({
            where: { id: po.fundRequest.id },
            include: { items: true },
          });
          try {
            await this.linx.gravarSolicitacaoVerba(svFull, user);
            await this.prisma.fundRequest.update({
              where: { id: svFull.id },
              data: { status: FundRequestStatus.INTEGRATED },
            });
          } catch (svErr) {
            // O catch interno de gravarSolicitacaoVerba já gravou
            // lastErpError + integration_log. Aqui só logamos e seguimos
            // — o convert do PC NÃO é abortado por causa da SV.
            this.logger.warn(
              `PC ${po.number}: SV ${svFull.number} não integrada — ${(svErr as Error).message}`,
            );
          }
        }
        created.push({
          id: po.id,
          number: po.number,
          status: PurchaseOrderStatus.INTEGRATED,
        });
      } catch (err) {
        // Rollback dos PCs já criados — soft delete pra preservar histórico.
        //
        // ATENÇÃO (audit M14): os PCs já em `created` FORAM gravados no Linx
        // (têm `erpPedido` real em COMPRAS). O soft-delete abaixo só afeta o
        // P2P — esses pedidos ficam ÓRFÃOS no ERP, pois não há cancelamento
        // automático no Linx. Antes de desfazer no P2P, registramos os
        // órfãos em integration_logs pra reconciliação/cancelamento manual.
        if (created.length > 0) {
          try {
            const orphans = await this.prisma.purchaseOrder.findMany({
              where: { id: { in: created.map((c) => c.id) } },
              select: { number: true, erpPedido: true },
            });
            const orphanList =
              orphans
                .filter((o) => o.erpPedido)
                .map((o) => `${o.number} (erpPedido ${o.erpPedido})`)
                .join('; ') || '(nenhum com erpPedido)';
            await this.prisma.integrationLog.create({
              data: {
                companyId: req.companyId,
                source: company.code === 'HRG3' ? 'ERP_HRG3' : 'ERP_GUESS',
                jobType: 'CONVERT_PO_ROLLBACK',
                status: IntegrationLogStatus.PARTIAL,
                recordsProcessed: orphans.length,
                errorDetails:
                  `Conversão da requisição ${req.number} abortada por falha no Linx ` +
                  `(${(err as Error).message}). PCs já gravados no ERP e soft-deletados no ` +
                  `P2P — ÓRFÃOS no Linx, requerem cancelamento manual: ${orphanList}.`,
              },
            });
          } catch (logErr) {
            this.logger.error(
              `Falha ao registrar PCs órfãos da conversão da req ${req.number}: ${(logErr as Error).message}`,
            );
          }
        }
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
        this.translateLinxError(err);
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
    const fullFirst = await this.prisma.purchaseOrder.findUniqueOrThrow({
      where: { id: first.id },
      include: { items: { include: { rateios: true } }, fundRequest: true },
    });
    return rest.length > 0
      ? {
          ...fullFirst,
          siblings: rest.map((p) => ({ id: p.id, number: p.number })),
        }
      : fullFirst;
  }
}
