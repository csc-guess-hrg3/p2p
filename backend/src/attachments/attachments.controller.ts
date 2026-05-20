import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';

type ParentKind = 'requisition' | 'purchaseOrder' | 'receiving' | 'fundRequest';

@ApiTags('Anexos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get(':kind/:parentId')
  @ApiOperation({ summary: 'Lista os anexos de um documento' })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: ParentKind,
    @Param('parentId') parentId: string,
  ) {
    return this.attachments.list(user, kind, parentId);
  }

  @Post(':kind/:parentId')
  @ApiOperation({ summary: 'Faz upload de um anexo (multipart/form-data, campo "file")' })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: ParentKind,
    @Param('parentId') parentId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.attachments.upload(user, kind, parentId, file);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Baixa o anexo' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { absolutePath, filename, mimeType } =
      await this.attachments.readForDownload(user, id);
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    });
    return new StreamableFile(createReadStream(absolutePath));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove o anexo' })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.attachments.remove(user, id);
  }
}
