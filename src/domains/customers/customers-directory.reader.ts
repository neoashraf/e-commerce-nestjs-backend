import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { REVENUE_STATES } from './ports/order-stats.port';

/** Resolved directory filters (FR-CUST-001–004). */
export interface DirectoryFilter {
  q?: string;
  status?: string;
  tag?: string;
  hasOrders?: boolean;
  includeGuests?: boolean;
  registrationFrom?: string;
  registrationTo?: string;
  lastOrderFrom?: string;
  lastOrderTo?: string;
  page: number;
  limit: number;
}

/** A directory row — a registered customer or an order-derived guest contact (BR-CUST-4). */
export interface DirectoryRow {
  customerId: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  orderCount: number;
  totalSpent: string;
  lastOrderAt: string | null;
  isGuest: boolean;
}

/**
 * Directory query (FR-CUST-001–004). Composes AUTH `customers` (identity/status/registration), CUST
 * `customer_tag_assignments` (tag filter), and ORD `orders` (per-row aggregates: paid/collected count,
 * LTV net of refunds, last order). Optionally UNIONs order-derived guest contacts (grouped by guest
 * phone, marked `is_guest`) when `include_guests` is set and no account-only filter (status/tag) excludes
 * them. Read-only over every source (BR-CUST-1); decoupled from other domains' ORM classes.
 */
@Injectable()
export class CustomerDirectoryReader {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async query(f: DirectoryFilter): Promise<{ rows: DirectoryRow[]; total: number }> {
    const params: unknown[] = [];
    const p = (v: unknown): string => {
      params.push(v);
      return `$${params.length}`;
    };

    const rev = p(REVENUE_STATES);

    // ── Registered customers ────────────────────────────────────────────────
    const regWhere: string[] = [];
    if (f.q) {
      const q = p(`%${f.q}%`);
      regWhere.push(`(c.full_name ILIKE ${q} OR c.phone ILIKE ${q} OR c.email ILIKE ${q})`);
    }
    if (f.status) regWhere.push(`c.status = ${p(f.status)}`);
    if (f.registrationFrom) regWhere.push(`c.created_at >= ${p(f.registrationFrom)}`);
    if (f.registrationTo) regWhere.push(`c.created_at <= ${p(f.registrationTo)}`);
    if (f.tag) {
      regWhere.push(
        `EXISTS (SELECT 1 FROM customer_tag_assignments cta JOIN customer_tags t ON t.id = cta.tag_id ` +
          `WHERE cta.customer_id = c.id AND t.key = ${p(f.tag)})`,
      );
    }
    if (f.hasOrders === true) regWhere.push(`COALESCE(agg.order_count, 0) > 0`);
    if (f.hasOrders === false) regWhere.push(`COALESCE(agg.order_count, 0) = 0`);
    if (f.lastOrderFrom) regWhere.push(`agg.last_order_at >= ${p(f.lastOrderFrom)}`);
    if (f.lastOrderTo) regWhere.push(`agg.last_order_at <= ${p(f.lastOrderTo)}`);

    const registeredSql = `
      SELECT c.id::text AS customer_id, c.full_name, c.phone, c.email, c.status,
             COALESCE(agg.order_count, 0)::int AS order_count,
             COALESCE(agg.total_spent, 0)::text AS total_spent,
             agg.last_order_at AS last_order_at,
             false AS is_guest, c.created_at AS created_at
      FROM customers c
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS order_count, SUM(grand_total) AS total_spent,
               MAX(placed_at) AS last_order_at
        FROM orders
        WHERE customer_id IS NOT NULL AND payment_state::text = ANY(${rev})
        GROUP BY customer_id
      ) agg ON agg.customer_id = c.id
      ${regWhere.length ? 'WHERE ' + regWhere.join(' AND ') : ''}`;

    // ── Guest contacts (only when requested and no account-only filter applies) ──
    const includeGuests = f.includeGuests && !f.status && !f.tag && f.hasOrders !== false;
    let guestSql = '';
    if (includeGuests) {
      const gWhere: string[] = [
        `o.customer_id IS NULL`,
        `o.guest_phone IS NOT NULL`,
        `o.payment_state::text = ANY(${rev})`,
      ];
      if (f.q) {
        const gq = p(`%${f.q}%`);
        gWhere.push(`(o.guest_name ILIKE ${gq} OR o.guest_phone ILIKE ${gq} OR o.guest_email ILIKE ${gq})`);
      }
      const gHaving: string[] = [];
      if (f.lastOrderFrom) gHaving.push(`MAX(o.placed_at) >= ${p(f.lastOrderFrom)}`);
      if (f.lastOrderTo) gHaving.push(`MAX(o.placed_at) <= ${p(f.lastOrderTo)}`);
      guestSql = `
        UNION ALL
        SELECT NULL::text AS customer_id, MAX(o.guest_name) AS full_name, o.guest_phone AS phone,
               MAX(o.guest_email) AS email, 'guest' AS status,
               COUNT(*)::int AS order_count, COALESCE(SUM(o.grand_total), 0)::text AS total_spent,
               MAX(o.placed_at) AS last_order_at, true AS is_guest, MIN(o.placed_at) AS created_at
        FROM orders o
        WHERE ${gWhere.join(' AND ')}
        GROUP BY o.guest_phone
        ${gHaving.length ? 'HAVING ' + gHaving.join(' AND ') : ''}`;
    }

    const combined = `${registeredSql}${guestSql}`;

    const countRows: Array<{ total: number }> = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM (${combined}) combined`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const limitP = p(f.limit);
    const offsetP = p((f.page - 1) * f.limit);
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT * FROM (${combined}) combined
       ORDER BY last_order_at DESC NULLS LAST, full_name ASC
       LIMIT ${limitP} OFFSET ${offsetP}`,
      params,
    );

    return {
      total,
      rows: rows.map((r) => ({
        customerId: (r.customer_id as string | null) ?? null,
        fullName: (r.full_name as string | null) ?? null,
        phone: (r.phone as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        status: r.status as string,
        orderCount: Number(r.order_count ?? 0),
        totalSpent: Number(r.total_spent ?? 0).toFixed(2),
        lastOrderAt: r.last_order_at ? (r.last_order_at as Date).toISOString() : null,
        isGuest: r.is_guest as boolean,
      })),
    };
  }

  /** Tag keys per customer for a page of customer ids (one round-trip; FR-CUST-001 row tags). */
  async getTagsFor(customerIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (customerIds.length === 0) return map;
    const rows: Array<{ customer_id: string; key: string }> = await this.dataSource.query(
      `SELECT cta.customer_id::text AS customer_id, t.key AS key
       FROM customer_tag_assignments cta
       JOIN customer_tags t ON t.id = cta.tag_id
       WHERE cta.customer_id = ANY($1)
       ORDER BY t.key ASC`,
      [customerIds],
    );
    for (const r of rows) {
      const list = map.get(r.customer_id) ?? [];
      list.push(r.key);
      map.set(r.customer_id, list);
    }
    return map;
  }
}
