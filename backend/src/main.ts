import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/nestjs';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

/**
 * A3 — Error tracking via Sentry.
 * Ativo apenas quando `SENTRY_DSN` estiver configurado (no-op em dev/HML sem DSN).
 * Para ativar: crie um projeto em https://sentry.io, copie o DSN e adicione
 * ao pm2.config.js (app PROD):  SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/zzz
 */
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Amostragem de traces: 10% em PROD para não explodir a cota.
    // Sobe para 1.0 em HML/dev quando quiser inspecionar tudo.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Não loga dados de usuário além do ID (LGPD).
    sendDefaultPii: false,
  });
}

async function bootstrap() {
  initSentry();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Atrás do Cloudflare Tunnel (cloudflared roda em loopback): confia só no
  // proxy local pra ler o IP real do cliente (X-Forwarded-For) e o protocolo
  // (X-Forwarded-Proto=https). Sem isso, todo request pareceria vir de
  // 127.0.0.1 — quebrando o rate-limit por IP e o remoteip do Turnstile. (P1-4)
  app.set('trust proxy', 'loopback');

  app.setGlobalPrefix('api');

  // Segurança HTTP — cabeçalhos defensivos (XSS, clickjacking, sniffing).
  // Swagger usa inline scripts/styles; em produção sem swagger, podemos
  // endurecer ainda mais (CSP estrita).
  // CSP desligada por ora: o backend passa a servir o SPA (build do Vite) +
  // o widget Turnstile (iframe/script de challenges.cloudflare.com). Uma CSP
  // padrão (default-src 'self') quebraria o front. As demais proteções do
  // helmet seguem ativas (X-Frame-Options, nosniff, etc.).
  // TODO(go-live+): endurecer com uma CSP sob medida testada no navegador.
  app.use(
    helmet({
      contentSecurityPolicy: false,
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

  // A6 — validação de origens no boot: falha ruidosa se alguma origin
  // não começa com http:// ou https://, o que geraria CORS silencioso em
  // PROD (wildcard acidental, path esquecido, etc.).
  const invalidOrigins = allowedOrigins.filter(
    (o) => !o.startsWith('http://') && !o.startsWith('https://'),
  );
  if (invalidOrigins.length > 0) {
    throw new Error(
      `CORS: origens inválidas em FRONTEND_URLS (devem começar com http:// ou https://): ${invalidOrigins.join(', ')}`,
    );
  }

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

  // P1-6 — em produção o próprio backend serve o frontend (build estático do
  // Vite), publicando tudo num único endereço (p2p.corpbr.com.br via Cloudflare
  // Tunnel) sem CORS entre front e API. Em dev o front roda no Vite, então só
  // ativa quando o build existir em disco.
  const frontendDist =
    process.env.FRONTEND_DIST_PATH ??
    join(process.cwd(), '..', 'frontend', 'dist');
  const indexHtml = join(frontendDist, 'index.html');
  let servingFrontend = false;
  if (existsSync(indexHtml)) {
    servingFrontend = true;
    app.useStaticAssets(frontendDist, { index: false });
    // Fallback de SPA: GET que não seja /api nem um arquivo (com extensão)
    // devolve index.html, deixando o React Router resolver a rota no cliente.
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET') return next();
      if (req.path === '/api' || req.path.startsWith('/api/')) return next();
      if (req.path.includes('.')) return next(); // asset inexistente -> 404
      res.sendFile(indexHtml);
    });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  const logger = new (await import('@nestjs/common')).Logger('Bootstrap');
  logger.log(`P2P API rodando em http://localhost:${port}/api`);
  if (servingFrontend) {
    logger.log(`Frontend (SPA) servido de ${frontendDist}`);
  }
  if (swaggerEnabled) {
    logger.log(`Swagger em http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
