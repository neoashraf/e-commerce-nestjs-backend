import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ChannelProviderConfigEntity } from './entities/channel-provider-config.entity';
import { NotificationChannel } from './notification.enums';
import { EmailSettingsDto, SmsSettingsDto, UpdateSettingsDto } from './dto/update-settings.dto';

/** SMS channel config, snake_case, with the `credentials_ref` pointer but never raw secrets. */
export interface SmsSettingsView {
  provider_name: string | null;
  masked_sender_id: string | null;
  non_masking_sender: string | null;
  credentials_ref: string | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

/** Email channel config, snake_case, with the `credentials_ref` pointer but never raw secrets. */
export interface EmailSettingsView {
  provider_name: string | null;
  transactional_from: string | null;
  credentials_ref: string | null;
}

export interface SettingsView {
  sms: SmsSettingsView;
  email: EmailSettingsView;
}

/**
 * Provider settings surface (FR-NOTIF-063): read/update the SMS + email `ChannelProviderConfig`.
 * `GET` exposes only the `credentials_ref` pointer — raw credentials are never stored or returned
 * here (NFR security, §14). Updates apply to future sends; in-flight retries keep their captured
 * config (§12.12) because the dispatch retry loop does not re-read config mid-delivery.
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(ChannelProviderConfigEntity)
    private readonly configs: Repository<ChannelProviderConfigEntity>,
  ) {}

  async getSettings(): Promise<SettingsView> {
    const sms = await this.configs.findOne({ where: { channel: NotificationChannel.SMS } });
    const email = await this.configs.findOne({ where: { channel: NotificationChannel.EMAIL } });
    return {
      sms: {
        provider_name: sms?.providerName ?? null,
        masked_sender_id: sms?.maskedSenderId ?? null,
        non_masking_sender: sms?.nonMaskingSender ?? null,
        credentials_ref: sms?.credentialsRef ?? null,
        quiet_hours_start: sms?.quietHoursStart ?? null,
        quiet_hours_end: sms?.quietHoursEnd ?? null,
      },
      email: {
        provider_name: email?.providerName ?? null,
        transactional_from: email?.transactionalFrom ?? null,
        credentials_ref: email?.credentialsRef ?? null,
      },
    };
  }

  async updateSettings(dto: UpdateSettingsDto): Promise<{ updated: boolean }> {
    if (dto.sms) await this.upsertSms(dto.sms);
    if (dto.email) await this.upsertEmail(dto.email);
    return { updated: true };
  }

  private async upsertSms(input: SmsSettingsDto): Promise<void> {
    const entity = await this.loadOrCreate(NotificationChannel.SMS);
    if (input.provider_name !== undefined) entity.providerName = input.provider_name;
    if (input.masked_sender_id !== undefined) entity.maskedSenderId = input.masked_sender_id;
    if (input.non_masking_sender !== undefined) entity.nonMaskingSender = input.non_masking_sender;
    if (input.credentials_ref !== undefined) entity.credentialsRef = input.credentials_ref;
    if (input.quiet_hours_start !== undefined) entity.quietHoursStart = input.quiet_hours_start;
    if (input.quiet_hours_end !== undefined) entity.quietHoursEnd = input.quiet_hours_end;
    await this.configs.save(entity);
  }

  private async upsertEmail(input: EmailSettingsDto): Promise<void> {
    const entity = await this.loadOrCreate(NotificationChannel.EMAIL);
    if (input.provider_name !== undefined) entity.providerName = input.provider_name;
    if (input.transactional_from !== undefined) entity.transactionalFrom = input.transactional_from;
    if (input.credentials_ref !== undefined) entity.credentialsRef = input.credentials_ref;
    await this.configs.save(entity);
  }

  private async loadOrCreate(channel: NotificationChannel): Promise<ChannelProviderConfigEntity> {
    const existing = await this.configs.findOne({ where: { channel } });
    if (existing) return existing;
    return this.configs.create({ id: randomUUID(), channel, isActive: true });
  }
}
