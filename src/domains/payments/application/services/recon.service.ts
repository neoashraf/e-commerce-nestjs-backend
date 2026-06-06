import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import {
  PaymentLogEvent,
  PaymentLogResult,
  PaymentMethod,
} from '../../domain/payment-enums';
import { PaymentTransactionLogOrmEntity } from '../../infrastructure/persistence/typeorm/entities/payment-transaction-log.orm-entity';

export interface RecordTxnInput {
  paymentId: string | null;
  method: PaymentMethod;
  event: PaymentLogEvent;
  gatewayReference?: string | null;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
  result: PaymentLogResult;
}

/**
 * Reconciliation log writer (FR-PAY-043, BR-PAY-8) — the shared `recordTxn` every PAY interaction
 * (initiate/create/callback/ipn/execute/query/validate/refund) appends to. **Append-only**: no update
 * or delete. Summaries are **non-sensitive** only (no card/wallet data, §14). The gateway + refund
 * slices call this for their events; `gateway_reference` backs idempotency lookups (BR-PAY-4).
 */
@Injectable()
export class ReconService {
  constructor(
    @InjectRepository(PaymentTransactionLogOrmEntity)
    private readonly logs: Repository<PaymentTransactionLogOrmEntity>,
  ) {}

  /** Append a reconciliation entry. Pass a transaction `manager` to join the caller's transaction. */
  async recordTxn(
    input: RecordTxnInput,
    manager?: EntityManager,
  ): Promise<PaymentTransactionLogOrmEntity> {
    const repo = manager
      ? manager.getRepository(PaymentTransactionLogOrmEntity)
      : this.logs;
    return repo.save(
      repo.create({
        paymentId: input.paymentId,
        method: input.method,
        event: input.event,
        gatewayReference: input.gatewayReference ?? null,
        requestSummary: input.requestSummary ?? {},
        responseSummary: input.responseSummary ?? {},
        result: input.result,
      }),
    );
  }

  /** Whether a gateway reference has already been processed (idempotency guard, BR-PAY-4). */
  async hasProcessed(gatewayReference: string): Promise<boolean> {
    const count = await this.logs.count({
      where: { gatewayReference, result: PaymentLogResult.SUCCESS },
    });
    return count > 0;
  }

  /** Reconciliation events for a payment (admin log read, FR-PAY-043). */
  async listForPayment(paymentId: string): Promise<PaymentTransactionLogOrmEntity[]> {
    return this.logs.find({ where: { paymentId }, order: { createdAt: 'ASC' } });
  }
}
