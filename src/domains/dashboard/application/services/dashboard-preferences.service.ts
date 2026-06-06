import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DashboardPeriodPreset } from '../../domain/dashboard-period';
import { isKnownWidgetKey } from '../../domain/widget-catalog';
import { DashboardPreferenceOrmEntity } from '../../infrastructure/persistence/typeorm/entities/dashboard-preference.orm-entity';

/** Resolved preference view (snake_case, contract-shaped). */
export interface DashboardPreferenceView {
  default_period: string;
  widget_order: string[] | null;
  hidden_widgets: string[] | null;
}

export interface UpdatePreferenceInput {
  default_period?: DashboardPeriodPreset;
  widget_order?: string[];
  hidden_widgets?: string[];
}

const DEFAULT_PERIOD = DashboardPeriodPreset.LAST_7D;

/**
 * Per-admin dashboard layout preferences (optional — SRS 10 §8, FR-DASH-031). One row per admin;
 * `widget_order`/`hidden_widgets` may only reference known widget keys (§11 — unknown key → `400`).
 */
@Injectable()
export class DashboardPreferencesService {
  constructor(
    @InjectRepository(DashboardPreferenceOrmEntity)
    private readonly repo: Repository<DashboardPreferenceOrmEntity>,
  ) {}

  /** Current preference for the admin, or the system defaults when none is stored. */
  async get(adminUserId: string): Promise<DashboardPreferenceView> {
    const row = await this.repo.findOne({ where: { adminUserId } });
    if (!row) {
      return { default_period: DEFAULT_PERIOD, widget_order: null, hidden_widgets: null };
    }
    return {
      default_period: row.defaultPeriod,
      widget_order: row.widgetOrder,
      hidden_widgets: row.hiddenWidgets,
    };
  }

  /** Upsert the admin's preference after validating any referenced widget keys (§11). */
  async update(adminUserId: string, input: UpdatePreferenceInput): Promise<DashboardPreferenceView> {
    this.assertKnownWidgets(input.widget_order);
    this.assertKnownWidgets(input.hidden_widgets);

    const existing = await this.repo.findOne({ where: { adminUserId } });
    const entity = existing ?? this.repo.create({ adminUserId });
    if (input.default_period !== undefined) entity.defaultPeriod = input.default_period;
    if (input.widget_order !== undefined) entity.widgetOrder = input.widget_order;
    if (input.hidden_widgets !== undefined) entity.hiddenWidgets = input.hidden_widgets;
    if (!existing && entity.defaultPeriod === undefined) entity.defaultPeriod = DEFAULT_PERIOD;

    const saved = await this.repo.save(entity);
    return {
      default_period: saved.defaultPeriod,
      widget_order: saved.widgetOrder,
      hidden_widgets: saved.hiddenWidgets,
    };
  }

  private assertKnownWidgets(keys: string[] | undefined): void {
    if (!keys) return;
    const unknown = keys.filter((key) => !isKnownWidgetKey(key));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Unknown widget key(s): ${unknown.join(', ')}.`,
      });
    }
  }
}
