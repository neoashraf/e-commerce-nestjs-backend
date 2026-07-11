import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MFA_CONFIG, MfaConfig } from '../../application/ports/mfa-config.port';

export const mfaConfigProvider: Provider = {
  provide: MFA_CONFIG,
  inject: [ConfigService],
  useFactory: (config: ConfigService): MfaConfig => ({
    resendHourlyCap: Number(config.get<string>('MFA_RESEND_HOURLY_CAP') ?? 5),
    preAuthTtlSeconds: Number(config.get<string>('MFA_PRE_AUTH_TTL') ?? 300),
  }),
};
