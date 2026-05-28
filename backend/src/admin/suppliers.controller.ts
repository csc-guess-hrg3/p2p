import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserProfile } from '../common/enums';
import { LinxErpService } from '../integration/linx-erp.service';

/**
 * Endpoint admin pra reprocessar manualmente o cadastro de fornecedor
 * a partir de uma cotação vencedora. Útil quando o auto-trigger no
 * approve falhou (Linx fora do ar, dado inválido, etc.) — admin
 * corrige e reprocessa pelo id da cotação.
 */
@ApiTags('Admin · Fornecedores')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserProfile.ADMIN)
@Controller('admin/suppliers')
export class SuppliersAdminController {
  constructor(private readonly linx: LinxErpService) {}

  @Post('from-quotation/:id')
  @ApiOperation({
    summary:
      'Cadastra fornecedor no Linx a partir de uma cotação vencedora (idempotente por CNPJ).',
  })
  async fromQuotation(@Param('id') id: string) {
    return this.linx.criarFornecedorDeQuotation(id);
  }
}
