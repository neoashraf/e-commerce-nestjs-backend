import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';

import { CloudinaryService } from '../../../../shared/media/cloudinary.service';
import {
  ExchangeIneligibleReason,
  ExchangeReason,
  ExchangeStatus,
  ReturnedItemDisposition,
} from '../../domain/exchange-enums';
import {
  OrderActorType,
  OrderPaymentMethod,
  OrderStatus,
} from '../../domain/order-enums';
import { ExchangeAttachmentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/exchange-attachment.orm-entity';
import { ExchangeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/exchange.orm-entity';
import { OrderItemOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-item.orm-entity';
import { OrderStatusHistoryOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order-status-history.orm-entity';
import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';
import {
  EXCHANGE_CATALOG,
  IExchangeCatalog,
  ReplacementVariant,
} from '../ports/exchange-catalog.port';
import {
  EXCHANGE_PAYMENT,
  IExchangePayment,
} from '../ports/exchange-payment.port';
import { IOrderNotifier, ORDER_NOTIFIER } from '../ports/order-notifier.port';
import {
  IStockCoordinator,
  STOCK_COORDINATOR,
} from '../ports/stock-coordinator.port';
import { checkExchangeEligibility, qaDueAt } from './exchange-eligibility';
import { OrderCreationService } from './order-creation.service';

const REPLACEMENT_HINT = 'Choose an item of equal or higher value.';
const REQUEST_MESSAGE =
  "We'll review your exchange request. Note: exchange/replacement only — no cash refund.";

export interface RequestExchangeInput {
  orderItemId: string;
  reason: ExchangeReason;
  customerNote?: string | null;
  attachmentIds?: string[];
}

export interface ConfirmReplacementResult {
  status: ExchangeStatus;
  price_difference: string;
  replacement_order_no?: string | null;
  payment?: { action: string; redirect_url?: string | null };
}

export interface IssueReplacementInput {
  replacementVariantId?: string | null;
  disposition: ReturnedItemDisposition;
}

export interface ListExchangesQuery {
  status?: ExchangeStatus;
  reason?: ExchangeReason;
  page?: number;
  limit?: number;
}

/**
 * Exchange / replacement engine (ord-exchange-be; FR-ORD-045–049, BR-ORD-8/9). Requests an exchange for a
 * delivered item with up-front eligibility (window / delivered / non-exchangeable / discount / once-per-
 * item) and QA for quality defects; the Order Manager approves/rejects; an approved request issues a
 * replacement of equal-or-higher value — the customer pays any difference via the PAY port before
 * issuance — creating a linked replacement order (reusing ord-core `OrderCreationService`), restocking
 * resellable / scrapping defective returns via the INV port, setting the original `exchanged`, and
 * notifying via NOTIF. Never returns cash (BR-ORD-8). PAY/INV/CAT are seams behind ports (stubbed until
 * wired in-process — BW5).
 */
@Injectable()
export class ExchangeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly orderCreation: OrderCreationService,
    @Inject(EXCHANGE_PAYMENT) private readonly payment: IExchangePayment,
    @Inject(EXCHANGE_CATALOG) private readonly catalog: IExchangeCatalog,
    @Inject(STOCK_COORDINATOR) private readonly stock: IStockCoordinator,
    @Inject(ORDER_NOTIFIER) private readonly notifier: IOrderNotifier,
    private readonly cloudinary: CloudinaryService,
  ) {}

  // ---------------------------------------------------------------------------
  // Attachments — FR-ORD-045 (uploaded first, linked at request time)
  // ---------------------------------------------------------------------------

  async uploadAttachment(file?: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  }): Promise<{ attachment_id: string }> {
    if (!file) {
      throw new BadRequestException({ code: 'BAD_REQUEST', message: 'An evidence file is required.' });
    }
    const repo = this.dataSource.getRepository(ExchangeAttachmentOrmEntity);
    // Store the evidence binary on Cloudinary and persist the returned HTTPS delivery URL.
    const resourceType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    const { url } = await this.cloudinary.upload({
      buffer: file.buffer,
      folder: 'exchange-evidence',
      resourceType,
    });
    const saved = await repo.save(
      repo.create({
        exchangeId: null,
        url,
        contentType: file.mimetype,
      }),
    );
    return { attachment_id: saved.id };
  }

  // ---------------------------------------------------------------------------
  // Request — FR-ORD-045/046
  // ---------------------------------------------------------------------------

  async requestExchange(
    orderNo: string,
    customerId: string,
    input: RequestExchangeInput,
    now: Date = new Date(),
  ): Promise<{ exchange_id: string; status: ExchangeStatus; message: string }> {
    const order = await this.loadCustomerOrder(orderNo, customerId);
    const itemRepo = this.dataSource.getRepository(OrderItemOrmEntity);
    const item = await itemRepo.findOne({ where: { id: input.orderItemId, orderId: order.id } });
    if (!item) {
      throw new NotFoundException({ code: 'ORDER_ITEM_NOT_FOUND', message: 'Order item not found.' });
    }

    const isDefect = input.reason === ExchangeReason.QUALITY_DEFECT;
    const attachmentIds = input.attachmentIds ?? [];
    // Quality-defect claims require photo/video evidence (FR-ORD-045, contract: 400).
    if (isDefect && attachmentIds.length === 0) {
      throw new BadRequestException({
        code: 'EVIDENCE_REQUIRED',
        message: 'Photo/video evidence is required for a quality-defect exchange.',
      });
    }

    const facts = {
      deliveredAt: await this.deliveredAt(order.id),
      alreadyExchanged: await this.hasActiveExchange(item.id),
      isExchangeable: await this.catalog.isExchangeable(item.productId),
      discountPurchased: order.appliedCouponCode != null || Number(order.discountAmount) > 0,
    };
    const ineligible = checkExchangeEligibility(facts, now);
    if (ineligible) {
      throw new ConflictException({ code: 'EXCHANGE_INELIGIBLE', reason: ineligible });
    }

    const status = isDefect ? ExchangeStatus.UNDER_QA_REVIEW : ExchangeStatus.REQUESTED;

    const exchange = await this.dataSource.transaction(async (manager) => {
      const exchangeRepo = manager.getRepository(ExchangeOrmEntity);
      const created = await exchangeRepo.save(
        exchangeRepo.create({
          orderId: order.id,
          orderItemId: item.id,
          reason: input.reason,
          customerNote: input.customerNote ?? null,
          status,
          priceDifference: '0.00',
          qaDueAt: isDefect ? qaDueAt(now) : null,
        }),
      );

      // Link the (orphaned) evidence attachments to this exchange.
      if (attachmentIds.length > 0) {
        await manager
          .getRepository(ExchangeAttachmentOrmEntity)
          .update({ id: In(attachmentIds), exchangeId: IsNull() }, { exchangeId: created.id });
      }

      // Reflect the request at order level (FR-ORD-045; order status `exchange_requested`).
      if (order.status === OrderStatus.DELIVERED) {
        await this.appendHistory(
          manager,
          order.id,
          OrderStatus.DELIVERED,
          OrderStatus.EXCHANGE_REQUESTED,
          OrderActorType.CUSTOMER,
          customerId,
          `Exchange requested: ${input.reason}`,
          now,
        );
        await manager
          .getRepository(OrderOrmEntity)
          .update({ id: order.id }, { status: OrderStatus.EXCHANGE_REQUESTED });
      }
      return created;
    });

    await this.notifier.notify('order.exchange_requested', this.ctx(order));
    return { exchange_id: exchange.id, status: exchange.status, message: REQUEST_MESSAGE };
  }

  // ---------------------------------------------------------------------------
  // Customer status + replacement choice — FR-ORD-048
  // ---------------------------------------------------------------------------

  async getCustomerStatus(
    orderNo: string,
    customerId: string,
    exchangeId: string,
  ): Promise<{
    exchange_id: string;
    status: ExchangeStatus;
    reason: ExchangeReason;
    replacement_options_hint?: string | null;
    price_difference: string;
    replacement_order_no: string | null;
  }> {
    const order = await this.loadCustomerOrder(orderNo, customerId);
    const exchange = await this.loadExchange(exchangeId, order.id);
    return {
      exchange_id: exchange.id,
      status: exchange.status,
      reason: exchange.reason,
      replacement_options_hint:
        exchange.status === ExchangeStatus.APPROVED ? REPLACEMENT_HINT : null,
      price_difference: exchange.priceDifference,
      replacement_order_no: await this.orderNoFor(exchange.replacementOrderId),
    };
  }

  async confirmReplacement(
    orderNo: string,
    customerId: string,
    exchangeId: string,
    replacementVariantId: string,
    now: Date = new Date(),
  ): Promise<ConfirmReplacementResult> {
    const order = await this.loadCustomerOrder(orderNo, customerId);
    const exchange = await this.loadExchange(exchangeId, order.id);
    if (exchange.status !== ExchangeStatus.APPROVED) {
      throw new ConflictException({
        code: 'EXCHANGE_NOT_APPROVED',
        message: 'A replacement can only be chosen for an approved exchange.',
      });
    }

    const item = await this.loadItem(exchange.orderItemId);
    const variant = await this.resolveReplacement(replacementVariantId);
    const difference = this.differenceFor(variant, item.unitPrice, item.quantity);
    if (Number(difference) < 0) {
      throw new ConflictException({
        code: 'REPLACEMENT_LOWER_VALUE',
        message: 'A replacement must be of equal or higher value — no cash is returned.',
      });
    }

    // Persist the choice + computed difference on the exchange.
    await this.dataSource.getRepository(ExchangeOrmEntity).update(
      { id: exchange.id },
      { replacementVariantId: variant.variantId, priceDifference: difference },
    );

    if (Number(difference) === 0) {
      // Equal value → issue the replacement straight away (FR-ORD-048).
      const result = await this.performIssuance(
        exchange.id,
        this.defaultDisposition(exchange.reason),
        now,
      );
      return {
        status: ExchangeStatus.REPLACEMENT_ISSUED,
        price_difference: '0.00',
        replacement_order_no: result.replacementOrderNo,
      };
    }

    // Higher value → capture the price difference via PAY before issuance.
    const capture = await this.payment.initiateDifference({
      orderId: order.id,
      orderNo: order.orderNo,
      exchangeId: exchange.id,
      amount: difference,
    });
    await this.dataSource
      .getRepository(ExchangeOrmEntity)
      .update({ id: exchange.id }, { differencePaymentId: capture.paymentId });

    return {
      status: ExchangeStatus.APPROVED,
      price_difference: difference,
      payment: { action: 'redirect', redirect_url: capture.redirectUrl ?? null },
    };
  }

  // ---------------------------------------------------------------------------
  // Admin queue / detail — FR-ORD-047
  // ---------------------------------------------------------------------------

  async listQueue(query: ListExchangesQuery): Promise<{
    items: ExchangeQueueRow[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const qb = this.dataSource
      .getRepository(ExchangeOrmEntity)
      .createQueryBuilder('ex')
      .innerJoin(OrderOrmEntity, 'o', 'o.id = ex.order_id')
      .innerJoin(OrderItemOrmEntity, 'oi', 'oi.id = ex.order_item_id')
      .select([
        'ex.id AS ex_id',
        'ex.reason AS ex_reason',
        'ex.status AS ex_status',
        'ex.qa_due_at AS ex_qa_due_at',
        'ex.created_at AS ex_created_at',
        'o.order_no AS order_no',
        'oi.sku_code AS sku_code',
        'oi.product_title AS product_title',
      ])
      .orderBy('ex.created_at', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);
    if (query.status) qb.andWhere('ex.status = :status', { status: query.status });
    if (query.reason) qb.andWhere('ex.reason = :reason', { reason: query.reason });

    const [rows, total] = await Promise.all([
      qb.getRawMany<{
        ex_id: string;
        ex_reason: ExchangeReason;
        ex_status: ExchangeStatus;
        ex_qa_due_at: Date | null;
        ex_created_at: Date;
        order_no: string;
        sku_code: string;
        product_title: string;
      }>(),
      this.countQueue(query),
    ]);

    return {
      items: rows.map((r) => ({
        exchange_id: r.ex_id,
        order_no: r.order_no,
        order_item: { sku_code: r.sku_code, title: r.product_title },
        reason: r.ex_reason,
        status: r.ex_status,
        qa_due_at: r.ex_qa_due_at ? r.ex_qa_due_at.toISOString() : null,
        created_at: r.ex_created_at.toISOString(),
      })),
      page,
      limit,
      total,
    };
  }

  async getAdminDetail(exchangeId: string): Promise<ExchangeDetailRow> {
    const exchange = await this.dataSource.getRepository(ExchangeOrmEntity).findOne({
      where: { id: exchangeId },
      relations: { attachments: true },
    });
    if (!exchange) {
      throw new NotFoundException({ code: 'EXCHANGE_NOT_FOUND', message: 'Exchange not found.' });
    }
    const [order, item] = await Promise.all([
      this.dataSource.getRepository(OrderOrmEntity).findOne({ where: { id: exchange.orderId } }),
      this.loadItem(exchange.orderItemId),
    ]);
    return {
      exchange_id: exchange.id,
      order_no: order?.orderNo ?? '',
      order_item: { sku_code: item.skuCode, title: item.productTitle },
      reason: exchange.reason,
      status: exchange.status,
      qa_due_at: exchange.qaDueAt ? exchange.qaDueAt.toISOString() : null,
      created_at: exchange.createdAt.toISOString(),
      customer_note: exchange.customerNote,
      rejection_reason: exchange.rejectionReason,
      price_difference: exchange.priceDifference,
      replacement_variant_id: exchange.replacementVariantId,
      replacement_order_no: await this.orderNoFor(exchange.replacementOrderId),
      returned_item_disposition: exchange.returnedItemDisposition,
      attachments: (exchange.attachments ?? []).map((a) => ({
        attachment_id: a.id,
        url: a.url,
        content_type: a.contentType,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Decision (approve / reject) — FR-ORD-046/047
  // ---------------------------------------------------------------------------

  async decide(
    exchangeId: string,
    adminId: string,
    decision: 'approve' | 'reject',
    rejectionReason: string | null,
    now: Date = new Date(),
  ): Promise<{ exchange_id: string; status: ExchangeStatus }> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const exchange = await this.lockExchange(manager, exchangeId);
      // Only a pending request (requested / passed-QA review) can be decided.
      if (
        exchange.status !== ExchangeStatus.REQUESTED &&
        exchange.status !== ExchangeStatus.UNDER_QA_REVIEW
      ) {
        throw new ConflictException({
          code: 'EXCHANGE_NOT_PENDING',
          message: 'This exchange has already been decided.',
        });
      }

      exchange.reviewedByAdminId = adminId;
      if (decision === 'approve') {
        exchange.status = ExchangeStatus.APPROVED;
      } else {
        exchange.status = ExchangeStatus.REJECTED;
        exchange.rejectionReason = rejectionReason;
        // A rejected request leaves the order `delivered` (FR-ORD-046).
        await manager
          .getRepository(OrderOrmEntity)
          .update({ id: exchange.orderId, status: OrderStatus.EXCHANGE_REQUESTED }, {
            status: OrderStatus.DELIVERED,
          });
        await this.appendHistory(
          manager,
          exchange.orderId,
          OrderStatus.EXCHANGE_REQUESTED,
          OrderStatus.DELIVERED,
          OrderActorType.ADMIN,
          adminId,
          `Exchange rejected: ${rejectionReason ?? ''}`.trim(),
          now,
        );
      }
      await manager.getRepository(ExchangeOrmEntity).save(exchange);
      return exchange;
    });

    const order = await this.dataSource
      .getRepository(OrderOrmEntity)
      .findOne({ where: { id: outcome.orderId } });
    if (order) {
      await this.notifier.notify(
        decision === 'approve' ? 'order.exchange_approved' : 'order.exchange_rejected',
        this.ctx(order),
      );
    }
    return { exchange_id: outcome.id, status: outcome.status };
  }

  // ---------------------------------------------------------------------------
  // Issue replacement (admin) — FR-ORD-048/049
  // ---------------------------------------------------------------------------

  async issue(
    exchangeId: string,
    adminId: string,
    input: IssueReplacementInput,
    now: Date = new Date(),
  ): Promise<{
    exchange_id: string;
    status: ExchangeStatus;
    replacement_order_no: string;
    order_status: string;
    price_difference: string;
  }> {
    const exchange = await this.dataSource
      .getRepository(ExchangeOrmEntity)
      .findOne({ where: { id: exchangeId } });
    if (!exchange) {
      throw new NotFoundException({ code: 'EXCHANGE_NOT_FOUND', message: 'Exchange not found.' });
    }

    // Idempotent: an already-issued exchange returns its existing result.
    if (exchange.status === ExchangeStatus.REPLACEMENT_ISSUED && exchange.replacementOrderId) {
      return {
        exchange_id: exchange.id,
        status: exchange.status,
        replacement_order_no: (await this.orderNoFor(exchange.replacementOrderId)) ?? '',
        order_status: OrderStatus.EXCHANGED,
        price_difference: exchange.priceDifference,
      };
    }
    if (exchange.status !== ExchangeStatus.APPROVED) {
      throw new ConflictException({
        code: 'EXCHANGE_NOT_APPROVED',
        message: 'Only an approved exchange can be issued.',
      });
    }

    const variantId = input.replacementVariantId ?? exchange.replacementVariantId;
    if (!variantId) {
      throw new BadRequestException({
        code: 'REPLACEMENT_VARIANT_REQUIRED',
        message: 'A replacement variant must be chosen before issuance.',
      });
    }

    const item = await this.loadItem(exchange.orderItemId);
    const variant = await this.resolveReplacement(variantId);
    const difference = this.differenceFor(variant, item.unitPrice, item.quantity);
    if (Number(difference) < 0) {
      throw new ConflictException({
        code: 'REPLACEMENT_LOWER_VALUE',
        message: 'A replacement must be of equal or higher value — no cash is returned.',
      });
    }

    // A higher-value replacement requires the captured price difference to be `paid` first (FR-ORD-048).
    if (Number(difference) > 0) {
      const paid =
        exchange.differencePaymentId != null &&
        (await this.payment.isDifferencePaid(exchange.differencePaymentId));
      if (!paid) {
        throw new ConflictException({
          code: 'DIFFERENCE_UNPAID',
          message: 'The price-difference payment must be completed before issuing the replacement.',
        });
      }
    }

    // Keep the chosen variant/difference consistent with what is being issued.
    if (
      exchange.replacementVariantId !== variant.variantId ||
      exchange.priceDifference !== difference
    ) {
      await this.dataSource
        .getRepository(ExchangeOrmEntity)
        .update({ id: exchange.id }, { replacementVariantId: variant.variantId, priceDifference: difference });
    }

    const result = await this.performIssuance(exchange.id, input.disposition, now, adminId);
    return {
      exchange_id: exchange.id,
      status: ExchangeStatus.REPLACEMENT_ISSUED,
      replacement_order_no: result.replacementOrderNo,
      order_status: OrderStatus.EXCHANGED,
      price_difference: difference,
    };
  }

  // ---------------------------------------------------------------------------
  // Issuance (shared by the equal-value customer path + admin issue)
  // ---------------------------------------------------------------------------

  /**
   * Create the linked replacement order (reusing ord-core `place`, idempotent via an exchange-scoped
   * key), mark the exchange `replacement_issued`, set the original order `exchanged` + the replacement
   * link, restock/scrap the returned item (INV), and notify (FR-ORD-049). Safe to retry.
   */
  private async performIssuance(
    exchangeId: string,
    disposition: ReturnedItemDisposition,
    now: Date,
    adminId?: string,
  ): Promise<{ replacementOrderNo: string }> {
    const exchange = await this.dataSource
      .getRepository(ExchangeOrmEntity)
      .findOneOrFail({ where: { id: exchangeId } });

    // Already issued (e.g. a retry / double-submit) → return the existing replacement.
    if (exchange.status === ExchangeStatus.REPLACEMENT_ISSUED && exchange.replacementOrderId) {
      return { replacementOrderNo: (await this.orderNoFor(exchange.replacementOrderId)) ?? '' };
    }

    const [order, item, variant] = await Promise.all([
      this.dataSource.getRepository(OrderOrmEntity).findOneOrFail({ where: { id: exchange.orderId } }),
      this.loadItem(exchange.orderItemId),
      this.resolveReplacement(exchange.replacementVariantId ?? ''),
    ]);
    if (!variant.inStock) {
      throw new ConflictException({
        code: 'REPLACEMENT_OUT_OF_STOCK',
        message: 'The chosen replacement variant is out of stock.',
      });
    }

    const lineTotal = this.money(Number(variant.unitPrice) * item.quantity);
    // Build the linked replacement order from the original order + the replacement line. The order is
    // fully covered by the original payment (+ any difference top-up captured separately), so nothing is
    // collectable on it (grand_total 0; goods value carried as an offsetting discount). Seam — noted in PR.
    const placed = await this.orderCreation.place(
      {
        customer_id: order.customerId,
        guest_name: order.guestName,
        guest_phone: order.guestPhone,
        guest_email: order.guestEmail,
        payment_method: OrderPaymentMethod.COD,
        delivery_zone: order.deliveryZone,
        address: order.addressSnapshot,
        items: [
          {
            product_id: variant.productId,
            variant_id: variant.variantId,
            product_title: variant.productTitle,
            sku_code: variant.skuCode,
            variant_options: variant.variantOptions,
            unit_price: variant.unitPrice,
            quantity: item.quantity,
            line_total: lineTotal,
          },
        ],
        amounts: {
          subtotal: lineTotal,
          discount_amount: lineTotal,
          delivery_charge: '0.00',
          cod_surcharge: '0.00',
          vat_amount: '0.00',
          grand_total: '0.00',
        },
        applied_coupon_code: null,
        idempotency_key: `exchange:${exchange.id}`,
      },
      now,
    );

    await this.dataSource.transaction(async (manager) => {
      const fresh = await this.lockExchange(manager, exchangeId);
      if (fresh.status === ExchangeStatus.REPLACEMENT_ISSUED) return; // raced — already done
      fresh.status = ExchangeStatus.REPLACEMENT_ISSUED;
      fresh.replacementOrderId = placed.orderId;
      fresh.returnedItemDisposition = disposition;
      if (adminId) fresh.reviewedByAdminId = adminId;
      await manager.getRepository(ExchangeOrmEntity).save(fresh);

      await manager
        .getRepository(OrderOrmEntity)
        .update({ id: order.id }, { status: OrderStatus.EXCHANGED, replacementOrderId: placed.orderId });
      await this.appendHistory(
        manager,
        order.id,
        order.status,
        OrderStatus.EXCHANGED,
        adminId ? OrderActorType.ADMIN : OrderActorType.SYSTEM,
        adminId ?? null,
        `Exchange issued: replacement ${placed.orderNo}`,
        now,
      );
    });

    // Return the original item to stock: restock if resellable, scrap if defective (BR-ORD-6, FR-ORD-049).
    await this.stock.restock(order.id, disposition === ReturnedItemDisposition.SCRAPPED ? 'scrapped' : 'restocked');
    await this.notifier.notify('order.exchange_replacement_dispatched', this.ctx(order));

    return { replacementOrderNo: placed.orderNo };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async loadCustomerOrder(orderNo: string, customerId: string): Promise<OrderOrmEntity> {
    const order = await this.dataSource.getRepository(OrderOrmEntity).findOne({ where: { orderNo } });
    // Do not disclose another customer's order — same 404 as a missing one.
    if (!order || order.customerId !== customerId) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderNo} not found.` });
    }
    return order;
  }

  private async loadExchange(exchangeId: string, orderId: string): Promise<ExchangeOrmEntity> {
    const exchange = await this.dataSource
      .getRepository(ExchangeOrmEntity)
      .findOne({ where: { id: exchangeId, orderId } });
    if (!exchange) {
      throw new NotFoundException({ code: 'EXCHANGE_NOT_FOUND', message: 'Exchange not found.' });
    }
    return exchange;
  }

  private async lockExchange(manager: EntityManager, exchangeId: string): Promise<ExchangeOrmEntity> {
    const exchange = await manager
      .getRepository(ExchangeOrmEntity)
      .findOne({ where: { id: exchangeId }, lock: { mode: 'pessimistic_write' } });
    if (!exchange) {
      throw new NotFoundException({ code: 'EXCHANGE_NOT_FOUND', message: 'Exchange not found.' });
    }
    return exchange;
  }

  private async loadItem(orderItemId: string): Promise<OrderItemOrmEntity> {
    const item = await this.dataSource
      .getRepository(OrderItemOrmEntity)
      .findOne({ where: { id: orderItemId } });
    if (!item) {
      throw new NotFoundException({ code: 'ORDER_ITEM_NOT_FOUND', message: 'Order item not found.' });
    }
    return item;
  }

  private async resolveReplacement(variantId: string): Promise<ReplacementVariant> {
    const variant = variantId ? await this.catalog.getReplacementVariant(variantId) : null;
    if (!variant) {
      throw new NotFoundException({
        code: 'VARIANT_NOT_FOUND',
        message: 'The chosen replacement variant was not found.',
      });
    }
    return variant;
  }

  /** Total top-up for the replacement vs the original item (≥ 0 means equal/higher value). */
  private differenceFor(variant: ReplacementVariant, originalUnitPrice: string, quantity: number): string {
    const delta = (Number(variant.unitPrice) - Number(originalUnitPrice)) * quantity;
    return this.money(delta);
  }

  private defaultDisposition(reason: ExchangeReason): ReturnedItemDisposition {
    // Defective returns are scrapped; everything else is resellable (FR-ORD-049, BR-ORD-6).
    return reason === ExchangeReason.QUALITY_DEFECT
      ? ReturnedItemDisposition.SCRAPPED
      : ReturnedItemDisposition.RESTOCKED;
  }

  private async deliveredAt(orderId: string): Promise<Date | null> {
    const entry = await this.dataSource.getRepository(OrderStatusHistoryOrmEntity).findOne({
      where: { orderId, toStatus: OrderStatus.DELIVERED },
      order: { createdAt: 'DESC' },
    });
    return entry?.createdAt ?? null;
  }

  private async hasActiveExchange(orderItemId: string): Promise<boolean> {
    const count = await this.dataSource
      .getRepository(ExchangeOrmEntity)
      .createQueryBuilder('ex')
      .where('ex.order_item_id = :orderItemId', { orderItemId })
      .andWhere('ex.status != :rejected', { rejected: ExchangeStatus.REJECTED })
      .getCount();
    return count > 0;
  }

  private async countQueue(query: ListExchangesQuery): Promise<number> {
    const qb = this.dataSource.getRepository(ExchangeOrmEntity).createQueryBuilder('ex');
    if (query.status) qb.andWhere('ex.status = :status', { status: query.status });
    if (query.reason) qb.andWhere('ex.reason = :reason', { reason: query.reason });
    return qb.getCount();
  }

  private async orderNoFor(orderId: string | null): Promise<string | null> {
    if (!orderId) return null;
    const order = await this.dataSource.getRepository(OrderOrmEntity).findOne({ where: { id: orderId } });
    return order?.orderNo ?? null;
  }

  private async appendHistory(
    manager: EntityManager,
    orderId: string,
    fromStatus: OrderStatus | null,
    toStatus: OrderStatus,
    actorType: OrderActorType,
    actorId: string | null,
    note: string | null,
    now: Date,
  ): Promise<void> {
    const repo = manager.getRepository(OrderStatusHistoryOrmEntity);
    await repo.save(
      repo.create({ orderId, fromStatus, toStatus, actorType, actorId, note, createdAt: now }),
    );
  }

  private ctx(order: OrderOrmEntity) {
    return {
      orderNo: order.orderNo,
      customerId: order.customerId,
      guestPhone: order.guestPhone,
      guestEmail: order.guestEmail,
    };
  }

  private money(value: number): string {
    return Number.isFinite(value) ? value.toFixed(2) : '0.00';
  }
}

export interface ExchangeQueueRow {
  exchange_id: string;
  order_no: string;
  order_item: { sku_code: string; title: string };
  reason: ExchangeReason;
  status: ExchangeStatus;
  qa_due_at: string | null;
  created_at: string;
}

export interface ExchangeDetailRow extends ExchangeQueueRow {
  customer_note: string | null;
  rejection_reason: string | null;
  price_difference: string;
  replacement_variant_id: string | null;
  replacement_order_no: string | null;
  returned_item_disposition: ReturnedItemDisposition | null;
  attachments: { attachment_id: string; url: string; content_type: string }[];
}
