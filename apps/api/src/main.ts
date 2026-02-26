import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';
import multipart from '@fastify/multipart';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  // Register Fastify plugins
  await app.register(multipart as never, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  // Global filters and interceptors
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseTransformInterceptor());

  // Swagger / OpenAPI — only in development (requires @fastify/static)
  if (process.env['NODE_ENV'] !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Private LLM API')
      .setDescription('Spreadsheet engine with AI assistant, formula recalculation, summary generation, and export capabilities.')
      .setVersion('0.1.0')
      .addBasicAuth()
      .addTag('workbooks', 'Upload, create, list, and manage workbooks')
      .addTag('actions', 'Apply cell edits, formatting, and structural changes')
      .addTag('revisions', 'Revision history and revert')
      .addTag('ai', 'AI assistant prompts')
      .addTag('summary', 'Quick Summary generation')
      .addTag('export', 'XLSX and PDF export')
      .addTag('jobs', 'Async job tracking')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // CORS — support multiple origins for dev + production
  const rawOrigins = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (server-to-server, health checks, curl)
      if (!origin) {
        callback(null, true);
        return;
      }
      const normalizedOrigin = origin.replace(/\/+$/, '');
      // Allow exact match or any *.vercel.app preview deploy
      if (
        allowedOrigins.includes(normalizedOrigin) ||
        normalizedOrigin.endsWith('.vercel.app')
      ) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin} (allowed: ${allowedOrigins.join(', ')})`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Unauthenticated health endpoint for Railway/Docker healthchecks
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.get('/api/health', (_req: unknown, reply: { send: (body: unknown) => void }) => {
    reply.send({ status: 'ok' });
  });

  const port = parseInt(process.env['PORT'] ?? '4000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`Private LLM API running on http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
