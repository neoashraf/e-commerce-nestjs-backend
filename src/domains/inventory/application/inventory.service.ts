import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Paginated } from '../../../shared/dto/paginated';
import { deriveStockStatus, StockStatus } from '../domain/stock-status';
import { StockMovementType } from '../domain/stock-movement-type';
import { InventoryOrmEntity } from '../infrastructure/persistence/typeorm/entities/inventory.orm-entity';
import { LowStockAlertService } from './low-stock-alert.service';
import { MovementActor, MovementService } from './movement.service';

export interface AvailabilityEntry {
  available: number;
  status: StockStatus;
}

export interface InventoryRow {
  variant_id: string;
  sku_code: string;
  product_title: string | null;
  options: Record<string, string> | null;
  on_hand: number;
  reserved: number;
  available: number;
  low_stock_threshold: number;
  status: StockStatus;
}

export interface StockMutationResult {
  variant_id: string;
  on_hand: number;
  available: number;
  movement_id: string | null;
}

interface VariantLabel {
  productTitle: string | null;
  options: Record<string, string> | null;
}

/**
 * Inventory stock core (FR-INV-001–013): the authoritative per-SKU record, the batched availability
 * read (CAT/SRCH/CART/WISH consume it), the admin list (with a degrading CAT label join), and the
 * receive/adjust/threshold mutations (atomic under a row lock; on_hand never < 0). Stock lives ONLY
 * here (BR-INV-3). Reservations/ledger/bulk/alerts are deferred — `reserved`/`last_alert_at` exist
 * read-only and `movement_id` is null until the ledger ships.
 */
