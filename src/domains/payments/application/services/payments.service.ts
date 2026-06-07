import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  PaymentLogEvent,
  PaymentLogResult,
  PaymentMethod,
  PaymentPurpose,
  PaymentStatus,
} from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { IOrderGateway, ORDER_GATEWAY } from '../ports/order-gateway.port';
import {
  IPaymentProvider,
  PAYMENT_PROVIDERS,
} from '../providers/payment-provider.interface';
import { ReconService } from './recon.service';
import { SettingsService } from './settings.service';

export interface InitiateCommand {
  order_id: string;
  method: PaymentMethod;
  purpose?: PaymentPurpose;
  exchange_id?: string | null;
  /** Override the captured amount (exchange-difference); defaults to the order grand total. */
  amount?: string;
}

export interface InitiateResult {
  payment_id: string;
  status: PaymentStatus;
  method: PaymentMethod;
  action: 'redirect' | 'none';
  redirect_url?: string;
  gateway_payment_id?: string;
  purpose?: PaymentPurpose;
}

export interface PaymentStatusView {
  payment_id: string;
  order_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount: string;
  currency: string;
  gateway_txn_id: string | null;
  paid_at: Date | null;
  refunded_amount: string;
}

/** Statuses that mean an order is already (being) paid — block a fresh initiation (BR-PAY-1). */
const ACTIVE_PAID_STATES = [
  PaymentStatus.PAID,
  PaymentStatus.COD_COLLECTED,
  PaymentStatus.REFUND_PENDING,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
];

/** Statuses a retry may supersede (BR-PAY-1, FR-PAY-004). */
const SUPERSEDABLE = [PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.PENDING];

/**
 * Payment framework — the real `PaymentInitiator` CART calls (FR-PAY-001–005). One active payment per
 * (order, purpose) (BR-PAY-1): COD → `cod_pending` (no gateway); online → the provider adapter creates a
 * session and the payment goes `initiated` + redirect. Rejects when the order already has a paid/
 * cod_collected payment (`409`), or the method is disabled / order not pending (`400`). `retry`
 * supersedes a prior failed/cancelled attempt. Every action appends to the reconciliation log.
 */
@Injectable()
export class PaymentsService {
  private readonly providers: Map<PaymentMethod, IPaymentProvider>;

  constructor(
    @InjectRepository(PaymentOrmEntity)
    private readonly payments: Repository<PaymentOrmEntity>,
    @Inject(PAYMENT_PROVIDERS) providers: IPaymentProvider[],
    @Inject(ORDER_GATEWAY) private readonly orders: IOrderGateway,
    private readonly settings: SettingsService,
    private readonly recon: ReconService,
  ) {
    this.providers = new Map(providers.map((p) => [p.method, p]));
  }

  // ---------------------------------------------------------------------------
  // Initiate (FR-PAY-001–005, 061)
  // ---------------------------------------------------------------------------

