import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

/** Vincular um item JÁ existente do Linx ao item livre da requisição. */
export class LinkItemDto {
  @ApiProperty({ description: 'Código do item fiscal existente a vincular' })
  @IsString()
  @IsNotEmpty()
  itemErpCode!: string;
}

/**
 * Criar um item fiscal novo no Linx e vinculá-lo ao item livre da requisição.
 * O fiscal preenche a conta (obrigatória); NCM/origem entram com padrão do
 * dado real (00000000 / 0) quando ausentes; o resto é opcional.
 */
export class CreateClassifiedItemDto {
  @ApiProperty({ description: 'Conta contábil (o fiscal escolhe)' })
  @IsString()
  @IsNotEmpty()
  accountingAccount!: string;

  @ApiPropertyOptional({ description: 'Descrição (default: a que o solicitante escreveu)' })
  @IsOptional()
  @IsString()
  descricao?: string;

  @ApiPropertyOptional({ description: 'Unidade (default: a do pedido)' })
  @IsOptional()
  @IsString()
  unidade?: string;

  @ApiPropertyOptional({ description: 'NCM / classificação fiscal (default 00000000)' })
  @IsOptional()
  @IsString()
  ncm?: string;

  @ApiPropertyOptional({ description: 'Origem da mercadoria (default 0 = nacional)' })
  @IsOptional()
  @IsString()
  origem?: string;

  @ApiPropertyOptional({ description: 'Grupo fiscal do item' })
  @IsOptional()
  @IsString()
  grupo?: string;

  @ApiPropertyOptional({ description: 'Tipo do item no SPED' })
  @IsOptional()
  @IsString()
  tipoSped?: string;

  @ApiPropertyOptional({ description: 'Indicador de CFOP' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  cfop?: number;

  @ApiPropertyOptional({
    description:
      'false/ausente = só previa o item que será gravado (não grava). ' +
      'true = grava de verdade no Linx.',
  })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
