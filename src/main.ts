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
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // ResponseInterceptor is registered as APP_INTERCEPTOR (DI) in AppModule.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

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
}

void bootstrap();
