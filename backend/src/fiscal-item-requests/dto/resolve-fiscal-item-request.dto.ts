import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Aprovação de uma pendência fiscal de vínculo.
 * Se a equipe Fiscal discordar do item, informa o código do item correto
 * e o vínculo é feito com ele (o solicitante é notificado).
 */
export class ApproveFiscalItemRequestDto {
  @ApiPropertyOptional({
    description:
      'Código do item correto, quando a equipe Fiscal substituir o item',
  })
  @IsOptional()
  @IsString()
  itemErpCode?: string;
}

/**
 * Rejeição/descarte de uma pendência fiscal (ex.: órfã — a requisição de
 * origem foi cancelada). Exige um motivo.
 */
export class RejectFiscalItemRequestDto {
  @ApiProperty({ description: 'Motivo da rejeição (mín. 3 caracteres).' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  rejectionReason!: string;
}
