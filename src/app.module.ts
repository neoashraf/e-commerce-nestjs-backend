import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Domain modules (AuthModule, CatalogModule, …) get registered here as they are built.
    // TypeOrmModule.forRoot(...) is wired in when the first DB-backed module lands.
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
