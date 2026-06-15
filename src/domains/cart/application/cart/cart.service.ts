import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CartStatus } from '../../domain/enums/cart-status.enum';
import { CartItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/cart-item.orm-entity';
import { CartOrmEntity } from '../../infrastructure/persistence/typeorm/entities/cart.orm-entity';
import {
  COUPON_VALIDATOR,
  ICouponValidator,
} from '../checkout/checkout.ports';
import { CATALOG_READER, ICatalogReader } from '../ports/catalog-reader.port';
import { IStockChecker, STOCK_CHECKER } from '../ports/stock-checker.port';
import { MAX_DISTINCT_LINES, MAX_QTY_PER_LINE } from './cart.constants';

/** How a request identifies its cart (customer token wins; else guest token). */
export interface CartActor {
  customerId?: string | null;
  cartToken?: string | null;
}

export interface AddItemResult {
  item_id: string;
  quantity: number;
  capped: boolean;
  cart_token?: string | null;
}

export interface CartLineView {
  item_id: string;
  product_id: string;
  variant_id: string;
  sku_code: string;
  title: string;
  options: Record<string, string>;
  image: string | null;
  unit_price: string;
  quantity: number;
  line_total: string;
  availability: 'in_stock' | 'low_stock' | 'out_of_stock';
}

export interface CartView {
  cart_id: string;
  cart_token: string | null;
  currency: 'BDT';
  items: CartLineView[];
  applied_coupon: { code: string; discount: string } | null;
  summary: {
    subtotal: string;
    discount: string;
    delivery_charge: string;
    cod_surcharge: string;
    vat: string;
    grand_total: string;
    delivery_zone: string | null;
  };
}

export interface MergeResult {
  merged_lines: number;
  capped_lines: number;
  summary: CartView['summary'];
}

/**
 * Cart core (FR-CART-001–009) — the write+read aggregate of the shopper's cart. Owned by a customer
 * (one `active` cart) or a guest (`cart_token`, minted on first write). Add increments an existing line;
 * add/update run a live INV re-check and **cap** at `available`; variant validity is enforced via CAT
 * (`400` for disabled/unpublished/archived). Per-line (10) and distinct-line (50) limits apply. Prices
 * are **never stored** — read live from CAT and the subtotal recomputes on every view (BR-CART-1). Merge
 * folds a guest cart into the customer cart (sum + cap), idempotently.
 */
@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartOrmEntity) private readonly carts: Repository<CartOrmEntity>,
    @InjectRepository(CartItemOrmEntity) private readonly items: Repository<CartItemOrmEntity>,
    @Inject(CATALOG_READER) private readonly catalog: ICatalogReader,
    @Inject(STOCK_CHECKER) private readonly stock: IStockChecker,
    @Inject(COUPON_VALIDATOR) private readonly coupons: ICouponValidator,
  ) {}

  // ---------------------------------------------------------------------------
  // Cart resolution (FR-CART-006)
  // ---------------------------------------------------------------------------

  /** Resolve the acting cart for a read; null when none exists yet (no minting on read). */
  private async resolveExisting(actor: CartActor): Promise<CartOrmEntity | null> {
    if (actor.customerId) {
      return this.carts.findOne({
        where: { customerId: actor.customerId, status: CartStatus.ACTIVE },
      });
    }
    if (actor.cartToken) {
      return this.carts.findOne({ where: { cartToken: actor.cartToken, status: CartStatus.ACTIVE } });
    }
    return null;
  }

  /** Resolve the acting cart for a write, creating it (and a guest token) on first use. */
  private async resolveOrCreate(actor: CartActor): Promise<CartOrmEntity> {
    const existing = await this.resolveExisting(actor);
    if (existing) return existing;

    if (actor.customerId) {
      return this.carts.save(
        this.carts.create({ customerId: actor.customerId, status: CartStatus.ACTIVE }),
      );
    }
    // Guest: mint a new cart + token. Always mint a FRESH token here — reaching this
    // branch means there is no ACTIVE cart for the supplied token, but a non-active
    // (e.g. CONVERTED after checkout/merge) cart may still hold it. Reusing the token
    // would collide with the unique `cart_token` index and surface as a 500. The FE
    // persists the new token from the `X-Cart-Token` response header.
    const cartToken = `guesttok_${randomUUID().replace(/-/g, '')}`;
    return this.carts.save(this.carts.create({ cartToken, status: CartStatus.ACTIVE }));
  }

  // ---------------------------------------------------------------------------
  // Add (FR-CART-001/003/004/009)
  // ---------------------------------------------------------------------------

  async addItem(actor: CartActor, variantId: string, quantity: number): Promise<AddItemResult> {
    if (quantity < 1) {
      throw new BadRequestException({ code: 'INVALID_QUANTITY', message: 'quantity must be ≥ 1.' });
    }
    const variant = await this.catalog.getVariant(variantId);
    if (!variant || !variant.sellable) {
      throw new BadRequestException({
        code: 'VARIANT_NOT_SELLABLE',
        message: 'This item is not available.',
      });
    }

    const cart = await this.resolveOrCreate(actor);
    const existing = await this.items.findOne({ where: { cartId: cart.id, variantId } });

    if (!existing) {
      // New distinct line — enforce the distinct-line cap.
      const lineCount = await this.items.count({ where: { cartId: cart.id } });
      if (lineCount >= MAX_DISTINCT_LINES) {
        throw new BadRequestException({
          code: 'CART_LINE_LIMIT',
          message: `A cart may hold at most ${MAX_DISTINCT_LINES} distinct items.`,
        });
      }
    }

    const desired = (existing?.quantity ?? 0) + quantity;
    const { finalQty, capped } = await this.capQuantity(variantId, desired);

    const line = existing ?? this.items.create({ cartId: cart.id, productId: variant.product_id, variantId });
    line.productId = variant.product_id;
    line.quantity = finalQty;
    const saved = await this.items.save(line);

    return {
      item_id: saved.id,
      quantity: saved.quantity,
      capped,
      cart_token: cart.cartToken,
    };
  }

  // ---------------------------------------------------------------------------
  // Update / remove (FR-CART-002/003/009)
  // ---------------------------------------------------------------------------

  async updateItem(
    actor: CartActor,
    itemId: string,
    quantity: number,
  ): Promise<{ removed: true } | { line: CartLineView; capped: boolean; summary: CartView['summary'] }> {
    const cart = await this.requireCart(actor);
    const line = await this.items.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!line) throw this.itemNotFound(itemId);

    if (quantity <= 0) {
      await this.items.remove(line);
      return { removed: true as const };
    }

    const { finalQty, capped } = await this.capQuantity(line.variantId, quantity);
    line.quantity = finalQty;
    await this.items.save(line);

    const view = await this.buildView(cart);
    const lineView = view.items.find((i) => i.item_id === line.id);
    if (!lineView) throw this.itemNotFound(itemId);
    return { line: lineView, capped, summary: view.summary };
  }

  async removeItem(actor: CartActor, itemId: string): Promise<void> {
    const cart = await this.requireCart(actor);
    const line = await this.items.findOne({ where: { id: itemId, cartId: cart.id } });
    if (!line) throw this.itemNotFound(itemId);
    await this.items.remove(line);
  }

  async clear(actor: CartActor): Promise<void> {
    const cart = await this.resolveExisting(actor);
    if (!cart) return; // nothing to clear
    await this.items.delete({ cartId: cart.id });
  }

  // ---------------------------------------------------------------------------
  // View (FR-CART-005/010)
  // ---------------------------------------------------------------------------

  async getCart(actor: CartActor): Promise<CartView> {
    const cart = await this.resolveExisting(actor);
    if (!cart) {
      return this.emptyView(null, null);
    }
    return this.buildView(cart);
  }

  // ---------------------------------------------------------------------------
  // Merge guest → customer (FR-CART-007, §12.8)
  // ---------------------------------------------------------------------------

  async merge(actor: CartActor, guestToken: string): Promise<MergeResult> {
    if (!actor.customerId) {
      throw new BadRequestException({
        code: 'CUSTOMER_REQUIRED',
        message: 'Merge requires an authenticated customer.',
      });
    }
    const customerCart = await this.resolveOrCreate({ customerId: actor.customerId });
    const guestCart = await this.carts.findOne({
      where: { cartToken: guestToken, status: CartStatus.ACTIVE },
    });

    // Idempotent: an unknown/already-converted/empty token is a no-op.
    if (!guestCart || guestCart.id === customerCart.id) {
      const view = await this.buildView(customerCart);
      return { merged_lines: 0, capped_lines: 0, summary: view.summary };
    }

    const guestItems = await this.items.find({ where: { cartId: guestCart.id } });
    let mergedLines = 0;
    let cappedLines = 0;

    for (const gi of guestItems) {
      const existing = await this.items.findOne({
        where: { cartId: customerCart.id, variantId: gi.variantId },
      });
      const desired = (existing?.quantity ?? 0) + gi.quantity;
      const { finalQty, capped } = await this.capQuantity(gi.variantId, desired);
      if (finalQty <= 0) continue;

      const line =
        existing ?? this.items.create({ cartId: customerCart.id, productId: gi.productId, variantId: gi.variantId });
      line.quantity = finalQty;
      await this.items.save(line);
      mergedLines += 1;
      if (capped) cappedLines += 1;
    }

    // Mark the source guest cart converted + clear its lines (so a repeat merge is a no-op).
    guestCart.status = CartStatus.CONVERTED;
    await this.carts.save(guestCart);
    await this.items.delete({ cartId: guestCart.id });

    const view = await this.buildView(customerCart);
    return { merged_lines: mergedLines, capped_lines: cappedLines, summary: view.summary };
  }

  // ---------------------------------------------------------------------------
  // Checkout support (consumed in-process by CheckoutService)
  // ---------------------------------------------------------------------------

  /** Resolve the acting cart entity (no minting). Used by checkout to read the cart for placement. */
  async getActiveCart(actor: CartActor): Promise<CartOrmEntity | null> {
    return this.resolveExisting(actor);
  }

  /** Mark a cart converted + clear its lines after a successful placement (FR-CART-037). */
  async markConverted(cartId: string): Promise<void> {
    await this.carts.update({ id: cartId }, { status: CartStatus.CONVERTED });
    await this.items.delete({ cartId });
  }

  // ---------------------------------------------------------------------------
  // Coupon apply / remove (FR-CART-020/021/023) — validated via the real PROMO engine
  // ---------------------------------------------------------------------------

  async applyCoupon(
    actor: CartActor,
    code: string,
  ): Promise<{ applied: true; code: string; discount: string; summary: CartView['summary'] }> {
    const cart = await this.resolveOrCreate(actor);
    const normalized = code.trim().toUpperCase();

    // One coupon per order — a different applied code blocks a second apply (FR-CART-023, BR-CART-5).
    if (cart.appliedCouponCode && cart.appliedCouponCode !== normalized) {
      throw new ConflictException({
        code: 'COUPON_ALREADY_APPLIED',
        message: 'A coupon is already applied. Remove it before applying another.',
      });
    }

    const view = await this.buildView(cart);
    const verdict = await this.coupons.validate({
      code: normalized,
      identity: { customer_id: cart.customerId, guest_phone: null },
      lines: view.items.map((i) => ({
        product_id: i.product_id,
        category_id: null,
        quantity: i.quantity,
        effective_unit_price: i.unit_price,
      })),
      subtotal: view.summary.subtotal,
    });

    if (!verdict.valid) {
      throw new UnprocessableEntityException({ code: 'COUPON_INVALID', reason: verdict.reason });
    }

    cart.appliedCouponCode = normalized;
    await this.carts.save(cart);

    const summary = this.applyDiscountToSummary(view.summary, verdict.discount_amount, normalized);
    return { applied: true as const, code: normalized, discount: verdict.discount_amount, summary };
  }

  async removeCoupon(actor: CartActor): Promise<{ summary: CartView['summary'] }> {
    const cart = await this.resolveExisting(actor);
    if (cart && cart.appliedCouponCode) {
      cart.appliedCouponCode = null;
      await this.carts.save(cart);
    }
    const view = cart ? await this.buildView(cart) : this.emptyView(null, null);
    return { summary: view.summary };
  }

  /** Reflect a live-computed discount in a cart summary (discount never persisted as an amount). */
  private applyDiscountToSummary(
    summary: CartView['summary'],
    discount: string,
    _code: string,
  ): CartView['summary'] {
    const subtotalPaisa = Math.round(Number(summary.subtotal) * 100);
    const discountPaisa = Math.min(Math.round(Number(discount) * 100), subtotalPaisa);
    return {
      ...summary,
      discount: (discountPaisa / 100).toFixed(2),
      // delivery/cod/vat finalize at checkout; grand_total here reflects subtotal − discount only.
      grand_total: ((subtotalPaisa - discountPaisa) / 100).toFixed(2),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Cap a desired quantity at available stock + the per-line max; raise INSUFFICIENT_STOCK when over. */
  private async capQuantity(
    variantId: string,
    desired: number,
  ): Promise<{ finalQty: number; capped: boolean }> {
    if (desired > MAX_QTY_PER_LINE) {
      throw new BadRequestException({
        code: 'LINE_QTY_LIMIT',
        message: `At most ${MAX_QTY_PER_LINE} of an item per cart.`,
      });
    }
    const available = await this.stock.availableFor(variantId);
    if (desired > available) {
      // Cap at available and signal the shortfall (contract: 409 INSUFFICIENT_STOCK { available }).
      throw new ConflictException({ code: 'INSUFFICIENT_STOCK', available });
    }
    return { finalQty: desired, capped: false };
  }

  private async buildView(cart: CartOrmEntity): Promise<CartView> {
    const lines = await this.items.find({ where: { cartId: cart.id }, order: { addedAt: 'ASC' } });
    if (lines.length === 0) return this.emptyView(cart.id, cart.cartToken);

    const variantIds = lines.map((l) => l.variantId);
    const stockMap = await this.stock.availabilityFor(variantIds);

    const items: CartLineView[] = [];
    let subtotalPaisa = 0;
    for (const line of lines) {
      const variant = await this.catalog.getVariant(line.variantId);
      const unitPrice = variant?.effective_unit_price ?? '0.00';
      const linePaisa = Math.round(Number(unitPrice) * 100) * line.quantity;
      subtotalPaisa += linePaisa;

      const stock = stockMap.get(line.variantId);
      const availability: CartLineView['availability'] =
        !variant || !variant.sellable ? 'out_of_stock' : stock?.status ?? 'out_of_stock';

      items.push({
        item_id: line.id,
        product_id: line.productId,
        variant_id: line.variantId,
        sku_code: variant?.sku_code ?? '',
        title: variant?.title ?? '',
        options: variant?.options ?? {},
        image: variant?.image ?? null,
        unit_price: unitPrice,
        quantity: line.quantity,
        line_total: (linePaisa / 100).toFixed(2),
        availability,
      });
    }

    const subtotal = (subtotalPaisa / 100).toFixed(2);
    return {
      cart_id: cart.id,
      cart_token: cart.cartToken,
      currency: 'BDT',
      items,
      // Coupon + checkout-only summary fields finalize at checkout; placeholders here (BR-CART note).
      applied_coupon: null,
      summary: {
        subtotal,
        discount: '0.00',
        delivery_charge: '0.00',
        cod_surcharge: '0.00',
        vat: '0.00',
        grand_total: subtotal,
        delivery_zone: null,
      },
    };
  }

  private emptyView(cartId: string | null, cartToken: string | null): CartView {
    return {
      cart_id: cartId ?? '',
      cart_token: cartToken,
      currency: 'BDT',
      items: [],
      applied_coupon: null,
      summary: {
        subtotal: '0.00',
        discount: '0.00',
        delivery_charge: '0.00',
        cod_surcharge: '0.00',
        vat: '0.00',
        grand_total: '0.00',
        delivery_zone: null,
      },
    };
  }

  private async requireCart(actor: CartActor): Promise<CartOrmEntity> {
    const cart = await this.resolveExisting(actor);
    if (!cart) {
      throw new NotFoundException({ code: 'CART_NOT_FOUND', message: 'No active cart.' });
    }
    return cart;
  }

  private itemNotFound(itemId: string): NotFoundException {
    return new NotFoundException({ code: 'CART_ITEM_NOT_FOUND', message: `Cart item ${itemId} not found.` });
  }
}
