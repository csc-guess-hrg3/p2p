import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Patch da configuração de integração com o ERP por empresa.
 * Tudo opcional — só sobrescreve o que vier preenchido. A senha SMTP
 * em branco preserva a atual; `null` explícito limpa.
 */
export class UpdateErpConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() codTransacao?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tabelaFilha?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tipoCompraDefault?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  ctbTipoOperacaoDefault?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() naturezaEntradaDefault?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() moeda?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() transportadoraPadrao?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpHost?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) smtpPort?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpUser?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpPassword?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() smtpSecure?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpFrom?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() smtpFromName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() emailSubjectTemplate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() emailBodyTemplate?: string | null;

  @ApiPropertyOptional({
    description:
      'ID do usuário que aprova Pedidos de Produto Acabado (diretor da marca).',
  })
  @IsOptional()
  @IsString()
  paApproverUserId?: string | null;

  @ApiPropertyOptional({
    description:
      'ID do time autorizado a reagendar entregas de pedidos PA.',
  })
  @IsOptional()
  @IsString()
  paReschedulerTeamId?: string | null;
}
