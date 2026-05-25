import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { SetTeamRateiosDto } from './dto/set-team-rateios.dto';
import { SetApprovalLevelsDto } from './dto/set-approval-levels.dto';
import { SetTeamModulesDto } from './dto/set-team-modules.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';

/**
 * Gestão de equipes — restrito ao perfil ADMIN.
 * A equipe define o escopo de operação: quais rateios de filial e de
 * centro de custo seus membros podem usar e enxergar.
 */
@ApiTags('Equipes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Post()
  @ApiOperation({ summary: 'Cria uma equipe' })
  create(@Body() dto: CreateTeamDto) {
    return this.teams.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista as equipes' })
  findAll() {
    return this.teams.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da equipe (rateios e membros)' })
  findOne(@Param('id') id: string) {
    return this.teams.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza nome/status da equipe' })
  update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teams.update(id, dto);
  }

  @Put(':id/branch-rateios')
  @ApiOperation({ summary: 'Define os rateios de filial da equipe' })
  setBranchRateios(@Param('id') id: string, @Body() dto: SetTeamRateiosDto) {
    return this.teams.setBranchRateios(id, dto.rateios);
  }

  @Put(':id/cc-rateios')
  @ApiOperation({ summary: 'Define os rateios de centro de custo da equipe' })
  setCcRateios(@Param('id') id: string, @Body() dto: SetTeamRateiosDto) {
    return this.teams.setCostCenterRateios(id, dto.rateios);
  }

  @Put(':id/modules')
  @ApiOperation({
    summary: 'Define os módulos extras liberados pra equipe',
    description:
      'Lista de chaves de módulo (PA, FISCAL_QUEUE, REPORTS, RECEIVING, APPROVALS). Substitui o conjunto.',
  })
  setModules(@Param('id') id: string, @Body() dto: SetTeamModulesDto) {
    return this.teams.setModules(id, dto.modules);
  }

  @Put(':id/approval-levels')
  @ApiOperation({ summary: 'Define a cadeia de aprovação da equipe' })
  setApprovalLevels(
    @Param('id') id: string,
    @Body() dto: SetApprovalLevelsDto,
  ) {
    return this.teams.setApprovalLevels(id, dto.levels);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desativa a equipe' })
  deactivate(@Param('id') id: string) {
    return this.teams.deactivate(id);
  }
}
