import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CodService } from './application/services/cod.service';
import { PaymentsService } from './application/services/payments.service';
import { ReconService } from './application/services/recon.service';
import { SettingsService } from './application/services/settings.service';
import { ORDER_GATEWAY, StubOrderGateway } from './application/ports/order-gateway.port';
import { BkashStubAdapter } from './application/providers/bkash-stub.adapter';
import { CodAdapter } from './application/providers/cod.adapter';
import { SslcommerzStubAdapter } from './application/providers/sslcommerz-stub.adapter';
import { PAYMENT_PROVIDERS } from './application/providers/payment-provider.interface';
import { GatewayConfigOrmEntity } from './infrastructure/persistence/typeorm/entities/gateway-config.orm-entity';
import { PaymentTransactionLogOrmEntity } from './infrastructure/persistence/typeorm/entities/payment-transaction-log.orm-entity';
import { PaymentOrmEntity } from './infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { RefundOrmEntity } from './infrastructure/persistence/typeorm/entities/refund.orm-entity';
import { AdminPaymentsController } from './presentation/controllers/admin-payments.controller';
import { PaymentsController } from './presentation/controllers/payments.controller';
import { SettingsController } from './presentation/controllers/settings.controller';

/**
 * Payments (PAY) domain — the framework (pay-core-be): Payment/Refund/PaymentTransactionLog/
 * GatewayConfig entities, the initiate/status/retry lifecycle (the real `PaymentInitiator` CART calls),
 * the COD lifecycle, the append-only reconciliation log (`recordTxn`), gateway settings (no secrets),
 * and the `PaymentProvider` adapter port (COD adapter + bKash/SSLCommerz stubs — real online adapters +
 * webhooks/IPN land in pay-gateways-be; refunds + exchange top-up in pay-refunds-be). Payment↔order
 * propagation goes through the `OrderGateway` port (stubbed until ORD is wired in-process). Imports
 * AuthModule (customer guard) + RbacModule (admin guard/permissions). `PaymentsService`/`ReconService`/
 * `SettingsService` are exported for the gateway/refund slices + in-process CART consumption.
 */
@Module({
  imports: [
    ConfigModule,
    AuthModule,
    RbacModule,
    TypeOrmModule.forFeature([
      PaymentOrmEntity,
      RefundOrmEntity,
      PaymentTransactionLogOrmEntity,
      GatewayConfigOrmEntity,
    ]),
  ],
  controllers: [PaymentsController, AdminPaymentsController, SettingsController],
  providers: [
    PaymentsService,
    CodService,
    ReconService,
    SettingsService,
    ServiceTokenGuard,
    CodAdapter,
    BkashStubAdapter,
    SslcommerzStubAdapter,
    // Provider registry — the use-case indexes adapters by method (COD real; bKash/SSLCommerz stubs).
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (cod: CodAdapter, bkash: BkashStubAdapter, ssl: SslcommerzStubAdapter) => [
        cod,
        bkash,
        ssl,
      ],
      inject: [CodAdapter, BkashStubAdapter, SslcommerzStubAdapter],
    },
    // ORD seam: stubbed until ord-core-be is wired in-process (BW5 CART step).
    { provide: ORDER_GATEWAY, useClass: StubOrderGateway },
  ],
  exports: [PaymentsService, ReconService, SettingsService],
})
export class PaymentsModule {}
