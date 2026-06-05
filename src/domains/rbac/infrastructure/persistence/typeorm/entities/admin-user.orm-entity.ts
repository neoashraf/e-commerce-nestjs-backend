import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('admin_users')
@Index(['roleId'])
export class AdminUserOrmEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ length: 160 })
  email: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  phone: string | null;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  passwordHash: string | null;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'twofa_enabled', default: false })
  twofaEnabled: boolean;

  @Column({ name: 'twofa_channel', type: 'varchar', length: 10, nullable: true })
  twofaChannel: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ name: 'failed_login_attempts', type: 'int', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
