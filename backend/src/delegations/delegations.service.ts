import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile, UserStatus } from '../common/enums';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateDelegationDto } from './dto/create-delegation.dto';

/**
 * Delegação de alçada — self-service.
 * O próprio aprovador cadastra sua delegação ao se ausentar (férias).
 * Durante a janela, o delegado pode decidir as aprovações no lugar dele.
 */
@Injectable()
export class DelegationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cria uma delegação a partir do usuário logado (delegante = ele). */
  async create(user: AuthenticatedUser, dto: CreateDelegationDto) {
    if (dto.delegateId === user.id) {
      throw new BadRequestException('Não é possível delegar para si mesmo.');
    }
    const start = new Date(dto.startsAt);
    const end = new Date(dto.endsAt);
    if (end <= start) {
      throw new BadRequestException(
        'A data fim deve ser posterior à data início.',
      );
    }

    const delegate = await this.prisma.user.findUnique({
      where: { id: dto.delegateId },
    });
    if (
      !delegate ||
      delegate.deletedAt ||
      delegate.status !== UserStatus.ACTIVE
    ) {
      throw new BadRequestException('Delegado inválido ou inativo.');
    }

    // MVP: não permite delegações ativas sobrepostas para o mesmo delegante.
    const overlapping = await this.prisma.delegation.findFirst({
      where: {
        delegatorId: user.id,
        active: true,
        startsAt: { lte: end },
        endsAt: { gte: start },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'Já existe uma delegação ativa nesse período.',
      );
    }

    return this.prisma.delegation.create({
      data: {
        delegatorId: user.id,
        delegateId: dto.delegateId,
        startsAt: start,
        endsAt: end,
        reason: dto.reason ?? null,
        createdById: user.id,
      },
    });
  }

  /** Delegações que o usuário concedeu. */
  async listGiven(userId: string) {
    return this.prisma.delegation.findMany({
      where: { delegatorId: userId },
      orderBy: { startsAt: 'desc' },
      include: { delegate: { select: { id: true, name: true } } },
    });
  }

  /** Delegações que o usuário recebeu. */
  async listReceived(userId: string) {
    return this.prisma.delegation.findMany({
      where: { delegateId: userId },
      orderBy: { startsAt: 'desc' },
      include: { delegator: { select: { id: true, name: true } } },
    });
  }

  /** Cancela uma delegação (apenas o delegante ou um admin). */
  async cancel(user: AuthenticatedUser, id: string) {
    const delegation = await this.prisma.delegation.findUnique({
      where: { id },
    });
    if (!delegation) {
      throw new NotFoundException('Delegação não encontrada.');
    }
    if (
      delegation.delegatorId !== user.id &&
      user.profile !== UserProfile.ADMIN
    ) {
      throw new ForbiddenException('Só o delegante pode cancelar a delegação.');
    }
    return this.prisma.delegation.update({
      where: { id },
      data: { active: false },
    });
  }
}
