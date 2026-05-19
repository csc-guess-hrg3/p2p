import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

/**
 * Envio do PC ao fornecedor — opções do comprador na hora do envio.
 * Se `recipientEmail` for omitido, o backend usa o e-mail cadastrado
 * do fornecedor no ERP. `skipEmail=true` grava no ERP mas NÃO envia o
 * e-mail (caso o comprador opte por notificar manualmente).
 */
export class SendToSupplierDto {
  @ApiPropertyOptional({ description: 'E-mail do destinatário (sobrescreve o cadastro)' })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional({ description: 'Não enviar e-mail; apenas gravar no ERP' })
  @IsOptional()
  @IsBoolean()
  skipEmail?: boolean;

  @ApiPropertyOptional({ description: 'Assunto customizado' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ description: 'Corpo customizado' })
  @IsOptional()
  @IsString()
  bodyText?: string;
}
