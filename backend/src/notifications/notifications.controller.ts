import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Notificações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('mine')
  @ApiOperation({ summary: 'Lista as notificações do usuário (top 100)' })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('onlyUnread') onlyUnread?: string,
  ) {
    return this.notifications.listMine(user, onlyUnread === 'true');
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Quantas notificações não lidas o usuário tem' })
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    const count = await this.notifications.unreadCount(user);
    return { count };
  }

  @Post(':id/read')
  @ApiOperation({ summary: 'Marca notificação como lida' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  @ApiOperation({
    summary: 'Marca todas as notificações do usuário como lidas',
  })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user);
  }
}
