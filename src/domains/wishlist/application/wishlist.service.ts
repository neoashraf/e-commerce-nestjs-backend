import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';

import { WishlistItemOrmEntity } from '../infrastructure/persistence/typeorm/entities/wishlist-item.orm-entity';
import { WishlistOrmEntity } from '../infrastructure/persistence/typeorm/entities/wishlist.orm-entity';
import { CATALOG_READER, ICatalogReader, WishlistProductCard, WishlistVariant } from './ports/catalog-reader.port';
import { CART_ADDER, ICartAdder } from './ports/cart-adder.port';
import { IStockChecker, STOCK_CHECKER } from './ports/stock-checker.port';
import { MAX_WISHLIST_ITEMS } from './wishlist.constants';

export type WishlistAvailability = 'in_stock' | 'out_of_stock' | 'unavailable';

export interface WishlistItemView {
  item_id: string;
  product: {
    id: string;
    slug: string;
    title: string;
    brand: string | null;
    primary_image: string | null;
    effective_price: string;
    base_price: string;
    on_sale: boolean;
    currency: 'BDT';
  };
  preferred_variant: { id: string; sku_code: string; options: Record<string, string> } | null;
  availability: WishlistAvailability;
  is_available: boolean;
  added_at: string;
}

export interface WishlistView {
  items: WishlistItemView[];
  total: number;
  max_items: number;
}

export interface AddItemResult {
  item_id: string;
  already_present: boolean;
}

export interface MoveToCartResult {
  cart_item_id: string;
  moved: true;
  kept_in_wishlist: boolean;
}

export interface MergeResult {
  merged_count: number;
  skipped_duplicates: number;
  dropped_unpublished: number;
  skipped_over_cap: number;
  total: number;
}

export interface MergeItem {
  product_id: string;
  preferred_variant_id?: string | null;
}

/**
 * Wishlist core (FR-WISH-001–040). A single server-persisted wishlist per customer (BR-WISH-1), created
 * lazily on first add/merge. Adds are idempotent set-semantics (dedupe by product + preferred variant)
 * and cap-bounded (default 100, FR-WISH-005). View resolves **live** price/on-sale/availability from
 * CAT/INV via ports — never cached on the item (BR-WISH-2); out-of-stock and archived items are kept
 * (FR-WISH-011/012). Move-to-cart resolves a concrete in-stock variant then hands it to CART, keeping
 * the item by default (BR-WISH-7). Merge folds a guest payload in (dedupe, drop-unpublished, honor cap).
 */
