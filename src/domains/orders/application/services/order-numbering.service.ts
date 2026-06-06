import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * Generates unique, human-readable order numbers `SO-<seq>` from a Postgres sequence starting at
 * 100000 (BR-ORD-2, §15). Using a DB sequence guarantees uniqueness + monotonicity under concurrency
 * without a row lock. Called inside the order-creation transaction so the number is allocated atomically.
 */
@Injectable()
export class OrderNumberingService {
  /** Allocate the next `SO-` order number using the DB sequence (concurrency-safe). */
  async next(manager: EntityManager): Promise<string> {
    const rows = await manager.query<{ nextval: string }[]>(
      `SELECT nextval('order_no_seq') AS nextval`,
    );
    const value = rows?.[0]?.nextval ?? '100000';
    return `SO-${value}`;
  }
}
