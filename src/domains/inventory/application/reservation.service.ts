import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan, Repository } from 'typeorm';

import { ReservationStatus } from '../domain/reservation-status';
import {
  StockMovementActorType,
  StockMovementType,
} from '../domain/stock-movement-type';
import { InventoryOrmEntity } from '../infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import { StockReservationOrmEntity } from '../infrastructure/persistence/typeorm/entities/stock-reservation.orm-entity';
import { MovementService } from './movement.service';

export interface ReserveLine {
  variantId: string;
  quantity: number;
}

export interface ReserveResult {
  reserved: true;
  expires_at: Date;
}

export interface ReleaseResult {
  released: true;
}

export interface DecrementResult {
  decremented: true;
  already_applied?: true;
}

export interface RestockResult {
  applied: true;
  disposition: 'restocked' | 'scrapped';
  already_applied?: true;
}

export interface Shortfall {
  variant_id: string;
  requested: number;
  available: number;
}

const SYSTEM_ACTOR = { type: StockMovementActorType.SYSTEM };

/**
 * Inventory reservation + order-coordination core (SRS 11 §5.3/§5.4, FR-INV-020–023/030–033). The
 * internal API CART (reserve/release) and ORD (decrement/restock/scrap) coordinate stock through.
 * Every operation is transactional + row-locked (no oversell, §14/§12.1), idempotent per order
 * (BR-INV-4), and writes through the shared ledger (`recordMovement`, BR-INV-6). This is the real impl
 * behind checkout-be's `StockReserver` port and ORD's stock hooks.
 */
