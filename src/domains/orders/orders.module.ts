import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { AutoCancelTask } from './application/services/auto-cancel.task';
import { FulfilmentService } from './application/services/fulfilment.service';
import { OrderCreationService } from './application/services/order-creation.service';
import { OrderNumberingService } from './application/services/order-numbering.service';
import { OrderQueryService } from './application/services/order-query.service';
import {
  ORDER_NOTIFIER,
  StubOrderNotifier,
} from './application/ports/order-notifier.port';
import {
  REFUND_REQUESTER,
  StubRefundRequester,
} from './application/ports/refund-requester.port';
import {
  STOCK_COORDINATOR,
  StubStockCoordinator,
} from './application/ports/stock-coordinator.port';
import { OrderItemOrmEntity } from './infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderNoteOrmEntity } from './infrastructure/persistence/typeorm/entities/order-note.orm-entity';
import { OrderStatusHistoryOrmEntity } from './infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from './infrastructure/persistence/typeorm/entities/order.orm-entity';
import { CustomerCancelController } from './presentation/controllers/customer-cancel.controller';
import { FulfilmentController } from './presentation/controllers/fulfilment.controller';
import { PaymentStateController } from './presentation/controllers/payment-state.controller';

/**
 * Orders (ORD) domain — the order core (ord-core-be) + the fulfilment slice (ord-fulfilment-be). Order
 * creation is the real `OrderPlacer` CART calls at placement; `POST /internal/orders/{orderNo}/payment-state`
 * is the `OrderGateway` target PAY reflects into. Snapshots are immutable (BR-ORD-1); numbering is `SO-`
 * from a DB sequence (BR-ORD-2); stock decrement on confirmation + restock are idempotent via the INV
 * port; lifecycle events go out via the NOTIF port. Unpaid online orders auto-cancel after 30 min with a
 * ~10-min reminder. Fulfilment adds the admin status/cancel/notes + customer cancel surface (FR-ORD-020–024,
 * 040–042, 072): forward-only transitions, paid-before-progress, restock + prepaid gateway refund (PAY
 * port). INV/NOTIF/PAY-refund are stubbed until wired in-process (BW5). RbacModule/AuthModule supply the
 * admin/customer guards (forwardRef — the commerce modules are circular). `OrderCreationService` +
 * `OrderQueryService` are exported for in-process consumers (CART, PAY, the tracking slice).
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RbacModule),
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([
      OrderOrmEntity,
      OrderItemOrmEntity,
      OrderStatusHistoryOrmEntity,
      OrderNoteOrmEntity,
    ]),
  ],
  controllers: [PaymentStateController, FulfilmentController, CustomerCancelController],
  providers: [
    OrderCreationService,
    OrderNumberingService,
    OrderQueryService,
    FulfilmentService,
    AutoCancelTask,
    ServiceTokenGuard,
    // INV/NOTIF/PAY seams: stubbed until inv-reservations-be / notif-dispatch-be / pay-refunds-be are
    // wired in-process.
    { provide: STOCK_COORDINATOR, useClass: StubStockCoordinator },
    { provide: ORDER_NOTIFIER, useClass: StubOrderNotifier },
    { provide: REFUND_REQUESTER, useClass: StubRefundRequester },
  ],
  exports: [OrderCreationService, OrderQueryService],
})
export class OrdersModule {}
