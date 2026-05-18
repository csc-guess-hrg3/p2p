import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Parâmetros da Plataforma')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista os parâmetros configuráveis de uma empresa' })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
  ) {
    return this.settings.findAll(user, companyId);
  }

  @Put(':key')
  @ApiOperation({ summary: 'Atualiza um parâmetro (somente Administrador)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
  ) {
    return this.settings.set(user, dto.companyId, key, dto.value);
  }
}