@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryOrmEntity)
    private readonly inventory: Repository<InventoryOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly movements: MovementService,
    private readonly alerts: LowStockAlertService,
  ) {}

  // ---------------------------------------------------------------------------
  // Auto-create hook (called by CAT when a variant is created, FR-INV-002)
  // ---------------------------------------------------------------------------

  /** Idempotently ensure an inventory record exists for a variant (zero stock, default threshold). */
  async ensureRecordForVariant(variantId: string, productId: string): Promise<void> {
    const existing = await this.inventory.findOne({ where: { variantId } });
    if (existing) return;
    await this.inventory.save(
      this.inventory.create({
        variantId,
        productId,
        onHand: 0,
        reserved: 0,
        available: 0,
        lowStockThreshold: 0,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Batch availability (internal — FR-INV-003/004)
  // ---------------------------------------------------------------------------

  async batchAvailability(variantIds: string[]): Promise<Record<string, AvailabilityEntry>> {
    const result: Record<string, AvailabilityEntry> = {};
    const unique = Array.from(new Set(variantIds));
    // Unknown/uncreated ids resolve to out-of-stock (documented rule).
    for (const id of unique) {
      result[id] = { available: 0, status: StockStatus.OUT_OF_STOCK };
    }
    if (unique.length === 0) return result;

    const rows = await this.inventory.find({ where: { variantId: In(unique) } });
    for (const row of rows) {
      result[row.variantId] = {
        available: row.available,
        status: deriveStockStatus(row.available, row.lowStockThreshold),
      };
    }
    return result;
  }

  /**
   * On-hand + threshold per variant id (for the admin product editor's variant grid). Variants with
   * no inventory record are simply absent from the map (the caller defaults them to 0).
   */
  async getLevelsByVariantIds(
    variantIds: string[],
  ): Promise<Map<string, { onHand: number; lowStockThreshold: number }>> {
    const result = new Map<string, { onHand: number; lowStockThreshold: number }>();
    const unique = Array.from(new Set(variantIds));
    if (unique.length === 0) return result;
    const rows = await this.inventory.find({ where: { variantId: In(unique) } });
    for (const row of rows) {
      result.set(row.variantId, {
        onHand: row.onHand,
        lowStockThreshold: row.lowStockThreshold,
      });
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Admin list (FR-INV-001/042)
  // ---------------------------------------------------------------------------

  async list(filter: {
    page: number;
    limit: number;
    status?: StockStatus;
    q?: string;
  }): Promise<Paginated<InventoryRow>> {
    // Join CAT labels when the variant/product tables exist; degrade gracefully otherwise.
    const hasVariants = await this.tableExists('product_variants');

    const qb = this.inventory.createQueryBuilder('inv').select([
      'inv.variant_id AS variant_id',
      'inv.on_hand AS on_hand',
      'inv.reserved AS reserved',
      'inv.available AS available',
      'inv.low_stock_threshold AS low_stock_threshold',
    ]);

    if (hasVariants) {
      qb.leftJoin('product_variants', 'pv', 'pv.id = inv.variant_id')
        .leftJoin('products', 'p', 'p.id = inv.product_id')
        .addSelect('pv.sku_code', 'sku_code')
        .addSelect('p.name', 'product_title');
    } else {
      qb.addSelect("''", 'sku_code').addSelect('NULL', 'product_title');
    }

    if (filter.status) {
      qb.andWhere(this.statusPredicate(filter.status));
    }
    if (filter.q) {
      if (hasVariants) {
        qb.andWhere('(pv.sku_code ILIKE :q OR p.name ILIKE :q)', { q: `%${filter.q}%` });
      } else {
        // No labels to search; an explicit q with no CAT data yields no matches.
        qb.andWhere('1 = 0');
      }
    }

    const countQb = qb.clone();
    const total = Number((await countQb.select('COUNT(*)', 'count').getRawOne<{ count: string }>())?.count ?? 0);

    const raw = await qb
      .orderBy('inv.updated_at', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .getRawMany<{
        variant_id: string;
        sku_code: string | null;
        product_title: string | null;
        on_hand: number;
        reserved: number;
        available: number;
        low_stock_threshold: number;
      }>();

    const optionLabels = hasVariants
      ? await this.loadVariantOptionLabels(raw.map((r) => r.variant_id))
      : new Map<string, Record<string, string>>();

    const items: InventoryRow[] = raw.map((r) => ({
      variant_id: r.variant_id,
      sku_code: r.sku_code ?? r.variant_id,
      product_title: r.product_title ?? null,
      options: optionLabels.get(r.variant_id) ?? null,
      on_hand: Number(r.on_hand),
      reserved: Number(r.reserved),
      available: Number(r.available),
      low_stock_threshold: Number(r.low_stock_threshold),
      status: deriveStockStatus(Number(r.available), Number(r.low_stock_threshold)),
    }));

    return new Paginated(items, { page: filter.page, limit: filter.limit, total });
  }

  // ---------------------------------------------------------------------------
  // Mutations (FR-INV-010/011/012/013) — atomic per record
  // ---------------------------------------------------------------------------

  async receive(
    variantId: string,
    quantity: number,
    reason: string,
    actor: MovementActor,
  ): Promise<StockMutationResult> {
    if (quantity <= 0) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'quantity must be > 0.' });
    }
    if (!reason || reason.trim() === '') {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'reason is required.' });
    }
    return this.applyDelta(variantId, quantity, StockMovementType.RECEIVE, reason, actor);
  }

  async adjust(
    variantId: string,
    quantityDelta: number,
    reason: string,
    actor: MovementActor,
  ): Promise<StockMutationResult> {
    if (quantityDelta === 0) {
      throw new BadRequestException({
        code: 'INVALID_DELTA',
        message: 'quantity_delta must be non-zero.',
      });
    }
    if (!reason || reason.trim() === '') {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'reason is required.' });
    }
    return this.applyDelta(variantId, quantityDelta, StockMovementType.ADJUST, reason, actor);
  }

  async setThreshold(variantId: string, threshold: number): Promise<StockMutationResult> {
    if (!Number.isInteger(threshold) || threshold < 0) {
      throw new BadRequestException({
        code: 'INVALID_THRESHOLD',
        message: 'low_stock_threshold must be an integer ≥ 0.',
      });
    }
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(InventoryOrmEntity);
      const row = await repo
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.variant_id = :variantId', { variantId })
        .getOne();
      if (!row) throw this.notFound(variantId);
      row.lowStockThreshold = threshold;
      await repo.save(row);
      // A threshold change is not a quantity change, so it writes no ledger movement (FR-INV-050).
      // But raising the threshold above on-hand puts the SKU into the low/out band immediately
      // (§12.10) — evaluate so it alerts once; lowering it may re-arm a recovered SKU.
      await this.alerts.evaluate(manager, variantId);
      return this.toMutationResult(row, null);
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Apply a signed on-hand delta inside a row-locked transaction and write the matching ledger
   * movement in the SAME transaction (FR-INV-010/011/050, §14). Returns the real `movement_id`.
   */
  private async applyDelta(
    variantId: string,
    delta: number,
    type: StockMovementType,
    reason: string,
    actor: MovementActor,
  ): Promise<StockMutationResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(InventoryOrmEntity);
      const row = await repo
        .createQueryBuilder('inv')
        .setLock('pessimistic_write')
        .where('inv.variant_id = :variantId', { variantId })
        .getOne();
      if (!row) throw this.notFound(variantId);

      const nextOnHand = row.onHand + delta;
      if (nextOnHand < 0) {
        throw new ConflictException({
          code: 'NEGATIVE_ON_HAND',
          message: 'Adjustment would make on-hand negative.',
        });
      }
      row.onHand = nextOnHand;
      row.available = nextOnHand - row.reserved;
      await repo.save(row);

      const movementId = await this.movements.recordMovement(manager, {
        type,
        variantId,
        quantityDelta: delta,
        resultingOnHand: nextOnHand,
        reason,
        actor,
      });

      // Alert/debounce/re-arm hook: an adjust-down may cross the threshold; a receive may recover it
      // (FR-INV-040/041). Runs in this same transaction (shared path, no per-caller logic).
      await this.alerts.evaluate(manager, variantId);

      return this.toMutationResult(row, movementId);
    });
  }

  private toMutationResult(
    row: InventoryOrmEntity,
    movementId: string | null,
  ): StockMutationResult {
    return {
      variant_id: row.variantId,
      on_hand: row.onHand,
      available: row.available,
      movement_id: movementId,
    };
  }

  private notFound(variantId: string): NotFoundException {
    return new NotFoundException({
      code: 'INVENTORY_NOT_FOUND',
      message: `No inventory record for variant ${variantId}.`,
    });
  }

  /** SQL predicate matching the shared status deriver, for filtering the list by derived status. */
  private statusPredicate(status: StockStatus): string {
    switch (status) {
      case StockStatus.OUT_OF_STOCK:
        return 'inv.available <= 0';
      case StockStatus.LOW_STOCK:
        return 'inv.available > 0 AND inv.available <= inv.low_stock_threshold';
      case StockStatus.IN_STOCK:
      default:
        return 'inv.available > inv.low_stock_threshold';
    }
  }

  /** Load `{ attributeLabel: optionLabel }` per variant from CAT; empty when labels unavailable. */
  private async loadVariantOptionLabels(
    variantIds: string[],
  ): Promise<Map<string, Record<string, string>>> {
    const grouped = new Map<string, Record<string, string>>();
    if (variantIds.length === 0) return grouped;
    if (!(await this.tableExists('product_variant_options'))) return grouped;

    try {
      const rows = await this.dataSource.query(
        `SELECT pvo."variant_id" AS variant_id, a."admin_label" AS attr_label, ao."label" AS opt_label
           FROM "product_variant_options" pvo
           JOIN "attributes" a ON a."id" = pvo."attribute_id"
           JOIN "attribute_options" ao ON ao."id" = pvo."option_id"
          WHERE pvo."variant_id" = ANY($1)`,
        [variantIds],
      );
      for (const r of rows as { variant_id: string; attr_label: string; opt_label: string }[]) {
        const map = grouped.get(r.variant_id) ?? {};
        map[r.attr_label] = r.opt_label;
        grouped.set(r.variant_id, map);
      }
    } catch {
      return new Map<string, Record<string, string>>();
    }
    return grouped;
  }

  private async tableExists(table: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }
}
