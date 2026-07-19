import { MfaSettings } from '../../../../domain/entities/mfa-settings.entity';
import { MfaChannel } from '../../../../domain/enums/mfa-channel.enum';
import { MfaEnforcement } from '../../../../domain/enums/mfa-enforcement.enum';
import { MfaSettingsOrmEntity } from '../entities/mfa-settings.orm-entity';

export class MfaSettingsMapper {
  static toDomain(o: MfaSettingsOrmEntity): MfaSettings {
    return new MfaSettings(
      o.id,
      o.smsEnabled,
      o.emailEnabled,
      o.enforcementMode as MfaEnforcement,
      o.otpTtlSeconds,
      o.resendCooldownSeconds,
      o.maxAttempts,
      o.updatedBy ?? null,
      new Date(o.createdAt),
      new Date(o.updatedAt),
      o.defaultChannel as MfaChannel,
    );
  }

  static toOrm(d: MfaSettings): MfaSettingsOrmEntity {
    const o = new MfaSettingsOrmEntity();
    o.id = d.id;
    o.smsEnabled = d.smsEnabled;
    o.emailEnabled = d.emailEnabled;
    o.enforcementMode = d.enforcementMode;
    o.defaultChannel = d.defaultChannel;
    o.otpTtlSeconds = d.otpTtlSeconds;
    o.resendCooldownSeconds = d.resendCooldownSeconds;
    o.maxAttempts = d.maxAttempts;
    o.updatedBy = d.updatedBy;
    return o;
  }
}
