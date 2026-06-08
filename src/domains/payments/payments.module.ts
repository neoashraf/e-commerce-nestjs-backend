import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CodService } from './application/services/cod.service';
import { PaymentsService } from './application/services/payments.service';
import { ReconService } from './application/services/recon.service';
import { SettingsService } from './application/services/settings.service';
import { ORDER_GATEWAY } from './application/ports/order-gateway.port';
import { OrderOrmEntity } from '../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { OrdOrderGateway } from './infrastructure/adapters/ord-order-gateway.adapter';
import {
  PAYMENT_NOTIFIER,
  StubPaymentNotifier,
} from './application/ports/payment-notifier.port';
import { ExchangeDifferenceService } from './application/services/exchange-difference.service';
import { RefundsService } from './application/services/refunds.service';
import { BkashAdapter } from './application/providers/bkash.adapter';
import { CodAdapter } from './application/providers/cod.adapter';
import { SslcommerzAdapter } from './application/providers/sslcommerz.adapter';
import { PAYMENT_PROVIDERS } from './application/providers/payment-provider.interface';
import { BkashTokenService } from './application/services/bkash-token.service';
import { GatewayFinalizerService } from './application/services/gateway-finalizer.service';
import { ReconciliationTask } from './application/services/reconciliation.task';
import { WebhookService } from './application/services/webhook.service';
import { GatewayConfigOrmEntity } from './infrastructure/persistence/typeorm/entities/gateway-config.orm-entity';
import { PaymentTransactionLogOrmEntity } from './infrastructure/persistence/typeorm/entities/payment-transaction-log.orm-entity';
import { PaymentOrmEntity } from './infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { RefundOrmEntity } from './infrastructure/persistence/typeorm/entities/refund.orm-entity';
import { AdminPaymentsController } from './presentation/controllers/admin-payments.controller';
import { ExchangeDifferenceController } from './presentation/controllers/exchange-difference.controller';
import { PaymentsController } from './presentation/controllers/payments.controller';
import { RefundsController } from './presentation/controllers/refunds.controller';
import { SettingsController } from './presentation/controllers/settings.controller';
import { WebhooksController } from './presentation/controllers/webhooks.controller';

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
    forwardRef(() => AuthModule),
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([
      PaymentOrmEntity,
      RefundOrmEntity,
      PaymentTransactionLogOrmEntity,
      GatewayConfigOrmEntity,
      OrderOrmEntity, // read-only: real ORD↔PAY gateway reads grand_total + reflects paid state
    ]),
  ],
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    SettingsController,
    WebhooksController,
    RefundsController,
    ExchangeDifferenceController,
  ],
  providers: [
    PaymentsService,
    CodService,
    ReconService,
    SettingsService,
    GatewayFinalizerService,
    WebhookService,
    BkashTokenService,
    ReconciliationTask,
    RefundsService,
    ExchangeDifferenceService,
    { provide: PAYMENT_NOTIFIER, useClass: StubPaymentNotifier },
    ServiceTokenGuard,
    CodAdapter,
    BkashAdapter,
    SslcommerzAdapter,
    // Provider registry — the use-case indexes adapters by method (COD + real bKash/SSLCommerz adapters).
    {
      provide: PAYMENT_PROVIDERS,
      useFactory: (cod: CodAdapter, bkash: BkashAdapter, ssl: SslcommerzAdapter) => [cod, bkash, ssl],
      inject: [CodAdapter, BkashAdapter, SslcommerzAdapter],
    },
    // ORD↔PAY seam — reads the real order grand_total + reflects paid state (was StubOrderGateway).
    OrdOrderGateway,
    { provide: ORDER_GATEWAY, useClass: OrdOrderGateway },
  ],
  exports: [PaymentsService, ReconService, SettingsService],
})
export class PaymentsModule {}
