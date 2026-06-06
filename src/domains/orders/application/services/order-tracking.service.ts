import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Paginated } from '../../../../shared/dto/paginated';
import { OrderItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import {
  GuestHistoryEntryDto,
  GuestTrackResultDto,
  OrderDetailDto,
  OrderHistoryEntryDto,
  OrderSummaryDto,
} from '../../presentation/dto/tracking.dto';

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
  ) {}

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

  /** Build the full customer/admin detail DTO from a read aggregate. */
  toDetail({ order, items, history }: OrderReadAggregate): OrderDetailDto {
    return {
      order_no: order.orderNo,
      status: order.status,
      payment_method: order.paymentMethod,
      payment_state: order.paymentState,
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
      items: items.map((it) => ({
        product_title: it.productTitle,
        sku_code: it.skuCode,
        variant_options: it.variantOptions ?? {},
        unit_price: it.unitPrice,
        quantity: it.quantity,
        line_total: it.lineTotal,
      })),
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
