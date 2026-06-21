import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Paginated } from '../../../../shared/dto/paginated';
import {
  IProductSnapshotReader,
  PRODUCT_SNAPSHOT_READER,
} from '../ports/product-snapshot.port';
import { PaymentPurpose } from '../../../payments/domain/payment-enums';
import { PaymentOrmEntity } from '../../../payments/infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { OrderPaymentState, OrderStatus } from '../../domain/order-enums';
import { OrderItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import { AdminOrderRowDto } from '../../presentation/dto/admin-orders.dto';
import {
  GuestHistoryEntryDto,
  GuestTrackResultDto,
  OrderDetailDto,
  OrderHistoryEntryDto,
  OrderSummaryDto,
} from '../../presentation/dto/tracking.dto';

/** Filters for the admin order list/search (FR-ORD-070). All optional; combined with AND. */
export interface AdminOrderFilters {
  status?: OrderStatus;
  paymentState?: OrderPaymentState;
  q?: string;
  phone?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** An order plus its line items and full status history — the read aggregate for detail + invoice. */
export interface OrderReadAggregate {
  order: OrderOrmEntity;
  items: OrderItemOrmEntity[];
  history: OrderStatusHistoryOrmEntity[];
}

/**
 * Customer + guest read surface (ord-tracking-be; FR-ORD-060, 061, 062). Owns the own-order history /
 * detail reads (customer token) and the public, rate-limited guest tracking lookup (order_no + phone).
 * All reads are over the immutable order snapshot — no recomputation. Guest exposure is minimal (status,
 * shipment, history) and a mismatch returns a generic `404` to prevent order-number enumeration (§12.13).
 * The detail/invoice read aggregate (order + items + history) is shared with {@link InvoiceService}.
 */
@Injectable()
export class OrderTrackingService {
  constructor(
    @InjectRepository(OrderOrmEntity) private readonly orders: Repository<OrderOrmEntity>,
    @InjectRepository(OrderItemOrmEntity) private readonly items: Repository<OrderItemOrmEntity>,
    @InjectRepository(OrderStatusHistoryOrmEntity)
    private readonly history: Repository<OrderStatusHistoryOrmEntity>,
    // PAY read-surface for the admin order-detail payment panel: resolve the order's payment id
    // (read-only; decoupled from PAY's services — same pattern as the CAT product-snapshot read).
    @InjectRepository(PaymentOrmEntity)
    private readonly payments: Repository<PaymentOrmEntity>,
    @Inject(PRODUCT_SNAPSHOT_READER)
    private readonly productSnapshots: IProductSnapshotReader,
  ) {}

  /** The order-purpose payment id for an order (latest attempt), or null — for the admin payment panel. */
  private async findOrderPaymentId(orderId: string): Promise<string | null> {
    const payment = await this.payments.findOne({
      where: { orderId, purpose: PaymentPurpose.ORDER },
      order: { createdAt: 'DESC' },
      select: { id: true },
    });
    return payment?.id ?? null;
  }

  // ---------------------------------------------------------------------------
  // Customer — history (FR-ORD-060)
  // ---------------------------------------------------------------------------

  /** Paginated, newest-first summary of the customer's own orders. */
  async getCustomerHistory(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<OrderSummaryDto>> {
    const [rows, total] = await this.orders.findAndCount({
      where: { customerId },
      relations: { items: true },
      order: { placedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    const summaries = rows.map((order) => this.toSummary(order));
    return new Paginated(summaries, { page, limit, total });
  }

  // ---------------------------------------------------------------------------
  // Admin — list / search (FR-ORD-070)
  // ---------------------------------------------------------------------------

  /**
   * Paginated, newest-first admin order list with optional status / payment-state / order-no / phone /
   * placed-at-range filters (contract: Admin — List/search orders). The buyer name + phone come from the
   * order snapshot (guest fields, else the address recipient), so the read stays within the order
   * aggregate — no AUTH call. A date-only `to` is treated as inclusive of the whole day.
   */
  async listAdminOrders(filters: AdminOrderFilters): Promise<Paginated<AdminOrderRowDto>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const qb = this.orders
      .createQueryBuilder('o')
      .orderBy('o.placedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.status) qb.andWhere('o.status = :status', { status: filters.status });
    if (filters.paymentState)
      qb.andWhere('o.paymentState = :paymentState', { paymentState: filters.paymentState });
    if (filters.q) qb.andWhere('o.orderNo ILIKE :q', { q: `%${filters.q}%` });
    if (filters.phone) {
      qb.andWhere(
        "(o.guestPhone ILIKE :phone OR o.address_snapshot->>'recipient_phone' ILIKE :phone)",
        { phone: `%${filters.phone}%` },
      );
    }
    if (filters.from) qb.andWhere('o.placedAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('o.placedAt <= :to', { to: this.endOfDay(filters.to) });

    const [rows, total] = await qb.getManyAndCount();
    return new Paginated(rows.map((o) => this.toAdminRow(o)), { page, limit, total });
  }

  // ---------------------------------------------------------------------------
  // Customer — detail (FR-ORD-060, 071)
  // ---------------------------------------------------------------------------

  /** Full detail of a customer's own order; a non-owned/unknown order is a generic `404`. */
  async getCustomerOrderDetail(customerId: string, orderNo: string): Promise<OrderDetailDto> {
    const aggregate = await this.loadOwnOrder(customerId, orderNo);
    return this.toDetail(aggregate);
  }

  // ---------------------------------------------------------------------------
  // Guest — tracking (FR-ORD-061, 062)
  // ---------------------------------------------------------------------------

  /**
   * Look up an order by `order_no` + `phone` and return only status + shipment + history. The phone must
   * match either the guest phone or the recipient phone on the order; any mismatch (or unknown order) is a
   * generic `404` so order numbers can't be enumerated (rate-limiting is enforced at the controller).
   */
  async trackGuest(orderNo: string, phone: string): Promise<GuestTrackResultDto> {
    const order = await this.orders.findOne({ where: { orderNo } });
    if (!order || !this.phoneMatches(order, phone)) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'No matching order found.' });
    }
    const history = await this.history.find({
      where: { orderId: order.id },
      order: { createdAt: 'ASC' },
    });
    const entries: GuestHistoryEntryDto[] = history.map((h) => ({
      to_status: h.toStatus,
      created_at: h.createdAt.toISOString(),
    }));
    return {
      order_no: order.orderNo,
      status: order.status,
      placed_at: order.placedAt.toISOString(),
      shipment: { courier_name: order.courierName, tracking_number: order.trackingNumber },
      history: entries,
    };
  }

  // ---------------------------------------------------------------------------
  // Shared read aggregate (used by detail + invoice)
  // ---------------------------------------------------------------------------

  /** Load a customer's own order with items + history, or throw a generic `404`. */
  async loadOwnOrder(customerId: string, orderNo: string): Promise<OrderReadAggregate> {
    const order = await this.orders.findOne({ where: { orderNo }, relations: { items: true } });
    if (!order || order.customerId !== customerId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });
    }
    return this.attachHistory(order);
  }

  /** Load any order with items + history (admin context — no ownership check), or throw `404`. */
  async loadOrder(orderNo: string): Promise<OrderReadAggregate> {
    const order = await this.orders.findOne({ where: { orderNo }, relations: { items: true } });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });
    }
    return this.attachHistory(order);
  }

  // ---------------------------------------------------------------------------
  // Mappers / helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the full customer/admin detail DTO from a read aggregate. Enriches each line with the
   * current product's listing thumbnail + Bangla title (RW6, read-time CAT lookup — null when gone).
   */
  async toDetail({ order, items, history }: OrderReadAggregate): Promise<OrderDetailDto> {
    const [snapshots, paymentId] = await Promise.all([
      this.productSnapshots.getByProductIds(items.map((it) => it.productId)),
      this.findOrderPaymentId(order.id),
    ]);
    return {
      order_no: order.orderNo,
      status: order.status,
      placed_at: order.placedAt.toISOString(),
      payment_method: order.paymentMethod,
      payment_state: order.paymentState,
      payment_id: paymentId,
      delivery_zone: order.deliveryZone,
      address: {
        recipient_name: order.addressSnapshot.recipient_name,
        recipient_phone: order.addressSnapshot.recipient_phone,
        address_line: order.addressSnapshot.address_line,
        area: order.addressSnapshot.area ?? null,
        district: order.addressSnapshot.district ?? null,
        division: order.addressSnapshot.division ?? null,
        postal_code: order.addressSnapshot.postal_code ?? null,
      },
      items: items.map((it) => {
        const snap = snapshots.get(it.productId);
        return {
          product_title: it.productTitle,
          product_title_bn: snap?.product_title_bn ?? null,
          product_image: snap?.product_image ?? null,
          sku_code: it.skuCode,
          variant_options: it.variantOptions ?? {},
          unit_price: it.unitPrice,
          quantity: it.quantity,
          line_total: it.lineTotal,
        };
      }),
      amounts: {
        subtotal: order.subtotal,
        discount: order.discountAmount,
        delivery_charge: order.deliveryCharge,
        cod_surcharge: order.codSurcharge,
        vat: order.vatAmount,
        grand_total: order.grandTotal,
      },
      applied_coupon_code: order.appliedCouponCode,
      shipment: { courier_name: order.courierName, tracking_number: order.trackingNumber },
      history: history.map(
        (h): OrderHistoryEntryDto => ({
          from_status: h.fromStatus,
          to_status: h.toStatus,
          actor_type: h.actorType,
          note: h.note,
          created_at: h.createdAt.toISOString(),
        }),
      ),
    };
  }

  private async attachHistory(order: OrderOrmEntity): Promise<OrderReadAggregate> {
    const history = await this.history.find({
      where: { orderId: order.id },
      order: { createdAt: 'ASC' },
    });
    return { order, items: order.items ?? [], history };
  }

  private toSummary(order: OrderOrmEntity): OrderSummaryDto {
    const itemCount = (order.items ?? []).reduce((sum, it) => sum + it.quantity, 0);
    return {
      order_no: order.orderNo,
      placed_at: order.placedAt.toISOString(),
      status: order.status,
      payment_method: order.paymentMethod,
      payment_state: order.paymentState,
      grand_total: order.grandTotal,
      item_count: itemCount,
    };
  }

  private toAdminRow(order: OrderOrmEntity): AdminOrderRowDto {
    return {
      order_no: order.orderNo,
      customer: {
        name: order.guestName ?? order.addressSnapshot?.recipient_name ?? '',
        phone: order.guestPhone ?? order.addressSnapshot?.recipient_phone ?? '',
      },
      status: order.status,
      payment_method: order.paymentMethod,
      payment_state: order.paymentState,
      grand_total: order.grandTotal,
      placed_at: order.placedAt.toISOString(),
    };
  }

  /** Make a date-only `to` bound (YYYY-MM-DD) inclusive of the whole day; pass through full timestamps. */
  private endOfDay(to: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(to) ? `${to}T23:59:59.999Z` : to;
  }

  /** True when `phone` matches the order's guest phone or recipient phone (normalised, digits only). */
  private phoneMatches(order: OrderOrmEntity, phone: string): boolean {
    const candidate = this.normalisePhone(phone);
    const onOrder = [order.guestPhone, order.addressSnapshot?.recipient_phone]
      .filter((p): p is string => !!p)
      .map((p) => this.normalisePhone(p));
    return onOrder.includes(candidate);
  }

  private normalisePhone(phone: string): string {
    // Compare by trailing local digits so +8801..., 8801..., 01... all match.
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-10);
  }
}
