import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 8000);

  // Base URL: http://localhost:<port>/api
  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.enableCors();

  // Swagger / OpenAPI at http://localhost:<port>/api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Sports E-Commerce API')
    .setDescription('REST API for the sports e-commerce platform (see docs/api-contracts/)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🚀 API ready at  http://localhost:${port}/api`);
  logger.log(`📚 Swagger docs  http://localhost:${port}/api/docs`);
}

void bootstrap();
