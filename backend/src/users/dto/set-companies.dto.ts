import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetCompaniesDto {
  @ApiProperty({
    type: [String],
    description: 'IDs das empresas a que o usuário terá acesso',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  companyIds!: string[];
}
