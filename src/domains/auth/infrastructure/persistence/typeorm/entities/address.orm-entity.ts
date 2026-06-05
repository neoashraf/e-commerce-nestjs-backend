import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('addresses')
@Index(['customerId'])
export class AddressOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'recipient_name', length: 120 })
  recipientName: string;

  @Column({ name: 'recipient_phone', length: 16 })
  recipientPhone: string;

  @Column({ name: 'address_line', length: 255 })
  addressLine: string;

  @Column({ length: 120 })
  area: string;

  @Column({ length: 80 })
  district: string;

  @Column({ length: 80 })
  division: string;

  @Column({ name: 'postal_code', length: 10, type: 'varchar', nullable: true })
  postalCode: string | null;

  @Column({ name: 'delivery_zone', length: 20 })
  deliveryZone: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
