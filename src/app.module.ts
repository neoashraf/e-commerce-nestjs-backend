import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './domains/auth/auth.module';
import { CartModule } from './domains/cart/cart.module';
import { CatalogModule } from './domains/catalog/catalog.module';
import { ContentModule } from './domains/content/content.module';
import { CustomersModule } from './domains/customers/customers.module';
import { DashboardModule } from './domains/dashboard/dashboard.module';
import { InventoryModule } from './domains/inventory/inventory.module';
import { LeadsModule } from './domains/leads/leads.module';
import { NotificationsModule } from './domains/notifications/notifications.module';
import { OrdersModule } from './domains/orders/orders.module';
import { PaymentsModule } from './domains/payments/payments.module';
import { PromotionsModule } from './domains/promotions/promotions.module';
import { RbacModule } from './domains/rbac/rbac.module';
import { ReportsModule } from './domains/reports/reports.module';
import { SearchModule } from './domains/search/search.module';
import { WishlistModule } from './domains/wishlist/wishlist.module';
import { ResponseInterceptor } from './shared/interceptors/response.interceptor';
import { MediaModule } from './shared/media/media.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MediaModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      // e2e seam: rate limits are unit-tested at the use-case layer; the HTTP throttler
      // would otherwise 429 fast supertest suites (same IP for every request).
      skipIf: () => process.env.NODE_ENV === 'test',
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_NAME', 'e-commerce'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthModule,
    NotificationsModule,
    RbacModule,
    CatalogModule,
    InventoryModule,
    CartModule,
    SearchModule,
    ContentModule,
    PromotionsModule,
    OrdersModule,
    PaymentsModule,
    WishlistModule,
    LeadsModule,
    ReportsModule,
    CustomersModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
