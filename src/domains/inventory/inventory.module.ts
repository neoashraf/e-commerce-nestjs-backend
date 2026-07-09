import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { RbacModule } from '../rbac/rbac.module';
import { BulkService } from './application/bulk.service';
import { InventoryService } from './application/inventory.service';
import { LowStockAlertService } from './application/low-stock-alert.service';
import { MovementService } from './application/movement.service';
import { INVENTORY_NOTIFIER } from './application/ports/inventory-notifier.port';
import { ReservationService } from './application/reservation.service';
import { ReservationExpiryTask } from './application/reservation-expiry.task';
import { LoggingInventoryNotifier } from './infrastructure/services/logging-inventory-notifier.service';
import { InventoryOrmEntity } from './infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import { StockMovementOrmEntity } from './infrastructure/persistence/typeorm/entities/stock-movement.orm-entity';
import { StockReservationOrmEntity } from './infrastructure/persistence/typeorm/entities/stock-reservation.orm-entity';
import { OrderOrmEntity } from '../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { BulkController } from './presentation/bulk.controller';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryInternalController } from './presentation/inventory-internal.controller';
import { MovementsController } from './presentation/movements.controller';
import { ReservationController } from './presentation/reservation.controller';

/**
 * Inventory domain (INV) — the authoritative per-SKU stock core (SRS 11 §5.1/§5.2): batched
 * availability read (internal), admin list, and receive/adjust/threshold mutations. Imports
 * RbacModule for the admin auth + permission gate and ConfigModule for the internal service-token
 * guard. `InventoryService` is exported so CAT can call `ensureRecordForVariant` and later modules
 * (CART/ORD) build the deferred reservation/decrement flows on top.
 */
@Module({
  imports: [
    ConfigModule,
    forwardRef(() => RbacModule),
    TypeOrmModule.forFeature([
      InventoryOrmEntity,
      StockMovementOrmEntity,
      StockReservationOrmEntity,
      // Read-only: resolve a movement's order_id → human-readable order_no for the ledger (BR-ORD-2).
      OrderOrmEntity,
    ]),
  ],
  controllers: [
    InventoryController,
    InventoryInternalController,
    MovementsController,
    ReservationController,
    BulkController,
  ],
  providers: [
    InventoryService,
    MovementService,
    ReservationService,
    ReservationExpiryTask,
    BulkService,
    LowStockAlertService,
    // NOTIF seam: logging stub until notif-dispatch-be is wired (replace with a NOTIF-backed adapter).
    { provide: INVENTORY_NOTIFIER, useClass: LoggingInventoryNotifier },
    ServiceTokenGuard,
  ],
  exports: [InventoryService, MovementService, ReservationService],
})
export class InventoryModule {}