@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);
  private readonly holdMs: number;

  constructor(
    @InjectRepository(InventoryOrmEntity)
    private readonly inventory: Repository<InventoryOrmEntity>,
    @InjectRepository(StockReservationOrmEntity)
    private readonly reservations: Repository<StockReservationOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly movements: MovementService,
    config: ConfigService,
  ) {
    // Online-order reservation hold (SRS §15/§16: 30 min default, configurable).
    this.holdMs = Number(config.get('INVENTORY_RESERVATION_HOLD_MS') ?? 30 * 60 * 1000);
  }

  // ---------------------------------------------------------------------------
  // Reserve (FR-INV-020/023)
  // ---------------------------------------------------------------------------

  async reserve(orderId: string, lines: ReserveLine[]): Promise<ReserveResult> {
    return this.dataSource.transaction(async (manager) => {
      // Idempotency: a repeat for the same order returns the existing hold (no double-hold).
      const existing = await manager.getRepository(StockReservationOrmEntity).find({
        where: { orderId, status: ReservationStatus.HELD },
      });
      if (existing.length > 0) {
        const expiresAt = existing[0].expiresAt;
        return { reserved: true as const, expires_at: expiresAt };
      }

      // Aggregate requested qty per variant (a SKU could appear twice).
      const requested = new Map<string, number>();
      for (const line of lines) {
        requested.set(line.variantId, (requested.get(line.variantId) ?? 0) + line.quantity);
      }
      const variantIds = Array.from(requested.keys());

      // Lock all affected inventory rows in a stable order to avoid deadlocks.
      const rows = await this.lockInventoryRows(manager, variantIds);
      const byVariant = new Map(rows.map((r) => [r.variantId, r]));

      // Check availability for every line first — no partial hold (BR-INV-1, §12.1).
      const shortfalls: Shortfall[] = [];
      for (const variantId of variantIds) {
        const qty = requested.get(variantId) ?? 0;
        const row = byVariant.get(variantId);
        const available = row ? row.available : 0;
        if (!row || available < qty) {
          shortfalls.push({ variant_id: variantId, requested: qty, available: row ? available : 0 });
        }
      }
      if (shortfalls.length > 0) {
        throw new ConflictException({ code: 'INSUFFICIENT_STOCK', shortfalls });
      }

      const expiresAt = new Date(Date.now() + this.holdMs);
      const reservationRepo = manager.getRepository(StockReservationOrmEntity);
      for (const variantId of variantIds) {
        const qty = requested.get(variantId) ?? 0;
        const row = byVariant.get(variantId)!;
        row.reserved += qty;
        row.available = row.onHand - row.reserved;
        await manager.getRepository(InventoryOrmEntity).save(row);

        await reservationRepo.save(
          reservationRepo.create({
            orderId,
            variantId,
            quantity: qty,
            status: ReservationStatus.HELD,
            expiresAt,
          }),
        );

        await this.movements.recordMovement(manager, {
          type: StockMovementType.RESERVE,
          variantId,
          quantityDelta: 0, // reserve does not change on_hand; it holds available
          resultingOnHand: row.onHand,
          orderId,
          actor: SYSTEM_ACTOR,
        });
      }

      return { reserved: true as const, expires_at: expiresAt };
    });
  }

  // ---------------------------------------------------------------------------
  // Release (FR-INV-022/023)
  // ---------------------------------------------------------------------------

  async release(orderId: string): Promise<ReleaseResult> {
    return this.dataSource.transaction(async (manager) =>
      this.releaseHeld(manager, orderId, ReservationStatus.RELEASED),
    );
  }

  /** Shared release path used by `release` and the expiry sweep. Idempotent (absent held → no-op). */
  private async releaseHeld(
    manager: EntityManager,
    orderId: string,
    finalStatus: ReservationStatus.RELEASED | ReservationStatus.EXPIRED,
  ): Promise<ReleaseResult> {
    const reservationRepo = manager.getRepository(StockReservationOrmEntity);
    const held = await reservationRepo.find({
      where: { orderId, status: ReservationStatus.HELD },
    });
    if (held.length === 0) return { released: true as const };

    const variantIds = Array.from(new Set(held.map((h) => h.variantId)));
    const rows = await this.lockInventoryRows(manager, variantIds);
    const byVariant = new Map(rows.map((r) => [r.variantId, r]));

    for (const reservation of held) {
      const row = byVariant.get(reservation.variantId);
      if (row) {
        row.reserved = Math.max(0, row.reserved - reservation.quantity);
        row.available = row.onHand - row.reserved;
        await manager.getRepository(InventoryOrmEntity).save(row);

        await this.movements.recordMovement(manager, {
          type: StockMovementType.RELEASE,
          variantId: reservation.variantId,
          quantityDelta: 0,
          resultingOnHand: row.onHand,
          orderId,
          actor: SYSTEM_ACTOR,
        });
      }
      reservation.status = finalStatus;
      await reservationRepo.save(reservation);
    }

    return { released: true as const };
  }

  // ---------------------------------------------------------------------------
  // Decrement (reservation → sale) (FR-INV-030/033)
  // ---------------------------------------------------------------------------

  async decrement(orderId: string): Promise<DecrementResult> {
    return this.dataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(StockReservationOrmEntity);

      // Idempotent replay: if the order's reservations are already consumed, this was applied.
      const consumed = await reservationRepo.count({
        where: { orderId, status: ReservationStatus.CONSUMED },
      });
      const held = await reservationRepo.find({
        where: { orderId, status: ReservationStatus.HELD },
      });
      if (held.length === 0) {
        if (consumed > 0) {
          return { decremented: true as const, already_applied: true as const };
        }
        // Nothing held and nothing consumed — treat as a no-op success (defensive).
        return { decremented: true as const, already_applied: true as const };
      }

      const variantIds = Array.from(new Set(held.map((h) => h.variantId)));
      const rows = await this.lockInventoryRows(manager, variantIds);
      const byVariant = new Map(rows.map((r) => [r.variantId, r]));

      for (const reservation of held) {
        const row = byVariant.get(reservation.variantId);
        // Oversell guard: never silently go negative (BR-INV-8, §12.4).
        if (!row || row.onHand < reservation.quantity) {
          throw new ConflictException({ code: 'OVERSELL', variant_id: reservation.variantId });
        }
      }

      for (const reservation of held) {
        const row = byVariant.get(reservation.variantId)!;
        row.onHand -= reservation.quantity;
        row.reserved = Math.max(0, row.reserved - reservation.quantity);
        row.available = row.onHand - row.reserved;
        await manager.getRepository(InventoryOrmEntity).save(row);

        await this.movements.recordMovement(manager, {
          type: StockMovementType.SALE,
          variantId: reservation.variantId,
          quantityDelta: -reservation.quantity,
          resultingOnHand: row.onHand,
          orderId,
          actor: SYSTEM_ACTOR,
        });

        reservation.status = ReservationStatus.CONSUMED;
        await reservationRepo.save(reservation);
      }

      return { decremented: true as const };
    });
  }

  // ---------------------------------------------------------------------------
  // Restock / scrap (FR-INV-031/032/033)
  // ---------------------------------------------------------------------------

  async restock(
    orderId: string,
    disposition: 'restocked' | 'scrapped',
    lines?: ReserveLine[],
  ): Promise<RestockResult> {
    return this.dataSource.transaction(async (manager) => {
      const reservationRepo = manager.getRepository(StockReservationOrmEntity);

      // Determine the affected lines: explicit, else the order's consumed (sold) reservations.
      let affected: ReserveLine[];
      if (lines && lines.length > 0) {
        affected = lines;
      } else {
        const consumed = await reservationRepo.find({
          where: { orderId, status: ReservationStatus.CONSUMED },
        });
        affected = consumed.map((c) => ({ variantId: c.variantId, quantity: c.quantity }));
      }

      // Idempotency guard: a prior restock/scrap movement for this order+disposition means done.
      const alreadyApplied = await this.hasMovementForOrder(
        manager,
        orderId,
        disposition === 'restocked' ? StockMovementType.RESTOCK : StockMovementType.SCRAP,
      );
      if (alreadyApplied) {
        return { applied: true as const, disposition, already_applied: true as const };
      }

      // §12.6: restock applies only if a prior `sale` exists for the order.
      if (disposition === 'restocked') {
        const hasSale = await this.hasMovementForOrder(manager, orderId, StockMovementType.SALE);
        if (!hasSale) {
          this.logger.warn(`Restock requested for order ${orderId} with no prior sale; no stock added.`);
          return { applied: true as const, disposition, already_applied: true as const };
        }
      }

      const variantIds = Array.from(new Set(affected.map((l) => l.variantId)));
      const rows =
        disposition === 'restocked' ? await this.lockInventoryRows(manager, variantIds) : [];
      const byVariant = new Map(rows.map((r) => [r.variantId, r]));

      for (const line of affected) {
        if (disposition === 'restocked') {
          const row = byVariant.get(line.variantId);
          if (!row) continue;
          row.onHand += line.quantity;
          row.available = row.onHand - row.reserved;
          await manager.getRepository(InventoryOrmEntity).save(row);

          await this.movements.recordMovement(manager, {
            type: StockMovementType.RESTOCK,
            variantId: line.variantId,
            quantityDelta: line.quantity,
            resultingOnHand: row.onHand,
            orderId,
            actor: SYSTEM_ACTOR,
          });
        } else {
          // scrapped — record the movement; do NOT add to sellable on_hand (FR-INV-032).
          const current = await this.inventory.findOne({ where: { variantId: line.variantId } });
          await this.movements.recordMovement(manager, {
            type: StockMovementType.SCRAP,
            variantId: line.variantId,
            quantityDelta: 0,
            resultingOnHand: current ? current.onHand : 0,
            orderId,
            actor: SYSTEM_ACTOR,
          });
        }
      }

      return { applied: true as const, disposition };
    });
  }

  // ---------------------------------------------------------------------------
  // Expiry sweep (FR-INV-021)
  // ---------------------------------------------------------------------------

  /** Release all `held` reservations whose hold has passed `expires_at`. Idempotent + concurrency-safe. */
  async releaseExpiredReservations(now: Date = new Date()): Promise<number> {
    const overdue = await this.reservations.find({
      where: { status: ReservationStatus.HELD, expiresAt: LessThan(now) },
    });
    const orderIds = Array.from(new Set(overdue.map((r) => r.orderId)));
    let releasedOrders = 0;
    for (const orderId of orderIds) {
      await this.dataSource.transaction(async (manager) => {
        await this.releaseHeld(manager, orderId, ReservationStatus.EXPIRED);
      });
      releasedOrders += 1;
    }
    if (releasedOrders > 0) {
      this.logger.log(`Expiry sweep released reservations for ${releasedOrders} order(s).`);
    }
    return releasedOrders;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Pessimistically lock inventory rows for a set of variants, ordered for deadlock-safety. */
  private async lockInventoryRows(
    manager: EntityManager,
    variantIds: string[],
  ): Promise<InventoryOrmEntity[]> {
    if (variantIds.length === 0) return [];
    const sorted = [...variantIds].sort();
    return manager
      .getRepository(InventoryOrmEntity)
      .createQueryBuilder('inv')
      .setLock('pessimistic_write')
      .where('inv.variant_id IN (:...ids)', { ids: sorted })
      .orderBy('inv.variant_id', 'ASC')
      .getMany();
  }

  /** Whether a movement of `type` already exists for the order (idempotency / sale-guard). */
  private async hasMovementForOrder(
    manager: EntityManager,
    orderId: string,
    type: StockMovementType,
  ): Promise<boolean> {
    const count = await manager
      .createQueryBuilder()
      .select('1')
      .from('stock_movements', 'mv')
      .where('mv.order_id = :orderId', { orderId })
      .andWhere('mv.type = :type', { type })
      .limit(1)
      .getRawOne();
    return !!count;
  }

  /** Convenience for diagnostics: held reservations for an order. */
  async findHeldByOrder(orderId: string): Promise<StockReservationOrmEntity[]> {
    return this.reservations.find({ where: { orderId, status: ReservationStatus.HELD } });
  }
}
