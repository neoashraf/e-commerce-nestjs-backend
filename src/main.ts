import { mkdirSync } from 'fs';
import { resolve } from 'path';

import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the exact request bytes (req.rawBody) so provider webhooks
  // (NOTIF SMS DLR / email events) can be HMAC signature-verified (FR-NOTIF-041, §14).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 8000);

  // Base URL: http://localhost:<port>/api/v1  (per SRS §7)
  app.setGlobalPrefix('api/v1');

  // Serve uploaded files at /uploads (outside the api/v1 prefix): product media writes under
  // <root>/products/{id}/… and LEAD attachments under <root>/lead-attachments/…, so a single mount
  // of the upload root covers both. Stored URLs are `${PUBLIC_BASE_URL}/uploads/…`.
  const uploadDir = resolve(config.get<string>('MEDIA_UPLOAD_DIR') ?? 'uploads');
  // Create the upload root at boot so the first image upload doesn't fail on a missing dir, and so a
  // non-writable path surfaces here (loud, at startup) instead of as an opaque 500 mid-request.
  try {
    mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    new Logger('Bootstrap').error(
      `MEDIA_UPLOAD_DIR is not writable: ${uploadDir}. Image uploads will fail until this path ` +
        `exists and is owned by the API process. Set MEDIA_UPLOAD_DIR to an absolute writable path.`,
      err instanceof Error ? err.stack : String(err),
    );
  }
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // ResponseInterceptor is registered as APP_INTERCEPTOR (DI) in AppModule.
  app.useGlobalFilters(new AllExceptionsFilter());
  // Expose X-Cart-Token so the storefront JS can read the guest cart token the cart endpoints mint
  // (cross-origin browsers hide non-simple response headers unless listed here). Without this the
  // guest token is invisible to the client, never resent, and the guest cart always reads empty.
  app.enableCors({ exposedHeaders: ['X-Cart-Token'] });

  // Swagger / OpenAPI at http://localhost:<port>/api/v1/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sports E-Commerce API')
    .setDescription('REST API for the sports e-commerce platform (see docs/api-contracts/)')
    .setVersion('1.0')
    .addBearerAuth()
    .addSecurity('service-token', {
      type: 'http',
      scheme: 'bearer',
      description: 'Shared service token for internal service-to-service endpoints.',
    })
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document);

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 API ready at  http://localhost:${port}/api/v1`);
  logger.log(`📚 Swagger docs  http://localhost:${port}/api/v1/docs`);
  logger.log(`🖼  Media uploads written to  ${uploadDir}  (served at /uploads)`);
}

void bootstrap();
