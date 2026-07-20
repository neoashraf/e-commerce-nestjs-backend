import { MfaSettings } from '../entities/mfa-settings.entity';

export interface IMfaSettingsRepository {
  /** The single global policy row (seeded at migration time). */
  get(): Promise<MfaSettings | null>;
  save(settings: MfaSettings): Promise<MfaSettings>;
}

export const MFA_SETTINGS_REPOSITORY = Symbol('IMfaSettingsRepository');
