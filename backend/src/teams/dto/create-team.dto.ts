import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty({ example: 'Tecnologia da Informação' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
