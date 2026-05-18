import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateSettingDto {
  @ApiProperty({ description: 'ID da empresa' })
  @IsString()
  @IsNotEmpty()
  companyId!: string;

  @ApiProperty({ description: 'Novo valor do parâmetro' })
  @IsString()
  @IsNotEmpty()
  value!: string;
}
