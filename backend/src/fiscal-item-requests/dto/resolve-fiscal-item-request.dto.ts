import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Aprovação de uma pendência fiscal de vínculo.
 * A equipe Fiscal não rejeita: se discordar do item, informa o código
 * do item correto e o vínculo é feito com ele (o solicitante é notificado).
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
