import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMssql } from '@prisma/adapter-mssql';

/**
 * Wrapper do PrismaClient para o NestJS.
 * Prisma 7 + SQL Server exige o driver adapter MSSQL — a conexão é
 * construída a partir dos parâmetros DB_* do .env (não da connection string,
 * para evitar problemas de escaping de senha com caracteres especiais).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    const adapter = new PrismaMssql({
      server: config.getOrThrow<string>('DB_HOST'),
      port: Number(config.get<string>('DB_PORT') ?? 1433),
      database: config.getOrThrow<string>('DB_NAME'),
      user: config.getOrThrow<string>('DB_USER'),
      password: config.getOrThrow<string>('DB_PASSWORD'),
      options: { trustServerCertificate: true, encrypt: true },
    });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado ao P2P_DB');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
