import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add `customer_note` column to `orders` (FR-ORD-072a, BR-ORD-13). Nullable text; written once at
 * checkout placement, immutable thereafter. No backfill — existing orders have `null`.
 */
export class AddCustomerNoteToOrders1781900000001 implements MigrationInterface {
  name = 'AddCustomerNoteToOrders1781900000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customer_note" text NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_note"`);
  }
}
