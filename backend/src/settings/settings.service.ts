import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { SETTING_DEFS } from './setting-defs';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Valor numérico de um parâmetro; cai no default se não houver registro. */
  async getNumber(companyId: string, key: string): Promise<number> {
    const def = SETTING_DEFS[key];
    if (!def) {
      throw new BadRequestException(`Parâmetro desconhecido: ${key}`);
    }
    const row = await this.prisma.systemSetting.findUnique({
      where: { companyId_key: { companyId, key } },
    });
    return Number(row?.value ?? def.default);
  }

  /** Lista todos os parâmetros de uma empresa, mesclados com os defaults. */
  async findAll(user: AuthenticatedUser, companyId: string) {
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const rows = await this.prisma.systemSetting.findMany({
      where: { companyId },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(SETTING_DEFS).map(([key, def]) => {
      const row = byKey.get(key);
      return {
        key,
        label: def.label,
        description: def.description,
        type: def.type,
        value: row?.value ?? def.default,
        isDefault: !row,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  /** Atualiza um parâmetro (somente Administrador). */
  async set(
    user: AuthenticatedUser,
    companyId: string,
    key: string,
    value: string,
  ) {
    if (user.profile !== UserProfile.ADMIN) {
      throw new ForbiddenException(
        'Apenas o Administrador altera parâmetros da plataforma.',
      );
    }
    if (!user.companyIds.includes(companyId)) {
      throw new ForbiddenException('Sem acesso a esta empresa.');
    }
    const def = SETTING_DEFS[key];
    if (!def) {
      throw new BadRequestException(`Parâmetro desconhecido: ${key}`);
    }
    const num = Number(value);
    if (Number.isNaN(num)) {
      throw new BadRequestException('Valor deve ser numérico.');
    }
    if (def.min !== undefined && num < def.min) {
      throw new BadRequestException(`Valor mínimo: ${def.min}.`);
    }
    if (def.max !== undefined && num > def.max) {
      throw new BadRequestException(`Valor máximo: ${def.max}.`);
    }
    const normalized = String(num);
    return this.prisma.systemSetting.upsert({
      where: { companyId_key: { companyId, key } },
      create: { companyId, key, value: normalized, updatedById: user.id },
      update: { value: normalized, updatedById: user.id },
    });
  }
}
