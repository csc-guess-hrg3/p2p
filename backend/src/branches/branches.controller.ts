import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';
import { BranchesService } from './branches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserProfile } from '../common/enums';
import type { AuthenticatedUser } from '../auth/auth.types';

class SetBranchEmailDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  email!: string | null;
}

@ApiTags('Filiais')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista filiais da empresa com dados ERP + extras (e-mail)',
  })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('companyId') companyId: string,
  ) {
    return this.branches.listForCompany(user, companyId);
  }

  @Put(':code/email')
  @UseGuards(RolesGuard)
  @Roles(UserProfile.ADMIN)
  @ApiOperation({
    summary: 'Define o e-mail da filial (recuperação de senha do vendedor)',
  })
  setEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Query('companyId') companyId: string,
    @Body() dto: SetBranchEmailDto,
  ) {
    return this.branches.setEmail(user, companyId, code, dto.email ?? null);
  }
}
