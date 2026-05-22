import { IsString, MinLength } from 'class-validator';

export class RequestRevisionDto {
  @IsString()
  @MinLength(5, { message: 'Motivo precisa de no mínimo 5 caracteres.' })
  reason!: string;
}