@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(WishlistOrmEntity)
    private readonly wishlists: Repository<WishlistOrmEntity>,
    @InjectRepository(WishlistItemOrmEntity)
    private readonly items: Repository<WishlistItemOrmEntity>,
    @Inject(CATALOG_READER) private readonly catalog: ICatalogReader,
    @Inject(STOCK_CHECKER) private readonly stock: IStockChecker,
    @Inject(CART_ADDER) private readonly cart: ICartAdder,
  ) {}

  // ---------------------------------------------------------------------------
  // Add (FR-WISH-001/002/005/006)
  // ---------------------------------------------------------------------------

  async addItem(
    customerId: string,
    productId: string,
    preferredVariantId: string | null,
  ): Promise<{ result: AddItemResult; created: boolean }> {
    const cards = await this.catalog.getProductCards([productId]);
    const card = cards.get(productId);
    if (!card || !card.available) {
      throw new NotFoundException({
        code: 'PRODUCT_NOT_FOUND',
        message: 'Product not found or not published.',
      });
    }

    if (preferredVariantId) {
      const variant = await this.catalog.getVariant(preferredVariantId);
      if (!variant || variant.product_id !== productId || !variant.sellable) {
        throw new BadRequestException({
          code: 'INVALID_VARIANT',
          message: 'The selected variant does not belong to this product or is disabled.',
        });
      }
    }

    const wishlist = await this.ensureWishlist(customerId);

    const existing = await this.items.findOne({
      where: {
        wishlistId: wishlist.id,
        productId,
        preferredVariantId: preferredVariantId ?? IsNull(),
      },
    });
    if (existing) {
      // Idempotent set semantics (FR-WISH-002, §12.1/§12.8) — no duplicate, signal already present.
      return { result: { item_id: existing.id, already_present: true }, created: false };
    }

    const count = await this.items.count({ where: { wishlistId: wishlist.id } });
    if (count >= MAX_WISHLIST_ITEMS) {
      throw new ConflictException({ code: 'WISHLIST_FULL', max_items: MAX_WISHLIST_ITEMS });
    }

    const saved = await this.items.save(
      this.items.create({ wishlistId: wishlist.id, productId, preferredVariantId: preferredVariantId ?? null }),
    );
    return { result: { item_id: saved.id, already_present: false }, created: true };
  }

  // ---------------------------------------------------------------------------
  // Remove / clear (FR-WISH-003/004)
  // ---------------------------------------------------------------------------

  async removeItem(customerId: string, itemId: string): Promise<void> {
    const wishlist = await this.findWishlist(customerId);
    const line = wishlist
      ? await this.items.findOne({ where: { id: itemId, wishlistId: wishlist.id } })
      : null;
    if (!line) throw this.itemNotFound(itemId);
    await this.items.remove(line);
  }

  async clear(customerId: string): Promise<void> {
    const wishlist = await this.findWishlist(customerId);
    if (!wishlist) return; // nothing to clear
    await this.items.delete({ wishlistId: wishlist.id });
  }

  // ---------------------------------------------------------------------------
  // View (FR-WISH-010–013, BR-WISH-2)
  // ---------------------------------------------------------------------------

  async getWishlist(customerId: string): Promise<WishlistView> {
    const wishlist = await this.findWishlist(customerId);
    if (!wishlist) return { items: [], total: 0, max_items: MAX_WISHLIST_ITEMS };

    const rows = await this.items.find({
      where: { wishlistId: wishlist.id },
      order: { addedAt: 'DESC' }, // most-recently-added first (FR-WISH-013)
    });
    if (rows.length === 0) return { items: [], total: 0, max_items: MAX_WISHLIST_ITEMS };

    const cards = await this.catalog.getProductCards(rows.map((r) => r.productId));

    // Resolve preferred variants (bounded by item count) for sku/options + validity.
    const preferredVariantIds = Array.from(
      new Set(rows.map((r) => r.preferredVariantId).filter((id): id is string => !!id)),
    );
    const variantViews = new Map<string, WishlistVariant>();
    await Promise.all(
      preferredVariantIds.map(async (id) => {
        const v = await this.catalog.getVariant(id);
        if (v) variantViews.set(id, v);
      }),
    );

    // Collect the variant ids whose live stock we need (preferred-when-valid, else product-level).
    const stockIds = new Set<string>();
    for (const row of rows) {
      const card = cards.get(row.productId);
      if (!card || !card.available) continue;
      const valid = this.resolvedPreferred(row, card, variantViews);
      if (valid) stockIds.add(valid.variant_id);
      else card.enabled_variant_ids.forEach((id) => stockIds.add(id));
    }
    const stockMap = await this.stock.availabilityFor([...stockIds]);

    const items = rows.map((row) => this.toItemView(row, cards, variantViews, stockMap));
    return { items, total: items.length, max_items: MAX_WISHLIST_ITEMS };
  }

  // ---------------------------------------------------------------------------
  // Move to cart (FR-WISH-020–023, BR-WISH-6/7)
  // ---------------------------------------------------------------------------

  async moveToCart(
    customerId: string,
    itemId: string,
    body: { variant_id?: string | null; quantity?: number; keep_in_wishlist?: boolean },
  ): Promise<MoveToCartResult> {
    const wishlist = await this.findWishlist(customerId);
    const line = wishlist
      ? await this.items.findOne({ where: { id: itemId, wishlistId: wishlist.id } })
      : null;
    if (!line) throw this.itemNotFound(itemId);

    const candidateId = body.variant_id ?? line.preferredVariantId;
    if (!candidateId) {
      throw new ConflictException({ code: 'VARIANT_NEEDED', message: 'Select a size to add to cart.' });
    }

    const variant = await this.catalog.getVariant(candidateId);
    if (!variant || variant.product_id !== line.productId || !variant.sellable) {
      // Preferred variant disabled/removed, or supplied id invalid → prompt for selection (§12.4).
      throw new ConflictException({ code: 'VARIANT_NEEDED', message: 'Select a size to add to cart.' });
    }

    const quantity = body.quantity ?? 1;
    const available = await this.stock.availableFor(candidateId);
    if (available < quantity) {
      // Out of stock — keep the item, surface the state (FR-WISH-022, §12.10).
      throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'This item is out of stock.' });
    }

    let added: { cart_item_id: string };
    try {
      added = await this.cart.addToCart(customerId, candidateId, quantity);
    } catch (err) {
      // The cart re-checks stock against the (possibly already-stocked) line; surface any stock
      // conflict as OUT_OF_STOCK so the contract's 409 set holds (FR-WISH-022, §12.10).
      if (err instanceof ConflictException) {
        throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'This item is out of stock.' });
      }
      throw err;
    }

    const keep = body.keep_in_wishlist ?? true; // default keep (BR-WISH-7, FR-WISH-023)
    if (!keep) await this.items.remove(line);

    return { cart_item_id: added.cart_item_id, moved: true, kept_in_wishlist: keep };
  }

  // ---------------------------------------------------------------------------
  // Membership (FR-WISH-040)
  // ---------------------------------------------------------------------------

  async membership(customerId: string, productIds: string[]): Promise<Record<string, boolean>> {
    const unique = Array.from(new Set(productIds));
    const map: Record<string, boolean> = {};
    for (const id of unique) map[id] = false;
    if (unique.length === 0) return map;

    const wishlist = await this.findWishlist(customerId);
    if (!wishlist) return map;

    // Single indexed query (no live price/stock resolution) — §14 < 150ms p95 budget.
    const rows = await this.items.find({
      where: { wishlistId: wishlist.id, productId: In(unique) },
      select: { productId: true },
    });
    for (const row of rows) map[row.productId] = true;
    return map;
  }

  // ---------------------------------------------------------------------------
  // Merge guest → account (FR-WISH-031/032/033, BR-WISH-5)
  // ---------------------------------------------------------------------------

  async merge(customerId: string, input: MergeItem[]): Promise<MergeResult> {
    const result: MergeResult = {
      merged_count: 0,
      skipped_duplicates: 0,
      dropped_unpublished: 0,
      skipped_over_cap: 0,
      total: input.length,
    };
    if (input.length === 0) return result;

    const wishlist = await this.ensureWishlist(customerId);

    const cards = await this.catalog.getProductCards(input.map((i) => i.product_id));

    // Seed the "already present" set from the current wishlist so replay is idempotent (de-dupes too).
    const existing = await this.items.find({
      where: { wishlistId: wishlist.id },
      select: { productId: true, preferredVariantId: true },
    });
    const seen = new Set(existing.map((e) => this.key(e.productId, e.preferredVariantId)));
    let count = existing.length;

    for (const entry of input) {
      const card = cards.get(entry.product_id);
      if (!card || !card.available) {
        result.dropped_unpublished += 1; // unpublished/archived/missing (FR-WISH-032, §12.11)
        continue;
      }
      const variantId = entry.preferred_variant_id ?? null;
      const key = this.key(entry.product_id, variantId);
      if (seen.has(key)) {
        result.skipped_duplicates += 1; // already present or duplicated in payload (FR-WISH-031)
        continue;
      }
      if (count >= MAX_WISHLIST_ITEMS) {
        result.skipped_over_cap += 1; // honor the cap (FR-WISH-005, §12.5)
        continue;
      }
      await this.items.save(
        this.items.create({ wishlistId: wishlist.id, productId: entry.product_id, preferredVariantId: variantId }),
      );
      seen.add(key);
      count += 1;
      result.merged_count += 1;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async ensureWishlist(customerId: string): Promise<WishlistOrmEntity> {
    const existing = await this.findWishlist(customerId);
    if (existing) return existing;
    return this.wishlists.save(this.wishlists.create({ customerId }));
  }

  private findWishlist(customerId: string): Promise<WishlistOrmEntity | null> {
    return this.wishlists.findOne({ where: { customerId } });
  }

  /** The resolved preferred variant for a row when it's still valid (exists, belongs, enabled); else null. */
  private resolvedPreferred(
    row: WishlistItemOrmEntity,
    card: WishlistProductCard,
    variantViews: Map<string, WishlistVariant>,
  ): WishlistVariant | null {
    if (!row.preferredVariantId) return null;
    const variant = variantViews.get(row.preferredVariantId);
    if (!variant || variant.product_id !== card.id || !variant.sellable) return null;
    return variant;
  }

  private toItemView(
    row: WishlistItemOrmEntity,
    cards: Map<string, WishlistProductCard>,
    variantViews: Map<string, WishlistVariant>,
    stockMap: Map<string, { status: 'in_stock' | 'low_stock' | 'out_of_stock' }>,
  ): WishlistItemView {
    const card = cards.get(row.productId);
    const rawVariant = row.preferredVariantId ? variantViews.get(row.preferredVariantId) ?? null : null;

    // Product card (live). A truly-missing product row (hard delete — unexpected) degrades to unavailable.
    const product: WishlistItemView['product'] = card
      ? {
          id: card.id,
          slug: card.slug,
          title: card.title,
          brand: card.brand,
          primary_image: card.primary_image,
          effective_price: card.effective_price,
          base_price: card.base_price,
          on_sale: card.on_sale,
          currency: 'BDT',
        }
      : {
          id: row.productId,
          slug: '',
          title: '',
          brand: null,
          primary_image: null,
          effective_price: '0.00',
          base_price: '0.00',
          on_sale: false,
          currency: 'BDT',
        };

    let availability: WishlistAvailability;
    let preferredVariant: WishlistItemView['preferred_variant'] = null;

    if (!card || !card.available) {
      // Archived/soft-deleted/unpublished → kept, flagged unavailable (FR-WISH-012, §12.3).
      availability = 'unavailable';
      // Show the stale variant label if the row still exists (display only).
      preferredVariant = rawVariant
        ? { id: rawVariant.variant_id, sku_code: rawVariant.sku_code, options: rawVariant.options }
        : null;
    } else {
      const valid = this.resolvedPreferred(row, card, variantViews);
      if (valid) {
        const status = stockMap.get(valid.variant_id)?.status ?? 'out_of_stock';
        availability = status === 'out_of_stock' ? 'out_of_stock' : 'in_stock';
        preferredVariant = { id: valid.variant_id, sku_code: valid.sku_code, options: valid.options };
      } else {
        // No preferred variant, or it was disabled/removed (§12.4) → product-level availability; prompt size.
        availability = this.productLevelAvailability(card, stockMap);
        preferredVariant = null;
      }
    }

    return {
      item_id: row.id,
      product,
      preferred_variant: preferredVariant,
      availability,
      is_available: availability === 'in_stock',
      added_at: row.addedAt.toISOString(),
    };
  }

  private productLevelAvailability(
    card: WishlistProductCard,
    stockMap: Map<string, { status: 'in_stock' | 'low_stock' | 'out_of_stock' }>,
  ): WishlistAvailability {
    const anyInStock = card.enabled_variant_ids.some(
      (id) => (stockMap.get(id)?.status ?? 'out_of_stock') !== 'out_of_stock',
    );
    return anyInStock ? 'in_stock' : 'out_of_stock';
  }

  private key(productId: string, variantId: string | null): string {
    return `${productId}|${variantId ?? ''}`;
  }

  private itemNotFound(itemId: string): NotFoundException {
    return new NotFoundException({
      code: 'WISHLIST_ITEM_NOT_FOUND',
      message: `Wishlist item ${itemId} not found.`,
    });
  }
}
