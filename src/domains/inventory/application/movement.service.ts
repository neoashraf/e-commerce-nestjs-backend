import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';

import { Paginated } from '../../../shared/dto/paginated';
import { OrderOrmEntity } from '../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import {
  StockMovementActorType,
  StockMovementType,
} from '../domain/stock-movement-type';
import { StockMovementOrmEntity } from '../infrastructure/persistence/typeorm/entities/stock-movement.orm-entity';

/** Actor attribution for a movement (FR-INV-050; SRS 11 §12 edge case 2/3). */
export interface MovementActor {
  type: StockMovementActorType;
  id?: string | null;
}

/** Inputs to the single ledger writer. `manager` ties the insert to the caller's stock transaction. */
export interface RecordMovementInput {
  type: StockMovementType;
  variantId: string;
  quantityDelta: number;
  resultingOnHand: number;
  reason?: string | null;
  orderId?: string | null;
  actor: MovementActor;
}

/** One ledger row in the admin history read (contract: Admin — Movement Ledger). */
export interface MovementRow {
  id: string;
  type: StockMovementType;
  quantity_delta: number;
  resulting_on_hand: number;
  reason: string | null;
  order_id: string | null;
  /** Human-readable `SO-` order number resolved from `order_id` (BR-ORD-2); null when unlinked/unknown. */
  order_no: string | null;
  actor_type: StockMovementActorType;
  actor_id: string | null;
  created_at: Date;
}

export interface ListMovementsFilter {
  page: number;
  limit: number;
  type?: StockMovementType;
  from?: Date;
  to?: Date;
}

/**
 * Stock movement ledger (SRS 11 §5.6, FR-INV-050/051/052). This is the **single shared writer** every
 * stock path calls: receive/adjust (this module), reserve/release/sale/restock/scrap (reservations
 * brief), and bulk (bulk brief). `recordMovement` runs inside the caller's transaction (it takes the
 * caller's `EntityManager`) so the ledger row commits atomically with the stock mutation (BR-INV-6).
 * The ledger is append-only — there is no update/delete method (FR-INV-052).
 */
@Injectable()
export class MovementService {
  constructor(
    @InjectRepository(StockMovementOrmEntity)
    private readonly movements: Repository<StockMovementOrmEntity>,
    // Read-only cross-domain lookup to map a movement's order_id → order_no for the ledger display.
    @InjectRepository(OrderOrmEntity)
    private readonly orders: Repository<OrderOrmEntity>,
  ) {}

  /**
   * Insert one immutable movement and return its id. MUST be called inside the same transaction as the
   * stock mutation it records (pass that transaction's `manager`) so they commit/rollback together.
   */
  async recordMovement(manager: EntityManager, input: RecordMovementInput): Promise<string> {
    const repo = manager.getRepository(StockMovementOrmEntity);
    const entity = repo.create({
      variantId: input.variantId,
      type: input.type,
      quantityDelta: input.quantityDelta,
      resultingOnHand: input.resultingOnHand,
      reason: input.reason ?? null,
      orderId: input.orderId ?? null,
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
    });
    const saved = await repo.save(entity);
    return saved.id;
  }

  /** Paginated SKU movement history, newest-first, filtered by type + date range (FR-INV-051). */
  async listForVariant(
    variantId: string,
    filter: ListMovementsFilter,
  ): Promise<Paginated<MovementRow>> {
    const qb = this.movements
      .createQueryBuilder('mv')
      .where('mv.variant_id = :variantId', { variantId });

    if (filter.type) {
      qb.andWhere('mv.type = :type', { type: filter.type });
    }
    if (filter.from) {
      qb.andWhere('mv.created_at >= :from', { from: filter.from });
    }
    if (filter.to) {
      qb.andWhere('mv.created_at <= :to', { to: filter.to });
    }

    const total = await qb.getCount();
    const rows = await qb
      .orderBy('mv.created_at', 'DESC')
      .addOrderBy('mv.id', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getMany();

    const orderNoById = await this.resolveOrderNos(rows);

    const items: MovementRow[] = rows.map((r) => ({
      id: r.id,
      type: r.type,
      quantity_delta: r.quantityDelta,
      resulting_on_hand: r.resultingOnHand,
      reason: r.reason,
      order_id: r.orderId,
      order_no: r.orderId ? orderNoById.get(r.orderId) ?? null : null,
      actor_type: r.actorType,
      actor_id: r.actorId,
      created_at: r.createdAt,
    }));

    return new Paginated(items, { page: filter.page, limit: filter.limit, total });
  }

  /**
   * Batch-resolve the distinct order ids on a ledger page to their human-readable `SO-` numbers
   * (BR-ORD-2), so the admin Movements view can show/link the order number instead of the raw UUID.
   * One query per page; unknown ids simply map to nothing (→ null on the row).
   */
  private async resolveOrderNos(
    rows: StockMovementOrmEntity[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.orderId).filter((id): id is string => !!id))];
    if (ids.length === 0) return new Map();

    const orders = await this.orders.find({
      where: { id: In(ids) },
      select: { id: true, orderNo: true },
    });
    return new Map(orders.map((o) => [o.id, o.orderNo]));
  }
}
