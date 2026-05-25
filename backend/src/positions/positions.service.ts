import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

/**
 * Cargos (Positions) — usados pela cadeia de aprovação dinâmica em
 * TeamApprovalLevel.requiredPositionId. O `code` é uma chave técnica
 * estável (ex.: 'SUPERVISOR'); `name` é o rótulo apresentado na UI.
 */
@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.position.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const p = await this.prisma.position.findUnique({ where: { id } });
    if (!p || p.deletedAt) throw new NotFoundException('Cargo não encontrado.');
    return p;
  }

  async create(dto: CreatePositionDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.position.findUnique({ where: { code } });
    if (existing) {
      throw new BadRequestException(`Já existe um cargo com o código ${code}.`);
    }
    return this.prisma.position.create({
      data: { code, name: dto.name.trim(), active: dto.active ?? true },
    });
  }

  async update(id: string, dto: UpdatePositionDto) {
    await this.findOne(id);
    return this.prisma.position.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Soft delete; libera o code pra reuso? Não — o code é estável e a
    // FK em TeamApprovalLevel pode estar referenciando. Mantemos a linha
    // com deletedAt e active=false.
    await this.prisma.position.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { ok: true };
  }
}
