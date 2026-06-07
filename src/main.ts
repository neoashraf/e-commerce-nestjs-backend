import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './shared/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  // rawBody: true preserves the exact request bytes (req.rawBody) so provider webhooks
  // (NOTIF SMS DLR / email events) can be HMAC signature-verified (FR-NOTIF-041, §14).
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 8000);

  // Base URL: http://localhost:<port>/api/v1  (per SRS §7)
  app.setGlobalPrefix('api/v1');

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
