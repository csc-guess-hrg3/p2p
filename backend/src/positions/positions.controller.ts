import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PositionsService } from './positions.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';

/**
 * CRUD de cargos (Positions). Leitura é livre pra usuários autenticados
 * (a tela admin de equipes precisa enxergar a lista pra montar a cadeia);
 * mutação só Admin.
 */
@ApiTags('Cargos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly positions: PositionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista cargos ativos' })
  findAll() {
    return this.positions.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do cargo' })
  findOne(@Param('id') id: string) {
    return this.positions.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserProfile.ADMIN)
  @ApiOperation({ summary: 'Cria cargo (Admin)' })
  create(@Body() dto: CreatePositionDto) {
    return this.positions.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserProfile.ADMIN)
  @ApiOperation({ summary: 'Atualiza cargo (Admin)' })
  update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    return this.positions.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserProfile.ADMIN)
  @ApiOperation({ summary: 'Soft delete do cargo (Admin)' })
  remove(@Param('id') id: string) {
    return this.positions.remove(id);
  }
}
