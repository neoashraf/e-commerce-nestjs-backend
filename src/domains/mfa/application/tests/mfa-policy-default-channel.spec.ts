import { MfaChannel } from '../../domain/enums/mfa-channel.enum';
import { MfaEnforcement } from '../../domain/enums/mfa-enforcement.enum';
import { MfaSettings } from '../../domain/entities/mfa-settings.entity';
import { resolveChallengeChannel } from '../services/mfa-channels';

describe('MFA — default_channel policy + resolution (FR-MFA-012/036)', () => {
  const settings = (over: Partial<{ sms: boolean; email: boolean; def: MfaChannel }> = {}) =>
    new MfaSettings(
      's1',
      over.sms ?? true,
      over.email ?? true,
      MfaEnforcement.OPTIONAL,
      300,
      60,
      5,
      null,
      new Date(),
      new Date(),
      over.def ?? MfaChannel.EMAIL,
    );

  it('defaults default_channel to email', () => {
    const s = new MfaSettings('s1', false, true, MfaEnforcement.OPTIONAL, 300, 60, 5, null, new Date(), new Date());
    expect(s.defaultChannel).toBe(MfaChannel.EMAIL);
  });

  it('persists a default_channel change referencing an enabled channel (AC5)', () => {
    const s = settings();
    s.update({ defaultChannel: MfaChannel.SMS }, 'admin1', new Date());
    expect(s.defaultChannel).toBe(MfaChannel.SMS);
  });

  it('rejects a default_channel pointing at a disabled channel (AC5, FR-MFA-036)', () => {
    const s = settings({ sms: false });
    expect(() => s.update({ defaultChannel: MfaChannel.SMS }, 'admin1', new Date())).toThrow(
      'MFA_DEFAULT_CHANNEL_DISABLED',
    );
    expect(s.defaultChannel).toBe(MfaChannel.EMAIL); // unchanged
  });

  it('rejects disabling the channel the current default points at', () => {
    const s = settings({ def: MfaChannel.SMS });
    expect(() => s.update({ smsEnabled: false }, 'admin1', new Date())).toThrow(
      'MFA_DEFAULT_CHANNEL_DISABLED',
    );
  });

  it('resolution: saved preference outranks default_channel (AC5, FR-MFA-012)', () => {
    const s = settings({ def: MfaChannel.EMAIL });
    const eligible = [MfaChannel.EMAIL, MfaChannel.SMS];
    expect(resolveChallengeChannel(s, MfaChannel.SMS, eligible)).toBe(MfaChannel.SMS);
  });

  it('resolution: no preference + both eligible → default_channel (AC5)', () => {
    const s = settings({ def: MfaChannel.SMS });
    const eligible = [MfaChannel.EMAIL, MfaChannel.SMS];
    expect(resolveChallengeChannel(s, null, eligible)).toBe(MfaChannel.SMS);
  });

  it('resolution: default not eligible → the eligible channel', () => {
    const s = settings({ def: MfaChannel.SMS });
    expect(resolveChallengeChannel(s, null, [MfaChannel.EMAIL])).toBe(MfaChannel.EMAIL);
  });
});
