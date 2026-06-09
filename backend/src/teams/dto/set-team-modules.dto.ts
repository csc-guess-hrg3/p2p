import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import { KNOWN_MODULES } from '../teams.service';

export class SetTeamModulesDto {
  @ApiProperty({
    description: 'Conjunto de módulos liberados pra equipe (substitui).',
    isArray: true,
    enum: KNOWN_MODULES,
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(KNOWN_MODULES, { each: true })
  modules!: string[];
}