  async initiate(cmd: InitiateCommand): Promise<InitiateResult> {
    const purpose = cmd.purpose ?? PaymentPurpose.ORDER;

    // Method must be enabled (FR-PAY-061).
    if (!(await this.settings.isMethodEnabled(cmd.method))) {
      throw new BadRequestException({ code: 'METHOD_DISABLED', message: `${cmd.method} is not available.` });
    }

    const order = await this.orders.getOrder(cmd.order_id);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${cmd.order_id} not found.` });
    }
    // Only an order awaiting payment may be initiated (order purpose only; exchange-difference is a
    // distinct capture handled by pay-refunds-be and skips this guard via its own entry point).
    if (purpose === PaymentPurpose.ORDER && !order.isPendingPayment) {
      throw new BadRequestException({
        code: 'ORDER_NOT_PENDING',
        message: 'Order is not awaiting payment.',
      });
    }

    // Reject if a paid/cod_collected payment already exists for (order, purpose) (FR-PAY-003).
    const existingPaid = await this.payments.findOne({
      where: { orderId: cmd.order_id, purpose, status: In(ACTIVE_PAID_STATES) },
    });
    if (existingPaid) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_EXISTS',
        message: 'This order already has a completed payment.',
      });
    }

    const amount = cmd.amount ?? order.grandTotal;
    return this.createAndStart(cmd.order_id, order.orderNo, cmd.method, purpose, cmd.exchange_id ?? null, amount);
  }

  // ---------------------------------------------------------------------------
  // Retry (FR-PAY-004)
  // ---------------------------------------------------------------------------

  async retry(orderId: string, method: PaymentMethod): Promise<InitiateResult> {
    if (!(await this.settings.isMethodEnabled(method))) {
      throw new BadRequestException({ code: 'METHOD_DISABLED', message: `${method} is not available.` });
    }
    const order = await this.orders.getOrder(orderId);
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: `Order ${orderId} not found.` });
    }
    if (!order.isPendingPayment) {
      throw new BadRequestException({ code: 'ORDER_NOT_PENDING', message: 'Order is not awaiting payment.' });
    }

    // Reject if already paid; otherwise cancel any supersedable prior attempt before re-initiating.
    const existing = await this.payments.find({
      where: { orderId, purpose: PaymentPurpose.ORDER },
    });
    if (existing.some((p) => ACTIVE_PAID_STATES.includes(p.status))) {
      throw new ConflictException({
        code: 'PAYMENT_ALREADY_EXISTS',
        message: 'This order already has a completed payment.',
      });
    }
    for (const prior of existing) {
      if (SUPERSEDABLE.includes(prior.status) || prior.status === PaymentStatus.INITIATED) {
        prior.status = PaymentStatus.CANCELLED;
        await this.payments.save(prior);
      }
    }

    return this.createAndStart(orderId, order.orderNo, method, PaymentPurpose.ORDER, null, order.grandTotal);
  }

  // ---------------------------------------------------------------------------
  // Status (FR-PAY-044)
  // ---------------------------------------------------------------------------

  async getStatus(paymentId: string): Promise<PaymentStatusView> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: `Payment ${paymentId} not found.` });
    }
    return {
      payment_id: payment.id,
      order_id: payment.orderId,
      method: payment.method,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      gateway_txn_id: payment.gatewayTxnId,
      paid_at: payment.paidAt,
      refunded_amount: payment.refundedAmount,
    };
  }

  /** Find a payment by the gateway's payment id (bKash paymentID / SSLCommerz session). */
  async findByGatewayPaymentId(gatewayPaymentId: string): Promise<PaymentOrmEntity | null> {
    return this.payments.findOne({ where: { gatewayPaymentId } });
  }

  /** Find a payment by its merchant internal reference (SSLCommerz tran_id maps to this). */
  async findByInternalRef(internalRef: string): Promise<PaymentOrmEntity | null> {
    return this.payments.findOne({ where: { internalRef } });
  }

  // ---------------------------------------------------------------------------
  // Shared creation path
  // ---------------------------------------------------------------------------

  private async createAndStart(
    orderId: string,
    orderNo: string,
    method: PaymentMethod,
    purpose: PaymentPurpose,
    exchangeId: string | null,
    amount: string,
  ): Promise<InitiateResult> {
    const provider = this.providers.get(method);
    if (!provider) {
      throw new BadRequestException({ code: 'METHOD_UNSUPPORTED', message: `${method} is not supported.` });
    }

    const internalRef = this.newInternalRef();
    const isCod = method === PaymentMethod.COD;

    const payment = await this.payments.save(
      this.payments.create({
        orderId,
        purpose,
        exchangeId,
        method,
        amount: this.money(amount),
        currency: 'BDT',
        status: isCod ? PaymentStatus.COD_PENDING : PaymentStatus.PENDING,
        internalRef,
        refundedAmount: '0.00',
      }),
    );

    await this.recon.recordTxn({
      paymentId: payment.id,
      method,
      event: PaymentLogEvent.INITIATE,
      gatewayReference: internalRef,
      requestSummary: { order_no: orderNo, amount: payment.amount, purpose },
      responseSummary: { status: payment.status },
      result: PaymentLogResult.SUCCESS,
    });

    if (isCod) {
      return {
        payment_id: payment.id,
        status: PaymentStatus.COD_PENDING,
        method,
        action: 'none',
        purpose,
      };
    }

    // Online: ask the provider to create a session, then mark the payment initiated.
    const session = await provider.createSession({
      paymentId: payment.id,
      internalRef,
      orderId,
      orderNo,
      amount: payment.amount,
      currency: payment.currency,
    });

    payment.status = PaymentStatus.INITIATED;
    payment.gatewayPaymentId = session.gatewayPaymentId ?? null;
    await this.payments.save(payment);

    await this.recon.recordTxn({
      paymentId: payment.id,
      method,
      event: PaymentLogEvent.CREATE,
      gatewayReference: session.gatewayPaymentId ?? internalRef,
      requestSummary: { order_no: orderNo },
      responseSummary: { action: session.action, has_redirect: !!session.redirectUrl },
      result: PaymentLogResult.SUCCESS,
    });

    return {
      payment_id: payment.id,
      status: PaymentStatus.INITIATED,
      method,
      action: session.action,
      redirect_url: session.redirectUrl,
      gateway_payment_id: session.gatewayPaymentId,
      purpose,
    };
  }

  /** Unique merchant payment reference (≤ 40 chars, SRS §8 Payment.internal_ref). */
  private newInternalRef(): string {
    return `PAY-${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
  }

  private money(value: string): string {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '0.00';
  }
}
