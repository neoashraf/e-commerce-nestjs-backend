import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DELIVERY_ZONES, DeliveryZone } from '../../domain/enums/delivery-zone.enum';
import { DeliveryZoneChargeOrmEntity } from '../../infrastructure/persistence/typeorm/entities/delivery-zone-charge.orm-entity';

/** Resolved BD delivery defaults (SRS 04 §15) used when a zone has no stored row yet. */
const DEFAULTS: Record<
  DeliveryZone,
  { deliveryCharge: string; codSurchargePct: string; codSurchargeFlat: string; freeShippingThreshold: string | null; codEnabled: boolean }
> = {
  [DeliveryZone.INSIDE_DHAKA]: { deliveryCharge: '70.00', codSurchargePct: '0.00', codSurchargeFlat: '0.00', freeShippingThreshold: null, codEnabled: true },
  [DeliveryZone.NEAR_DHAKA]: { deliveryCharge: '90.00', codSurchargePct: '0.00', codSurchargeFlat: '0.00', freeShippingThreshold: null, codEnabled: true },
  [DeliveryZone.OUTSIDE_DHAKA]: { deliveryCharge: '120.00', codSurchargePct: '1.00', codSurchargeFlat: '0.00', freeShippingThreshold: null, codEnabled: true },
};

export interface ZoneCharge {
  zone: DeliveryZone;
  delivery_charge: string;
  cod_surcharge_pct: string;
  cod_surcharge_flat: string;
  free_shipping_threshold: string | null;
  cod_enabled: boolean;
  is_active: boolean;
}

export interface ZoneChargeUpdate {
  zone: DeliveryZone;
  delivery_charge: string;
  cod_surcharge_pct: string;
  cod_surcharge_flat: string;
  free_shipping_threshold: string | null;
  cod_enabled: boolean;
  is_active: boolean;
}

/**
 * Per-zone delivery charge / COD surcharge / free-shipping config (FR-CART-040–043). The checkout quote
 * reads `chargeFor(zone)`; the admin `GET/PUT /admin/delivery-settings` manage the rows. Falls back to
 * the resolved BD defaults (SRS §15) for any zone without a stored row, so quotes are correct before an
 * admin edits settings. (cart-delivery-zone-be deferred this entity to the checkout slice.)
 */
@Injectable()
export class DeliverySettingsService {
  constructor(
    @InjectRepository(DeliveryZoneChargeOrmEntity)
    private readonly charges: Repository<DeliveryZoneChargeOrmEntity>,
  ) {}

  async chargeFor(zone: DeliveryZone): Promise<ZoneCharge> {
    const row = await this.charges.findOne({ where: { zone } });
    if (row) {
      return {
        zone: row.zone,
        delivery_charge: row.deliveryCharge,
        cod_surcharge_pct: row.codSurchargePct,
        cod_surcharge_flat: row.codSurchargeFlat,
        free_shipping_threshold: row.freeShippingThreshold,
        cod_enabled: row.codEnabled,
        is_active: row.isActive,
      };
    }
    const d = DEFAULTS[zone];
    return {
      zone,
      delivery_charge: d.deliveryCharge,
      cod_surcharge_pct: d.codSurchargePct,
      cod_surcharge_flat: d.codSurchargeFlat,
      free_shipping_threshold: d.freeShippingThreshold,
      cod_enabled: d.codEnabled,
      is_active: true,
    };
  }

  async getAll(): Promise<ZoneCharge[]> {
    return Promise.all(DELIVERY_ZONES.map((z) => this.chargeFor(z)));
  }

  async update(zones: ZoneChargeUpdate[]): Promise<void> {
    for (const z of zones) {
      if (Number(z.delivery_charge) < 0) {
        throw new BadRequestException({ code: 'INVALID_CHARGE', message: 'delivery_charge must be ≥ 0.' });
      }
      const pct = Number(z.cod_surcharge_pct);
      if (pct < 0 || pct > 100) {
        throw new BadRequestException({ code: 'INVALID_CHARGE', message: 'cod_surcharge_pct must be 0–100.' });
      }
      let row = await this.charges.findOne({ where: { zone: z.zone } });
      if (!row) row = this.charges.create({ zone: z.zone });
      row.deliveryCharge = Number(z.delivery_charge).toFixed(2);
      row.codSurchargePct = Number(z.cod_surcharge_pct).toFixed(2);
      row.codSurchargeFlat = Number(z.cod_surcharge_flat).toFixed(2);
      row.freeShippingThreshold = z.free_shipping_threshold;
      row.codEnabled = z.cod_enabled;
      row.isActive = z.is_active;
      await this.charges.save(row);
    }
  }
}
