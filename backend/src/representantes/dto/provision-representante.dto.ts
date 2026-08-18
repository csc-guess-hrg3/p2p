import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ProvisionRepresentanteDto {
  @ApiProperty({ description: 'Empresa do representante (GUESS ou HRG3).' })
  @IsString()
  @IsNotEmpty()
  empresa!: string;

  @ApiProperty({
    description: 'Código do representante no Linx (COD_REPRESENTANTE).',
  })
  @IsString()
  @IsNotEmpty()
  codRepresentante!: string;

  @ApiProperty({
    description:
      'E-mail do representante — recebe o link de definição de senha.',
  })
  @IsEmail()
  email!: string;
}
