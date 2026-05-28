import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  ATTACHMENT_KINDS,
  isAttachmentKind,
  type AttachmentKind,
} from './attachment-kinds';

/**
 * Upload/listagem/download de anexos. PRD § 9.1 (recebimento) e § 8.2
 * (PC): canhoto/foto/ata/checklist no recebimento; cotações/contrato no
 * pedido; até 10 arquivos de 10 MB cada (PRD US-REQ-01).
 *
 * Armazenamento em disco: <UPLOAD_DIR>/<companyCode>/<entity>/<id>/<file>.
 * `storageKey` na tabela guarda o caminho relativo ao UPLOAD_DIR — assim
 * dá pra mover o diretório raiz sem migration.
 */

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PER_PARENT = 10;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
]);

type ParentKind = 'requisition' | 'purchaseOrder' | 'receiving' | 'fundRequest';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadRoot =
    process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

  constructor(private readonly prisma: PrismaService) {}

  private parentField(kind: ParentKind): string {
    switch (kind) {
      case 'requisition':
        return 'requisitionId';
      case 'purchaseOrder':
        return 'purchaseOrderId';
      case 'receiving':
        return 'receivingId';
      case 'fundRequest':
        return 'fundRequestId';
    }
  }

  /** Resolve o parent e devolve companyId + code para o caminho do arquivo. */
  private async resolveParent(kind: ParentKind, id: string) {
    if (kind === 'requisition') {
      const r = await this.prisma.requisition.findUnique({
        where: { id },
        include: { company: true },
      });
      if (!r || r.deletedAt) throw new NotFoundException();
      return { companyId: r.companyId, companyCode: r.company.code };
    }
    if (kind === 'purchaseOrder') {
      const p = await this.prisma.purchaseOrder.findUnique({
        where: { id },
        include: { company: true },
      });
      if (!p || p.deletedAt) throw new NotFoundException();
      return { companyId: p.companyId, companyCode: p.company.code };
    }
    if (kind === 'receiving') {
      const rec = await this.prisma.receiving.findUnique({ where: { id } });
      if (!rec || rec.deletedAt) throw new NotFoundException();
      const company = await this.prisma.company.findUniqueOrThrow({
        where: { id: rec.companyId },
      });
      return { companyId: rec.companyId, companyCode: company.code };
    }
    const fr = await this.prisma.fundRequest.findUnique({
      where: { id },
      include: { company: true },
    });
    if (!fr || fr.deletedAt) throw new NotFoundException();
    return { companyId: fr.companyId, companyCode: fr.company.code };
  }

  async list(user: AuthenticatedUser, kind: ParentKind, parentId: string) {
    const { companyId } = await this.resolveParent(kind, parentId);
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    // Cotações têm relação 1-1 com anexo (Quotation.attachmentId).
    // Trazemos junto pro frontend identificar "este anexo é da cotação
    // do fornecedor X" sem precisar de uma chamada separada — atende a
    // queixa "Os anexos não são vinculados com as cotações... qual será
    // a de qual?".
    const rows = await this.prisma.attachment.findMany({
      where: { [this.parentField(kind)]: parentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        mimeType: true,
        kind: true,
        createdAt: true,
        uploadedById: true,
      },
    });
    // Busca em lote os Quotations cujo attachmentId está nos anexos.
    const ids = rows.map((r) => r.id);
    const quotations = ids.length
      ? await this.prisma.quotation.findMany({
          where: { attachmentId: { in: ids } },
          select: {
            id: true,
            attachmentId: true,
            supplierName: true,
            supplierErpCode: true,
            totalAmount: true,
            isWinner: true,
          },
        })
      : [];
    const byAttId = new Map(quotations.map((q) => [q.attachmentId, q]));
    return rows.map((r) => {
      const q = byAttId.get(r.id);
      return q
        ? {
            ...r,
            quotation: {
              id: q.id,
              supplierName: q.supplierName,
              supplierErpCode: q.supplierErpCode,
              totalAmount: q.totalAmount.toString(),
              isWinner: q.isWinner,
            },
          }
        : r;
    });
  }

  async upload(
    user: AuthenticatedUser,
    kind: ParentKind,
    parentId: string,
    file: Express.Multer.File,
    attachmentKind: AttachmentKind = 'OTHER',
  ) {
    if (!file) throw new BadRequestException('Arquivo ausente.');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`Arquivo maior que ${MAX_BYTES / 1024 / 1024} MB.`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Tipo não permitido: ${file.mimetype}.`);
    }
    if (!isAttachmentKind(attachmentKind)) {
      throw new BadRequestException(
        `Tipo de anexo inválido. Valores aceitos: ${ATTACHMENT_KINDS.join(', ')}.`,
      );
    }
    const { companyId, companyCode } = await this.resolveParent(kind, parentId);
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const count = await this.prisma.attachment.count({
      where: { [this.parentField(kind)]: parentId },
    });
    if (count >= MAX_PER_PARENT) {
      throw new BadRequestException(`Limite de ${MAX_PER_PARENT} anexos.`);
    }

    const relDir = path.join(companyCode, kind, parentId);
    const absDir = path.join(this.uploadRoot, relDir);
    await fs.mkdir(absDir, { recursive: true });
    // nome em disco com prefixo timestamp pra evitar colisão
    const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
    const diskName = `${Date.now()}_${safeName}`;
    const absPath = path.join(absDir, diskName);
    await fs.writeFile(absPath, file.buffer);
    const storageKey = path.posix.join(relDir.replace(/\\/g, '/'), diskName);

    const created = await this.prisma.attachment.create({
      data: {
        companyId,
        [this.parentField(kind)]: parentId,
        filename: file.originalname,
        storageKey,
        sizeBytes: file.size,
        mimeType: file.mimetype,
        uploadedById: user.id,
        kind: attachmentKind,
      },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        mimeType: true,
        kind: true,
        createdAt: true,
      },
    });

    // Quando o anexo é de uma requisição, mantemos o campo legacy
    // `requisitions.quotationsCount` em sincronia com a contagem real de
    // anexos do tipo QUOTATION — assim queries existentes continuam
    // funcionando enquanto a UI migra pra contagem por kind.
    if (kind === 'requisition') {
      await this.syncQuotationsCount(parentId);
    }
    return created;
  }

  /** Recalcula `requisitions.quotationsCount` a partir dos anexos QUOTATION. */
  private async syncQuotationsCount(requisitionId: string): Promise<void> {
    const count = await this.prisma.attachment.count({
      where: { requisitionId, kind: 'QUOTATION' },
    });
    await this.prisma.requisition.update({
      where: { id: requisitionId },
      data: { quotationsCount: count },
    });
  }

  /** Devolve caminho absoluto + filename para o controller fazer streaming. */
  async readForDownload(user: AuthenticatedUser, attachmentId: string) {
    const att = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!att) throw new NotFoundException();
    if (!user.companyIds.includes(att.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const abs = path.join(this.uploadRoot, att.storageKey);
    return {
      absolutePath: abs,
      filename: att.filename,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
    };
  }

  async remove(user: AuthenticatedUser, attachmentId: string) {
    const att = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!att) throw new NotFoundException();
    if (!user.companyIds.includes(att.companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const abs = path.join(this.uploadRoot, att.storageKey);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    // Recalcula a contagem se for um anexo de requisição (independente do
    // kind — assim se o usuário apagar um QUOTATION, o número cai).
    if (att.requisitionId) {
      await this.syncQuotationsCount(att.requisitionId);
    }
    // best-effort: se o arquivo já sumiu, ignora — só logamos pra
    // diagnosticar problemas de permissão/storage corrompido.
    try {
      await fs.unlink(abs);
    } catch (err) {
      this.logger.debug(
        `Falha ao remover ${abs}: ${(err as Error).message}`,
      );
    }
    return { ok: true };
  }
}
