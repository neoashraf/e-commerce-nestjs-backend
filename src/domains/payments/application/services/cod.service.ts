import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  PaymentLogEvent,
  PaymentLogResult,
  PaymentStatus,
} from '../../domain/payment-enums';
import { PaymentOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment.orm-entity';
import { ReconService } from './recon.service';

export interface CodCollectedResult {
  payment_id: string;
  status: PaymentStatus;
  collected_at: Date;
}

/**
 * COD lifecycle (FR-PAY-010–012). `markCollected` records the collected amount + admin + time and moves
 * `cod_pending → cod_collected`; `markFailed` records a refusal and moves `cod_pending → failed`
 * (enabling order cancellation). Both reject a payment not currently `cod_pending` (`409`). Every action
 * appends a reconciliation entry. No online capture — COD has no gateway funds.
 */
@Injectable()
export class CodService {
  constructor(
    @InjectRepository(PaymentOrmEntity)
    private readonly payments: Repository<PaymentOrmEntity>,
    private readonly recon: ReconService,
  ) {}

  async markCollected(
    paymentId: string,
    collectedAmount: string,
    adminId: string | null,
    now: Date = new Date(),
  ): Promise<CodCollectedResult> {
    const payment = await this.getCodPending(paymentId);
    payment.status = PaymentStatus.COD_COLLECTED;
    payment.collectedByAdminId = adminId;
    payment.collectedAt = now;
    payment.paidAt = now;
    await this.payments.save(payment);

    await this.recon.recordTxn({
      paymentId: payment.id,
      method: payment.method,
      event: PaymentLogEvent.EXECUTE,
      requestSummary: { collected_amount: collectedAmount },
      responseSummary: { status: PaymentStatus.COD_COLLECTED },
      result: PaymentLogResult.SUCCESS,
    });

    return { payment_id: payment.id, status: payment.status, collected_at: now };
  }

  async markFailed(
    paymentId: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<{ payment_id: string; status: PaymentStatus }> {
    const payment = await this.getCodPending(paymentId);
    payment.status = PaymentStatus.FAILED;
    await this.payments.save(payment);

    await this.recon.recordTxn({
      paymentId: payment.id,
      method: payment.method,
      event: PaymentLogEvent.EXECUTE,
      requestSummary: { reason },
      responseSummary: { status: PaymentStatus.FAILED, at: now.toISOString() },
      result: PaymentLogResult.FAILED,
    });

    return { payment_id: payment.id, status: payment.status };
  }

  private async getCodPending(paymentId: string): Promise<PaymentOrmEntity> {
    const payment = await this.payments.findOne({ where: { id: paymentId } });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: `Payment ${paymentId} not found.` });
    }
    if (payment.status !== PaymentStatus.COD_PENDING) {
      throw new ConflictException({
        code: 'NOT_COD_PENDING',
        message: 'Payment is not awaiting COD collection.',
      });
    }
    return payment;
  }
}
