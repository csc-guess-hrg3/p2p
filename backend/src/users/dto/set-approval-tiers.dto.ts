import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetApprovalTiersDto {
  @ApiProperty({
    type: [String],
    description: 'IDs das alçadas em que o usuário é aprovador',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  tierIds!: string[];
}
