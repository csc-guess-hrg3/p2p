import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetCompaniesDto } from './dto/set-companies.dto';
import { SetApprovalTiersDto } from './dto/set-approval-tiers.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';

/**
 * Gestão de usuários — restrito ao perfil ADMIN.
 * É aqui que o admin tira usuários do estado PENDING_SETUP:
 * define perfil, empresas e alçadas, e ativa o acesso.
 */
@ApiTags('Usuários')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Lista usuários (filtros: status, empresa, busca)' })
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do usuário (empresas e alçadas)' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualiza perfil, status, nome e limite' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Put(':id/companies')
  @ApiOperation({ summary: 'Define as empresas do usuário' })
  setCompanies(@Param('id') id: string, @Body() dto: SetCompaniesDto) {
    return this.usersService.setCompanies(id, dto.companyIds);
  }

  @Put(':id/approval-tiers')
  @ApiOperation({ summary: 'Define as alçadas em que o usuário aprova' })
  setApprovalTiers(@Param('id') id: string, @Body() dto: SetApprovalTiersDto) {
    return this.usersService.setApprovalTiers(id, dto.tierIds);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Desativa o usuário (soft delete)' })
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(id);
  }
}
