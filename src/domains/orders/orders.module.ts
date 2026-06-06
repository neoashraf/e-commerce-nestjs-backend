import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { AutoCancelTask } from './application/services/auto-cancel.task';
import { OrderCreationService } from './application/services/order-creation.service';
import { OrderNumberingService } from './application/services/order-numbering.service';
import { OrderQueryService } from './application/services/order-query.service';
import {
  ORDER_NOTIFIER,
  StubOrderNotifier,
} from './application/ports/order-notifier.port';
import {
  STOCK_COORDINATOR,
  StubStockCoordinator,
} from './application/ports/stock-coordinator.port';
import { OrderItemOrmEntity } from './infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from './infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from './infrastructure/persistence/typeorm/entities/order.orm-entity';
import { PaymentStateController } from './presentation/controllers/payment-state.controller';

/**
 * Orders (ORD) domain — the order core (ord-core-be). Order creation is the real `OrderPlacer` CART
 * calls at placement; `POST /internal/orders/{orderNo}/payment-state` is the `OrderGateway` target PAY
 * reflects into. Snapshots are immutable (BR-ORD-1); numbering is `SO-` from a DB sequence (BR-ORD-2);
 * stock decrement on confirmation + restock are idempotent via the INV port; lifecycle events go out
 * via the NOTIF port. Unpaid online orders auto-cancel after 30 min with a ~10-min reminder. INV/NOTIF
 * are stubbed until wired in-process (BW5 CART step). `OrderCreationService` + `OrderQueryService` are
 * exported for in-process consumers (CART, PAY, the fulfilment/tracking slices).
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([OrderOrmEntity, OrderItemOrmEntity, OrderStatusHistoryOrmEntity]),
  ],
  controllers: [PaymentStateController],
  providers: [
    OrderCreationService,
    OrderNumberingService,
    OrderQueryService,
    AutoCancelTask,
    ServiceTokenGuard,
    // INV/NOTIF seams: stubbed until inv-reservations-be / notif-dispatch-be are wired in-process.
    { provide: STOCK_COORDINATOR, useClass: StubStockCoordinator },
    { provide: ORDER_NOTIFIER, useClass: StubOrderNotifier },
  ],
  exports: [OrderCreationService, OrderQueryService],
})
export class OrdersModule {}
