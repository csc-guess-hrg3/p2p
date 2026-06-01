import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // Segurança HTTP — cabeçalhos defensivos (XSS, clickjacking, sniffing).
  // Swagger usa inline scripts/styles; em produção sem swagger, podemos
  // endurecer ainda mais (CSP estrita).
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Cookie parser — usado pelo fluxo de JWT em cookie httpOnly.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Filtro global de exceções — traduz erros do Linx/Prisma/etc. pra
  // mensagens legíveis em PT-BR e protege o usuário de stacktraces ou
  // mensagens técnicas vazadas (queixa explícita na auditoria de UX).
  app.useGlobalFilters(new ApiExceptionFilter());

  // CORS: aceita uma lista de origens separadas por vírgula (FRONTEND_URLS).
  // Compatível com a config antiga (FRONTEND_URL singular) por fallback.
  const allowedOrigins = (
    process.env.FRONTEND_URLS ??
    process.env.FRONTEND_URL ??
    'http://localhost:5173'
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // necessário para cookies httpOnly
  });

  // Swagger só fora de produção — em PROD expõe inventário de endpoints
  // e schema interno. Habilitar via SWAGGER_ENABLED=true só pra debug
  // pontual se necessário.
  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('P2P API')
      .setDescription('Sistema Procure-to-Pay — HRG3')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('p2p_token')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const logger = new (await import('@nestjs/common')).Logger('Bootstrap');
  logger.log(`P2P API rodando em http://localhost:${port}/api`);
  if (swaggerEnabled) {
    logger.log(`Swagger em http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
