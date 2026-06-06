import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Read port over WISH for a customer's wishlist item count (FR-CUST-013). Read-only. */
export interface IWishlistSource {
  getCount(customerId: string): Promise<number>;
}

export const WISHLIST_SOURCE = Symbol('IWishlistSource');

/** Real adapter — counts the WISH `wishlist_items` for the customer's wishlist via DataSource. */
@Injectable()
export class WishlistSourceAdapter implements IWishlistSource {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getCount(customerId: string): Promise<number> {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT COUNT(wi.*)::int AS count
       FROM wishlists w
       LEFT JOIN wishlist_items wi ON wi.wishlist_id = w.id
       WHERE w.customer_id = $1`,
      [customerId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
