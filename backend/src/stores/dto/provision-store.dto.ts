import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ProvisionStoreDto {
  @ApiProperty({ description: 'Empresa da loja (GUESS ou HRG3).' })
  @IsString()
  @IsNotEmpty()
  empresa!: string;

  @ApiProperty({ description: 'Código da filial no ERP (COD_FILIAL).' })
  @IsString()
  @IsNotEmpty()
  branchErpCode!: string;

  @ApiProperty({
    required: false,
    description:
      'Equipe cuja alçada aprova as compras desta loja (opcional; pode ser definida depois).',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

export class ProvisionAllStoresDto {
  @ApiProperty({ description: 'Empresa (GUESS ou HRG3).' })
  @IsString()
  @IsNotEmpty()
  empresa!: string;

  @ApiProperty({
    required: false,
    description:
      'Equipe/alçada aplicada a todas as lojas provisionadas neste lote (opcional).',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}

/** Um par filial→e-mail colado pela admin (validado por linha no serviço). */
export interface ImportStoreItem {
  branchErpCode: string;
  email: string;
}

export class ImportProvisionStoresDto {
  @ApiProperty({ description: 'Empresa (GUESS ou HRG3).' })
  @IsString()
  @IsNotEmpty()
  empresa!: string;

  @ApiProperty({
    description:
      'Pares código-da-filial + e-mail. Grava o e-mail na filial e provisiona a loja, por linha.',
    type: [Object],
  })
  @IsArray()
  @ArrayMaxSize(2000)
  itens!: ImportStoreItem[];

  @ApiProperty({
    required: false,
    description: 'Equipe/alçada aplicada às lojas deste lote (opcional).',
  })
  @IsOptional()
  @IsUUID()
  teamId?: string;
}
