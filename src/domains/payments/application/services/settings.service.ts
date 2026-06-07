import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GatewayEnvironment, PaymentMethod } from '../../domain/payment-enums';
import { GatewayConfigOrmEntity } from '../../infrastructure/persistence/typeorm/entities/gateway-config.orm-entity';

/** A single method's settings as returned by GET (never includes the raw secret). */
export interface GatewaySettingsView {
  environment: GatewayEnvironment | null;
  credentials_ref: string | null;
  is_enabled: boolean;
}

export interface GatewaySettingsUpdate {
  environment?: GatewayEnvironment;
  credentials_ref?: string | null;
  is_enabled?: boolean;
}

/**
 * Gateway settings (FR-PAY-060/061). `GET /admin/payment-settings` returns the per-method
 * environment + `credentials_ref` + enable flag — **never** the raw secret (BR-PAY-7). `PUT` upserts.
 * `isMethodEnabled` is consulted by initiate so a disabled method rejects placement (FR-PAY-061). COD
 * is always available unless explicitly disabled.
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(GatewayConfigOrmEntity)
    private readonly configs: Repository<GatewayConfigOrmEntity>,
  ) {}

  /** Full settings view for all methods (no secrets). */
  async getAll(): Promise<Record<string, GatewaySettingsView>> {
    const rows = await this.configs.find();
    const byMethod = new Map(rows.map((r) => [r.method, r]));
    const view: Record<string, GatewaySettingsView> = {};
    for (const method of Object.values(PaymentMethod)) {
      const row = byMethod.get(method);
      view[method] = {
        environment: row?.environment ?? null,
        credentials_ref: row?.credentialsRef ?? null,
        is_enabled: row?.isEnabled ?? (method === PaymentMethod.COD),
      };
    }
    return view;
  }

  /** Upsert one or more methods' settings. */
  async update(updates: Partial<Record<PaymentMethod, GatewaySettingsUpdate>>): Promise<void> {
    for (const method of Object.keys(updates) as PaymentMethod[]) {
      const patch = updates[method];
      if (!patch) continue;
      let row = await this.configs.findOne({ where: { method } });
      if (!row) row = this.configs.create({ method });
      if (patch.environment !== undefined) row.environment = patch.environment;
      if (patch.credentials_ref !== undefined) row.credentialsRef = patch.credentials_ref;
      if (patch.is_enabled !== undefined) row.isEnabled = patch.is_enabled;
      await this.configs.save(row);
    }
  }

  /** Whether a method is currently offered at checkout (FR-PAY-061). COD defaults on. */
  async isMethodEnabled(method: PaymentMethod): Promise<boolean> {
    const row = await this.configs.findOne({ where: { method } });
    if (!row) return method === PaymentMethod.COD;
    return row.isEnabled;
  }
}
