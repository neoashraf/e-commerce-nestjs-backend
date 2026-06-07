import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderOrmEntity } from '../../infrastructure/persistence/typeorm/entities/order.orm-entity';

/**
 * Read-only order lookups exported for in-process cross-domain use (PAY's OrderGateway, the ORD
 * fulfilment/tracking slices). Returns the ORM entity for now — the fulfilment/tracking briefs add
 * the customer/admin read DTOs. Keeping reads here avoids other domains touching ORD infrastructure.
 */
@Injectable()
export class OrderQueryService {
  constructor(
    @InjectRepository(OrderOrmEntity) private readonly orders: Repository<OrderOrmEntity>,
  ) {}

  /** Find an order by its human-readable `SO-` number. */
  async findByOrderNo(orderNo: string): Promise<OrderOrmEntity | null> {
    return this.orders.findOne({ where: { orderNo }, relations: { items: true } });
  }

  /** Find an order by id. */
  async findById(id: string): Promise<OrderOrmEntity | null> {
    return this.orders.findOne({ where: { id }, relations: { items: true } });
  }
}
