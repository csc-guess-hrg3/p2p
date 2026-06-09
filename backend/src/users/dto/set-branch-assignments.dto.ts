import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class BranchAssignmentEntry {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ description: 'Código da filial no ERP.' })
  @IsString()
  @IsNotEmpty()
  branchErpCode!: string;
}

export class SetBranchAssignmentsDto {
  @ApiProperty({
    type: [BranchAssignmentEntry],
    description: 'Lista completa de filiais cobertas pelo usuário (substitui).',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchAssignmentEntry)
  assignments!: BranchAssignmentEntry[];
}
