import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import {
  PaymentLogEvent,
  PaymentLogResult,
  PaymentStatus,
} from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { PaymentTransactionLogOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment-transaction-log.orm-entity';
import { IOrderGateway, ORDER_GATEWAY } from '../ports/order-gateway.port';
import { ReconService } from './recon.service';

export type FinalizeOutcome = 'paid' | 'failed' | 'cancelled';

export interface FinalizeInput {
  paymentId: string;
  outcome: FinalizeOutcome;
  gatewayReference: string;
  gatewayTxnId?: string | null;
  /** The amount the gateway reports as captured — must match the payment amount to mark paid. */
  validatedAmount?: string | null;
  event: PaymentLogEvent;
}

export interface FinalizeResult {
  status: PaymentStatus;
  duplicate?: boolean;
  mismatch?: boolean;
}

/**
 * Authoritative payment finalization (FR-PAY-040–042, BR-PAY-2/3/4/5/9). The single place a gateway
 * outcome (bKash execute, SSLCommerz validated IPN) is applied — **never** from the browser return.
 * Idempotent by `gateway_reference` (a duplicate is recorded `duplicate_ignored` and changes nothing,
 * BR-PAY-4). On `paid`, the validated amount must match the payment amount (BR-PAY-5) — a mismatch is
 * logged `mismatch` and the payment is NOT marked paid. The payment status change + order propagation
 * happen in one transaction (BR-PAY-9).
 */
@Injectable()
export class GatewayFinalizerService {
  private readonly logger = new Logger(GatewayFinalizerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly recon: ReconService,
    @Inject(ORDER_GATEWAY) private readonly orders: IOrderGateway,
  ) {}

  async finalize(input: FinalizeInput, now: Date = new Date()): Promise<FinalizeResult> {
    // Idempotency: a successfully-processed gateway reference is never applied twice (BR-PAY-4).
    if (await this.recon.hasProcessed(input.gatewayReference)) {
      await this.recon.recordTxn({
        paymentId: input.paymentId,
        method: await this.methodOf(input.paymentId),
        event: input.event,
        gatewayReference: input.gatewayReference,
        responseSummary: { note: 'duplicate' },
        result: PaymentLogResult.DUPLICATE_IGNORED,
      });
      const current = await this.dataSource
        .getRepository(PaymentOrmEntity)
        .findOne({ where: { id: input.paymentId } });
      return { status: current?.status ?? PaymentStatus.PENDING, duplicate: true };
    }

    return this.dataSource.transaction(async (manager) => {
      const payRepo = manager.getRepository(PaymentOrmEntity);
      const payment = await payRepo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: input.paymentId })
        .getOne();

      if (!payment) {
        return { status: PaymentStatus.PENDING };
      }

      // Already PAID is terminal — never un-pay (idempotent replay).
      if (payment.status === PaymentStatus.PAID) {
        await this.log(manager, payment, input, PaymentLogResult.DUPLICATE_IGNORED, { note: 'already_paid' });
        return { status: PaymentStatus.PAID, duplicate: true };
      }
      // FAILED/CANCELLED is terminal too — EXCEPT an authoritative `paid` outcome recovers it: a
      // gateway-validated capture (IPN validate / reconciliation query) overrides a callback or a
      // reconciliation that wrongly failed a payment the customer actually completed. The amount-match
      // guard below still gates the real transition (BR-PAY-4/5). A non-`paid` replay stays a no-op.
      if (
        (payment.status === PaymentStatus.FAILED || payment.status === PaymentStatus.CANCELLED) &&
        input.outcome !== 'paid'
      ) {
        await this.log(manager, payment, input, PaymentLogResult.DUPLICATE_IGNORED, { note: 'already_final' });
        return { status: payment.status, duplicate: true };
      }

      if (input.outcome === 'paid') {
        // Amount must match the order/payment (BR-PAY-5, FR-PAY-033) — else flag, do not pay.
        if (
          input.validatedAmount != null &&
          Number(input.validatedAmount) !== Number(payment.amount)
        ) {
          await this.log(manager, payment, input, PaymentLogResult.MISMATCH, {
            validated_amount: input.validatedAmount,
            payment_amount: payment.amount,
          });
          this.logger.warn(`Amount mismatch on payment ${payment.id}: not marking paid.`);
          return { status: payment.status, mismatch: true };
        }

        payment.status = PaymentStatus.PAID;
        payment.gatewayTxnId = input.gatewayTxnId ?? payment.gatewayTxnId;
        payment.paidAt = now;
        await payRepo.save(payment);

        await this.log(manager, payment, input, PaymentLogResult.SUCCESS, { status: 'paid' });

        // Propagate to the order in the same transaction (BR-PAY-9).
        await this.orders.markOrderPaid(payment.orderId, payment.id);
        return { status: PaymentStatus.PAID };
      }

      // failed / cancelled — leave the order pending_payment for retry (FR-PAY-011).
      payment.status =
        input.outcome === 'cancelled' ? PaymentStatus.CANCELLED : PaymentStatus.FAILED;
      await payRepo.save(payment);
      await this.log(manager, payment, input, PaymentLogResult.FAILED, { status: payment.status });
      await this.orders.markOrderPaymentFailed(payment.orderId);
      return { status: payment.status };
    });
  }

  private async log(
    manager: EntityManager,
    payment: PaymentOrmEntity,
    input: FinalizeInput,
    result: PaymentLogResult,
    response: Record<string, unknown>,
  ): Promise<void> {
    const repo = manager.getRepository(PaymentTransactionLogOrmEntity);
    await repo.save(
      repo.create({
        paymentId: payment.id,
        method: payment.method,
        event: input.event,
        gatewayReference: input.gatewayReference,
        responseSummary: response,
        result,
      }),
    );
  }

  private async methodOf(paymentId: string) {
    const payment = await this.dataSource
      .getRepository(PaymentOrmEntity)
      .findOne({ where: { id: paymentId } });
    return payment!.method;
  }
}
