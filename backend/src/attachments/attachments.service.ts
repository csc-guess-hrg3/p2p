import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.types';

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
    return this.prisma.attachment.findMany({
      where: { [this.parentField(kind)]: parentId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
        uploadedById: true,
      },
    });
  }

  async upload(
    user: AuthenticatedUser,
    kind: ParentKind,
    parentId: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo ausente.');
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`Arquivo maior que ${MAX_BYTES / 1024 / 1024} MB.`);
    }
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Tipo não permitido: ${file.mimetype}.`);
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

    return this.prisma.attachment.create({
      data: {
        companyId,
        [this.parentField(kind)]: parentId,
        filename: file.originalname,
        storageKey,
        sizeBytes: file.size,
        mimeType: file.mimetype,
        uploadedById: user.id,
      },
      select: {
        id: true,
        filename: true,
        sizeBytes: true,
        mimeType: true,
        createdAt: true,
      },
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
    // best-effort: se o arquivo já sumiu, ignora.
    try {
      await fs.unlink(abs);
    } catch {
      /* noop */
    }
    return { ok: true };
  }
}
