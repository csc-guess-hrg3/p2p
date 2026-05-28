import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RequisitionNfType } from '../../common/enums';

export class CreateRequisitionItemDto {
  @ApiPropertyOptional({ description: 'Código do item no ERP (vazio = item livre)' })
  @IsOptional()
  @IsString()
  itemErpCode?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  itemDescription!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  estimatedPrice!: number;

  @ApiProperty({ description: 'Conta contábil (CONTA_CONTABIL do ERP)' })
  @IsString()
  @IsNotEmpty()
  accountingAccount!: string;

  @ApiProperty({ description: 'Código do template de rateio de filial' })
  @IsString()
  @IsNotEmpty()
  branchRateioCode!: string;

  @ApiProperty({ description: 'Código do template de rateio de centro de custo' })
  @IsString()
  @IsNotEmpty()
  costCenterRateioCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRequisitionDto {
  @ApiProperty({ description: 'ID da empresa (P2P)' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ description: 'Código da filial principal no ERP' })
  @IsString()
  @IsNotEmpty()
  branchErpCode!: string;

  /**
   * Fornecedor — duas vias:
   *  1) `supplierErpCode` preenchido = fornecedor JÁ cadastrado no ERP
   *     (o usuário escolheu na busca/combobox).
   *  2) `supplierErpCode` vazio + `supplierCnpj` preenchido = fornecedor
   *     EXTERNO. O backend resolve via BrasilAPI e marca a requisição
   *     com `needsSupplierErpCreation = true`. Ao aprovar, o fornecedor
   *     é cadastrado automaticamente no Linx.
   */
  @ApiPropertyOptional({ description: 'Código do fornecedor no ERP (vazio para fornecedor externo via CNPJ)' })
  @IsOptional()
  @IsString()
  supplierErpCode?: string;

  @ApiPropertyOptional({ description: 'CNPJ do fornecedor — obrigatório quando supplierErpCode vazio' })
  @IsOptional()
  @IsString()
  supplierCnpj?: string;

  @ApiPropertyOptional({
    description: 'Nome do fornecedor — usado como fallback quando o CNPJ não está nem no ERP nem na Receita Federal',
  })
  @IsOptional()
  @IsString()
  supplierNameOverride?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'Justificativa (mínimo 15 caracteres)' })
  @IsString()
  @MinLength(15, {
    message: 'A justificativa deve ter no mínimo 15 caracteres.',
  })
  justification!: string;

  @ApiProperty({ enum: Object.values(RequisitionNfType) })
  @IsIn(Object.values(RequisitionNfType))
  tipoNotaFiscal!: string;

  @ApiProperty({ description: 'Código da condição de pagamento (COND_ENT_PGTOS)' })
  @IsString()
  @IsNotEmpty()
  paymentConditionCode!: string;

  @ApiPropertyOptional({ description: 'Requisição recorrente' })
  @IsOptional()
  @IsBoolean()
  recurring?: boolean;

  @ApiPropertyOptional({ description: 'Meses de recorrência (se recorrente)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  recurrenceMonths?: number;

  @ApiPropertyOptional({ description: 'Contrato vinculado, quando aplicável' })
  @IsOptional()
  @IsString()
  contractRef?: string;

  @ApiPropertyOptional({
    description: 'Tipo de compra Linx (COMPRAS_TIPOS.TIPO_COMPRA). ' +
      'Opcional: se ausente, usa o default da empresa.',
  })
  @IsOptional()
  @IsString()
  tipoCompra?: string;

  @ApiPropertyOptional({
    description:
      'Número de cotações anexadas (RN-REQ-02). Quando o total da ' +
      'requisição atinge o threshold configurado em SystemSetting, o ' +
      'submit exige este valor >= mínimo configurado.',
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  quotationsCount?: number;

  @ApiProperty({ type: [CreateRequisitionItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateRequisitionItemDto)
  items!: CreateRequisitionItemDto[];
}
