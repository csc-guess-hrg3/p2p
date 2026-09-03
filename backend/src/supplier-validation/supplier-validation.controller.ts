import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupplierValidationService } from './supplier-validation.service';
import { QuerySupplierValidationsDto } from './dto/query-supplier-validations.dto';
import { ReturnSupplierValidationDto } from './dto/return-supplier-validation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

@ApiTags('Validação de Fornecedor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('supplier-validations')
export class SupplierValidationController {
  constructor(private readonly service: SupplierValidationService) {}

  @Get()
  @ApiOperation({
    summary: 'Fila de fornecedores novos aguardando validação do Revisor',
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuerySupplierValidationsDto,
  ) {
    return this.service.findAll(user, query);
  }

  @Get(':requisitionId')
  @ApiOperation({ summary: 'Detalhe da validação de fornecedor de uma requisição' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requisitionId') requisitionId: string,
  ) {
    return this.service.findOne(user, requisitionId);
  }

  @Post(':requisitionId/approve')
  @ApiOperation({
    summary: 'Aprova: cadastra o fornecedor no Linx e segue pra aprovação',
  })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requisitionId') requisitionId: string,
  ) {
    return this.service.approve(user, requisitionId);
  }

  @Post(':requisitionId/return')
  @ApiOperation({
    summary: 'Devolve ao solicitante com justificativa',
  })
  returnToRequester(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requisitionId') requisitionId: string,
    @Body() dto: ReturnSupplierValidationDto,
  ) {
    return this.service.returnToRequester(user, requisitionId, dto);
  }
}
