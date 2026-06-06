import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AdminRecipient, IAdminDirectory } from '../../application/ports/admin-directory.port';

/**
 * Read-only RBAC adapter for RPT digests. Resolves admin recipient ids to `{ id, email, status }` via a
 * single parameterised query over `admin_users` (soft-deleted rows excluded) — read-side only, decoupled
 * from RBAC's ORM classes (table/column names only).
 */
@Injectable()
export class AdminDirectoryAdapter implements IAdminDirectory {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resolve(adminIds: string[]): Promise<AdminRecipient[]> {
    if (adminIds.length === 0) return [];
    const rows = await this.dataSource.query<Array<{ id: string; email: string | null; status: string }>>(
      `SELECT "id", "email", "status" FROM "admin_users"
        WHERE "id" = ANY($1::uuid[]) AND "deleted_at" IS NULL`,
      [adminIds],
    );
    return rows.map((r) => ({ id: r.id, email: r.email, status: r.status }));
  }
}
