import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * Item de uma Solicitação de Verba AVULSA (pagamento sem NF).
 * Espelha FundRequestItem — cada linha é um pagamento a um beneficiário com
 * conta contábil + rateio de filial e centro de custo (o que o Linx exige em
 * CTB_SOLICITACAO_VERBA_ITEM). Os códigos de rateio/conta vêm de listas
 * permitidas na UI; a integridade final é do FK no Linx.
 */
export class CreateFundRequestItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  beneficiaryName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemErpCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  beneficiaryBank?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  beneficiaryAgency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  beneficiaryAccount?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  accountingAccount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountName?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  branchRateioCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  branchRateioDesc?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  costCenterRateioCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  costCenterRateioDesc?: string;

  @IsPositive()
  amount!: number;

  /** Vencimento do pagamento (ISO yyyy-mm-dd). */
  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Criação de uma Solicitação de Verba AVULSA (sem requisição/PC de origem). */
export class CreateFundRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(36)
  companyId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateFundRequestItemDto)
  items!: CreateFundRequestItemDto[];
}
