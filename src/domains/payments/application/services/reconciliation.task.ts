import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { PaymentLogEvent, PaymentMethod, PaymentStatus } from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { BkashAdapter } from '../providers/bkash.adapter';
import { SslcommerzAdapter } from '../providers/sslcommerz.adapter';
import { GatewayFinalizerService } from './gateway-finalizer.service';

/**
 * Payment reconciliation sweep (FR-PAY-023/034) — finalizes online payments whose callback/IPN was
 * lost. For `initiated` payments older than the grace window it runs the gateway status fallback (bKash
 * query / SSLCommerz validate by tran_id) and finalizes idempotently via the finalizer. Self-managed
 * interval (the repo has no @nestjs/schedule — mirrors the INV/ORD sweeps); disabled in tests.
 *
 * The same per-payment fallback is also exposed via {@link reconcileOnDemand} so the storefront result
 * page (which polls payment status while the customer waits) can trigger an immediate, authoritative
 * gateway query instead of waiting out the sweep grace window — the common case when the IPN can't reach
 * the backend (localhost/sandbox). On-demand calls are throttled per payment to avoid hammering the gateway.
 */
@Injectable()
export class ReconciliationTask implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationTask.name);
  private readonly graceMs: number;
  private readonly sweepMs: number;
  private readonly onDemandThrottleMs: number;
  /** Per-payment timestamp of the last on-demand gateway query, to throttle poll-driven reconciliation. */
  private readonly lastOnDemandAt = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(PaymentOrmEntity) private readonly payments: Repository<PaymentOrmEntity>,
    private readonly finalizer: GatewayFinalizerService,
    private readonly bkash: BkashAdapter,
    private readonly sslcommerz: SslcommerzAdapter,
    config: ConfigService,
  ) {
    this.graceMs = Number(config.get('PAYMENT_RECONCILE_GRACE_MS') ?? 5 * 60 * 1000);
    this.sweepMs = Number(config.get('PAYMENT_RECONCILE_SWEEP_MS') ?? 2 * 60 * 1000);
    this.onDemandThrottleMs = Number(config.get('PAYMENT_RECONCILE_ONDEMAND_THROTTLE_MS') ?? 5 * 1000);
  }

  onModuleInit(): void {
    if (this.sweepMs <= 0 || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.runSweep(), this.sweepMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** One reconciliation pass; overlap-guarded. */
  async runSweep(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - this.graceMs);
      const stale = await this.payments.find({
        where: { status: PaymentStatus.INITIATED, createdAt: LessThan(cutoff) },
      });
      let finalized = 0;
      for (const p of stale) {
        const status = await this.reconcilePayment(p);
        if (status === 'paid') finalized += 1;
      }
      if (finalized > 0) this.logger.log(`Reconciliation finalized ${finalized} payment(s).`);
      return finalized;
    } catch (err) {
      this.logger.error(`Reconciliation sweep failed: ${(err as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Poll-driven reconciliation (FR-PAY-034) — triggered by the storefront result page while the customer
   * waits, so a payment whose IPN never reached us is finalized immediately instead of after the sweep
   * grace window. Authoritative (server-to-server gateway query, never the browser return), idempotent,
   * and throttled per payment. Best-effort: any gateway error is swallowed so a status read never fails.
   */
  async reconcileOnDemand(payment: PaymentOrmEntity, now: Date = new Date()): Promise<void> {
    if (payment.status !== PaymentStatus.INITIATED || payment.method === PaymentMethod.COD) return;

    const last = this.lastOnDemandAt.get(payment.id) ?? 0;
    if (now.getTime() - last < this.onDemandThrottleMs) return;
    this.lastOnDemandAt.set(payment.id, now.getTime());

    try {
      const status = await this.reconcilePayment(payment);
      if (status && status !== 'pending') this.lastOnDemandAt.delete(payment.id);
    } catch (err) {
      this.logger.warn(`On-demand reconcile for payment ${payment.id} failed: ${(err as Error).message}`);
    }
  }

  /**
   * Query the gateway for one `initiated` online payment and finalize idempotently. Returns the outcome
   * (`paid`/`failed`/`cancelled`) or `pending` when the gateway is still processing/unreachable (leave
   * INITIATED for the next attempt). Shared by the sweep and the on-demand poll path.
   */
  private async reconcilePayment(p: PaymentOrmEntity): Promise<'paid' | 'failed' | 'cancelled' | 'pending'> {
    if (p.method === PaymentMethod.COD) return 'pending';
    // bKash queries by its paymentID; SSLCommerz queries by tran_id (== internal_ref), NOT the
    // session key — the Transaction Query API is keyed on tran_id (FR-PAY-034).
    const queryRef =
      p.method === PaymentMethod.BKASH ? (p.gatewayPaymentId ?? p.internalRef) : p.internalRef;
    const result =
      p.method === PaymentMethod.BKASH
        ? await this.bkash.query(queryRef)
        : await this.sslcommerz.query(queryRef);
    // `pending` → gateway still processing / unreachable; leave INITIATED for the next attempt.
    if (result.status === 'paid' || result.status === 'failed' || result.status === 'cancelled') {
      await this.finalizer.finalize({
        paymentId: p.id,
        outcome: result.status,
        gatewayReference: `recon:${queryRef}`,
        gatewayTxnId: result.gatewayTxnId ?? null,
        validatedAmount: result.status === 'paid' ? result.amount ?? null : null,
        event: PaymentLogEvent.QUERY,
      });
    }
    return result.status;
  }
}
