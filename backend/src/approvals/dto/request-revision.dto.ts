import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class RequestRevisionDto {
  @IsString()
  @MinLength(5, { message: 'Motivo precisa de no mínimo 5 caracteres.' })
  reason!: string;

  /**
   * Quando o aprovador devolve uma requisição porque NÃO aceitou a
   * dispensa de cotação, marca este flag — o backend limpa os 3 campos
   * de dispensa pra que o solicitante anexe cotações de verdade ao
   * re-submeter.
   */
  @IsOptional()
  @IsBoolean()
  clearQuotationWaiver?: boolean;
}
