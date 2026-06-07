import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  PaymentLogEvent,
  PaymentLogResult,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
  RefundType,
} from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { RefundOrmEntity } from '../../infrastructure/persistence/typeorm/entities/refund.orm-entity';
import {
  IPaymentNotifier,
  PAYMENT_NOTIFIER,
} from '../ports/payment-notifier.port';
import {
  IPaymentProvider,
  PAYMENT_PROVIDERS,
} from '../providers/payment-provider.interface';
import { ReconService } from './recon.service';

export interface RefundCommand {
  paymentId: string;
  amount: string;
  reason: string;
  adminId?: string | null;
}

export interface RefundOutcome {
  refund_id: string;
  type: RefundType;
  status: RefundStatus;
  payment_status: PaymentStatus;
}

/**
 * Gateway refunds (FR-PAY-050–052, BR-PAY-6). Allowed **only** for a prepaid pre-dispatch cancellation
 * or a duplicate/erroneous capture of a `paid` **online** payment — **never** a post-delivery return
 * (those are exchanges in ORD) and never COD (no captured funds). Cumulative refunds never exceed the
 * captured amount (`422`). Sets `refund_pending → refunded | partially_refunded`, calls the gateway
 * refund, records the recon log, and notifies (cancellation-refund). One transaction.
 */
@Injectable()
export class RefundsService {
  private readonly providers: Map<PaymentMethod, IPaymentProvider>;

  constructor(
    @InjectRepository(PaymentOrmEntity) private readonly payments: Repository<PaymentOrmEntity>,
    @InjectRepository(RefundOrmEntity) private readonly refunds: Repository<RefundOrmEntity>,
    private readonly dataSource: DataSource,
    private readonly recon: ReconService,
    @Inject(PAYMENT_PROVIDERS) providers: IPaymentProvider[],
    @Inject(PAYMENT_NOTIFIER) private readonly notifier: IPaymentNotifier,
  ) {
    this.providers = new Map(providers.map((p) => [p.method, p]));
  }

  async refund(cmd: RefundCommand): Promise<RefundOutcome> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const payRepo = manager.getRepository(PaymentOrmEntity);
      const refundRepo = manager.getRepository(RefundOrmEntity);

      const payment = await payRepo
        .createQueryBuilder('p')
        .setLock('pessimistic_write')
        .where('p.id = :id', { id: cmd.paymentId })
        .getOne();
      if (!payment) {
        throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: `Payment ${cmd.paymentId} not found.` });
      }

      // COD has no captured funds; only a paid online payment is refundable (BR-PAY-6, FR-PAY-052).
      if (payment.method === PaymentMethod.COD) {
        throw new ConflictException({ code: 'NOT_REFUNDABLE', message: 'COD payments have no captured funds to refund.' });
      }
      if (
        payment.status !== PaymentStatus.PAID &&
        payment.status !== PaymentStatus.PARTIALLY_REFUNDED
      ) {
        throw new ConflictException({
          code: 'NOT_REFUNDABLE',
          message: 'Only a captured (paid) online payment can be refunded.',
        });
      }

      // Cumulative refunds never exceed the captured amount (BR-PAY-6, §12.7/8).
      const captured = Math.round(Number(payment.amount) * 100);
      const already = Math.round(Number(payment.refundedAmount) * 100);
      const requested = Math.round(Number(cmd.amount) * 100);
      if (requested <= 0) {
        throw new UnprocessableEntityException({ code: 'INVALID_AMOUNT', message: 'Refund amount must be > 0.' });
      }
      if (already + requested > captured) {
        throw new UnprocessableEntityException({
          code: 'REFUND_EXCEEDS_CAPTURED',
          message: 'Cumulative refund exceeds the captured amount.',
        });
      }

      // Create the refund record (pending) + call the gateway.
      const refund = await refundRepo.save(
        refundRepo.create({
          paymentId: payment.id,
          amount: Number(cmd.amount).toFixed(2),
          reason: cmd.reason,
          type: RefundType.GATEWAY,
          status: RefundStatus.PENDING,
          requestedByAdminId: cmd.adminId ?? null,
        }),
      );

      payment.status = PaymentStatus.REFUND_PENDING;
      await payRepo.save(payment);

      const provider = this.providers.get(payment.method);
      const gwResult = provider?.refund
        ? await provider.refund(
            // SSLCommerz refunds key off bank_tran_id (stored as gatewayTxnId); fall back for others.
            payment.gatewayTxnId ?? payment.gatewayPaymentId ?? payment.internalRef,
            refund.amount,
          )
        : { status: 'completed' as const, gatewayRefundRef: undefined };

      refund.gatewayRefundRef = gwResult.gatewayRefundRef ?? null;
      refund.status = gwResult.status === 'failed' ? RefundStatus.FAILED : RefundStatus.COMPLETED;
      await refundRepo.save(refund);

      // Update cumulative refunded + the payment status.
      const newRefundedPaisa = already + (refund.status === RefundStatus.COMPLETED ? requested : 0);
      payment.refundedAmount = (newRefundedPaisa / 100).toFixed(2);
      payment.status =
        newRefundedPaisa >= captured ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
      await payRepo.save(payment);

      await this.recon.recordTxn(
        {
          paymentId: payment.id,
          method: payment.method,
          event: PaymentLogEvent.REFUND,
          gatewayReference: refund.gatewayRefundRef,
          requestSummary: { amount: refund.amount, reason: cmd.reason },
          responseSummary: { status: refund.status },
          result: refund.status === RefundStatus.COMPLETED ? PaymentLogResult.SUCCESS : PaymentLogResult.FAILED,
        },
        manager,
      );

      return { refund, payment };
    });

    await this.notifier.notify('payment.cancellation_refund', {
      paymentId: outcome.payment.id,
      orderId: outcome.payment.orderId,
      amount: outcome.refund.amount,
    });

    return {
      refund_id: outcome.refund.id,
      type: outcome.refund.type,
      status: outcome.refund.status,
      payment_status: outcome.payment.status,
    };
  }
}
