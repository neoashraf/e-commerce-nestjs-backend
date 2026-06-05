import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ServiceTokenGuard } from '../../shared/guards/service-token.guard';
import { RbacModule } from '../rbac/rbac.module';
import { InventoryService } from './application/inventory.service';
import { MovementService } from './application/movement.service';
import { InventoryOrmEntity } from './infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import { StockMovementOrmEntity } from './infrastructure/persistence/typeorm/entities/stock-movement.orm-entity';
import { InventoryController } from './presentation/inventory.controller';
import { InventoryInternalController } from './presentation/inventory-internal.controller';
import { MovementsController } from './presentation/movements.controller';

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
    RbacModule,
    TypeOrmModule.forFeature([InventoryOrmEntity, StockMovementOrmEntity]),
  ],
  controllers: [InventoryController, InventoryInternalController, MovementsController],
  providers: [InventoryService, MovementService, ServiceTokenGuard],
  exports: [InventoryService, MovementService],
})
export class InventoryModule {}
