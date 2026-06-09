import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { AdSyncService } from './ad-sync.service';

interface ApplyDto {
  selections: Array<{
    ouName: string;
    companyCode: string;
    teamName: string;
    userLogins: string[];
  }>;
}

@ApiTags('Admin · Sync AD')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('admin/ad')
export class AdSyncController {
  constructor(private readonly sync: AdSyncService) {}

  @Get('preview')
  @ApiOperation({
    summary:
      'Lista os usuários ativos do AD agrupados por OU (preview pra sync)',
  })
  preview() {
    return this.sync.fetchSuggestions();
  }

  @Post('apply')
  @ApiOperation({ summary: 'Cria/atualiza times e usuários conforme seleção' })
  apply(@Body() dto: ApplyDto) {
    return this.sync.apply(dto.selections);
  }
}
