import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { OrderOrmEntity } from '../../../orders/infrastructure/persistence/typeorm/entities/order.orm-entity';
import { IGuestOrderClaimPort } from '../../application/ports/guest-order-claim.port';

/**
 * ORD adapter for AUTH: when a phone is verified at OTP login/registration, claim any guest orders
 * (customer_id IS NULL) placed under that phone for the now-known customer. A single indexed,
 * phone-keyed UPDATE (orders.guest_phone is indexed). Degrades gracefully — a claim failure must
 * never block login, so it logs and reports zero rather than throwing.
 */
@Injectable()
export class GuestOrderClaimAdapter implements IGuestOrderClaimPort {
  private readonly logger = new Logger(GuestOrderClaimAdapter.name);

  constructor(
    @InjectRepository(OrderOrmEntity)
    private readonly orders: Repository<OrderOrmEntity>,
  ) {}

  async claimByPhone(phone: string, customerId: string): Promise<number> {
    if (!phone || !customerId) return 0;
    try {
      const result = await this.orders.update(
        { guestPhone: phone, customerId: IsNull() },
        { customerId },
      );
      const claimed = result.affected ?? 0;
      if (claimed > 0) {
        this.logger.log(`Claimed ${claimed} guest order(s) for customer ${customerId}.`);
      }
      return claimed;
    } catch (err) {
      this.logger.warn(`claimByPhone failed for customer ${customerId}: ${String(err)}`);
      return 0;
    }
  }
}
