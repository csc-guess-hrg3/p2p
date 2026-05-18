import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Módulo global — o PrismaService fica disponível para todos os módulos
 * sem precisar importar PrismaModule explicitamente em cada um.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
