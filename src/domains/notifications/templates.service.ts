import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { NotificationTemplateEntity } from './entities/notification-template.entity';
import { NotificationTemplateVersionEntity } from './entities/notification-template-version.entity';
import { NotificationChannel } from './notification.enums';
import {
  EventDefinition,
  getAllowedPlaceholders,
  getEventDefinition,
  getPromotionalEventTypes,
} from './event-catalog';
import { computeSmsEncoding, extractPlaceholders, renderTemplate } from './notification-render.util';

export interface ListTemplatesFilter {
  eventType?: string;
  channel?: string;
  locale?: string;
  active?: boolean;
}

export interface TemplateRow {
  id: string;
  eventType: string;
  channel: string;
  locale: string;
  version: number;
  isActive: boolean;
}

export interface ListTemplatesResult {
  rows: TemplateRow[];
  promotionalMissingBnSms: string[];
}

export interface CreateTemplateInput {
  eventType: string;
  channel: string;
  locale: string;
  subject?: string | null;
  body: string;
  adminId: string | null;
}

export interface UpdateTemplateInput {
  subject?: string | null;
  body: string;
  adminId: string | null;
}

export interface PreviewResult {
  renderedSubject: string | null;
  renderedBody: string;
  encoding: 'gsm7' | 'unicode' | null;
  smsSegments: number | null;
}

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(NotificationTemplateEntity)
    private readonly templates: Repository<NotificationTemplateEntity>,
    @InjectRepository(NotificationTemplateVersionEntity)
    private readonly versions: Repository<NotificationTemplateVersionEntity>,
  ) {}

  /** List templates with filters + the promotional missing-bn-SMS warning (FR-NOTIF-010/013). */
  async list(filter: ListTemplatesFilter): Promise<ListTemplatesResult> {
    const qb = this.templates.createQueryBuilder('t');
    if (filter.eventType) qb.andWhere('t.eventType = :eventType', { eventType: filter.eventType });
    if (filter.channel) qb.andWhere('t.channel = :channel', { channel: filter.channel });
    if (filter.locale) qb.andWhere('t.locale = :locale', { locale: filter.locale });
    if (filter.active !== undefined) qb.andWhere('t.isActive = :active', { active: filter.active });
    qb.orderBy('t.eventType', 'ASC').addOrderBy('t.channel', 'ASC').addOrderBy('t.locale', 'ASC');

    const found = await qb.getMany();
    return {
      rows: found.map((t) => ({
        id: t.id,
        eventType: t.eventType,
        channel: t.channel,
        locale: t.locale,
        version: t.version,
        isActive: t.isActive,
      })),
      promotionalMissingBnSms: await this.promotionalEventsMissingBnSms(),
    };
  }

  /** Create a template for an (event_type × channel × locale) (FR-NOTIF-010/011). */
  async create(input: CreateTemplateInput): Promise<{ id: string; version: number; isActive: boolean }> {
    const def = this.requireEvent(input.eventType);
    this.assertChannelAllowed(def, input.channel, input.eventType);
    this.validatePlaceholders(def, input.subject ?? null, input.body);

    const existing = await this.templates.findOne({
      where: {
        eventType: input.eventType,
        channel: input.channel,
        locale: input.locale,
        isActive: true,
      },
    });
    if (existing) {
      throw new ConflictException({
        code: 'TEMPLATE_EXISTS',
        message: `An active template already exists for ${input.eventType}/${input.channel}/${input.locale}`,
      });
    }

    const id = randomUUID();
    await this.templates.manager.transaction(async (tx: EntityManager) => {
      const tpl = tx.create(NotificationTemplateEntity, {
        id,
        eventType: input.eventType,
        channel: input.channel,
        locale: input.locale,
        subject: input.subject ?? null,
        body: input.body,
        version: 1,
        isActive: true,
        isLocked: false,
        updatedByAdminId: input.adminId,
      });
      await tx.save(tpl);
      await this.appendVersion(tx, id, 1, input.subject ?? null, input.body, input.adminId);
    });

    return { id, version: 1, isActive: true };
  }

  /** Update subject/body, bumping `version`; prior versions stay resolvable (FR-NOTIF-012, BR-NOTIF-6). */
  async update(id: string, input: UpdateTemplateInput): Promise<{ id: string; version: number }> {
    const tpl = await this.templates.findOne({ where: { id } });
    if (!tpl) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: `Template ${id} not found` });
    }
    if (tpl.isLocked) {
      throw new ForbiddenException({
        code: 'TEMPLATE_LOCKED',
        message: 'This template is locked and cannot be edited.',
      });
    }
    const def = this.requireEvent(tpl.eventType);
    this.validatePlaceholders(def, input.subject ?? null, input.body);

    const nextVersion = tpl.version + 1;
    await this.templates.manager.transaction(async (tx: EntityManager) => {
      tpl.subject = input.subject ?? null;
      tpl.body = input.body;
      tpl.version = nextVersion;
      tpl.updatedByAdminId = input.adminId;
      await tx.save(tpl);
      await this.appendVersion(tx, id, nextVersion, input.subject ?? null, input.body, input.adminId);
    });

    return { id, version: nextVersion };
  }

  /** Render the current template against sample variables with SMS encoding/segments (FR-NOTIF-014). */
  async preview(id: string, variables: Record<string, string | number>): Promise<PreviewResult> {
    const tpl = await this.templates.findOne({ where: { id } });
    if (!tpl) {
      throw new NotFoundException({ code: 'TEMPLATE_NOT_FOUND', message: `Template ${id} not found` });
    }
    const renderedSubject = tpl.subject ? renderTemplate(tpl.subject, variables) : null;
    const renderedBody = renderTemplate(tpl.body, variables);

    if (tpl.channel === NotificationChannel.SMS) {
      const { encoding, segments } = computeSmsEncoding(renderedBody);
      return { renderedSubject, renderedBody, encoding, smsSegments: segments };
    }
    return { renderedSubject, renderedBody, encoding: null, smsSegments: null };
  }

  /**
   * Resolve the historical content for a sent notification's `template_version` snapshot
   * (BR-NOTIF-6). Returns null if the version was never recorded.
   */
  async getVersion(
    templateId: string,
    version: number,
  ): Promise<NotificationTemplateVersionEntity | null> {
    return this.versions.findOne({ where: { templateId, version } });
  }

  // ---- internals -----------------------------------------------------------

  private requireEvent(eventType: string): EventDefinition {
    const def = getEventDefinition(eventType);
    if (!def) {
      throw new BadRequestException({ code: 'UNKNOWN_EVENT', message: `Unknown event_type: ${eventType}` });
    }
    return def;
  }

  private assertChannelAllowed(def: EventDefinition, channel: string, eventType: string): void {
    if (!def.channels.includes(channel as NotificationChannel)) {
      throw new BadRequestException({
        code: 'CHANNEL_NOT_ALLOWED',
        message: `Channel ${channel} is not allowed for ${eventType}`,
      });
    }
  }

  /** FR-NOTIF-011: only placeholders defined for the event type, and all required ones present. */
  private validatePlaceholders(def: EventDefinition, subject: string | null, body: string): void {
    const used = new Set([
      ...extractPlaceholders(subject ?? ''),
      ...extractPlaceholders(body),
    ]);

    if (!def.allowAnyPlaceholder) {
      const allowed = new Set(getAllowedPlaceholders(def));
      for (const ph of used) {
        if (!allowed.has(ph)) {
          throw new BadRequestException({
            code: 'UNDEFINED_PLACEHOLDER',
            message: `Placeholder {{${ph}}} is not defined for this event type`,
          });
        }
      }
    }

    for (const required of def.requiredPlaceholders) {
      if (!used.has(required)) {
        throw new BadRequestException({
          code: 'MISSING_PLACEHOLDER',
          message: `Required placeholder {{${required}}} is missing`,
        });
      }
    }
  }

  private async appendVersion(
    tx: EntityManager,
    templateId: string,
    version: number,
    subject: string | null,
    body: string,
    adminId: string | null,
  ): Promise<void> {
    const row = tx.create(NotificationTemplateVersionEntity, {
      id: randomUUID(),
      templateId,
      version,
      subject,
      body,
      updatedByAdminId: adminId,
    });
    await tx.save(row);
  }

  /** Promotional event types lacking an active `bn` SMS template (FR-NOTIF-013 warning). */
  private async promotionalEventsMissingBnSms(): Promise<string[]> {
    const promoEvents = getPromotionalEventTypes();
    if (promoEvents.length === 0) return [];

    const present = await this.templates.find({
      where: { channel: NotificationChannel.SMS, locale: 'bn', isActive: true },
      select: ['eventType'],
    });
    const haveBnSms = new Set(present.map((t) => t.eventType));
    return promoEvents.filter((ev) => !haveBnSms.has(ev));
  }
}
