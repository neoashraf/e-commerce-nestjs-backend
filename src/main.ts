import { mkdirSync } from 'fs';
import { basename, resolve } from 'path';

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

  // Serve generated report/customer exports at /exports (outside the api/v1 prefix). The RPT and CUST
  // export stores write files under REPORTS_EXPORT_DIR / CUSTOMERS_EXPORT_DIR (both default to
  // ./storage/exports) and hand back `${…_PUBLIC_BASE_URL}/<file>` download links. In prod a static
  // host / object store fronts this path; in local dev nothing did, so the link 404'd and the file
  // never downloaded. Mounting the export dir here makes the download link resolve.
  const exportDir = resolve(config.get<string>('REPORTS_EXPORT_DIR') ?? 'storage/exports');
  try {
    mkdirSync(exportDir, { recursive: true });
  } catch (err) {
    new Logger('Bootstrap').error(
      `REPORTS_EXPORT_DIR is not writable: ${exportDir}. Report/customer exports will fail until this ` +
        `path exists and is owned by the API process.`,
      err instanceof Error ? err.stack : String(err),
    );
  }
  // `Content-Disposition: attachment` forces the browser to download the file (PDF/CSV) on a plain
  // link navigation rather than rendering it inline — so the FE download link works in one click with
  // no cross-origin fetch (static responses don't carry CORS headers, so a fetch() blob would be
  // blocked). `basename` is taken from the resolved path, not user input, so the filename is safe.
  app.useStaticAssets(exportDir, {
    prefix: '/exports',
    setHeaders: (res, filePath) => {
      res.setHeader('Content-Disposition', `attachment; filename="${basename(filePath)}"`);
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  // ResponseInterceptor is registered as APP_INTERCEPTOR (DI) in AppModule.
  app.useGlobalFilters(new AllExceptionsFilter());
  // CORS: the storefront/admin run on a different origin (e.g. :3000) than the API (:8000).
  // `exposedHeaders` is required for the browser to read the guest cart token the cart write
  // mints — custom response headers are hidden from cross-origin JS unless explicitly exposed.
  // Without this, `X-Cart-Token` never reaches the FE, the token is never persisted, and every
  // subsequent GET /cart goes out token-less → the guest cart always reads empty.
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
  logger.log(`📄 Report exports written to  ${exportDir}  (served at /exports)`);
}

void bootstrap();
