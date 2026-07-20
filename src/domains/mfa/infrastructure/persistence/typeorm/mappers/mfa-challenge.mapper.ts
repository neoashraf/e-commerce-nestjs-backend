import { MfaChallenge } from '../../../../domain/entities/mfa-challenge.entity';
import { MfaChannel } from '../../../../domain/enums/mfa-channel.enum';
import { MfaChallengePurpose } from '../../../../domain/enums/mfa-challenge-purpose.enum';
import { MfaChallengeOrmEntity } from '../entities/mfa-challenge.orm-entity';

export class MfaChallengeMapper {
  static toDomain(o: MfaChallengeOrmEntity): MfaChallenge {
    return new MfaChallenge(
      o.id,
      o.customerId,
      o.purpose as MfaChallengePurpose,
      o.channel as MfaChannel,
      o.destination,
      o.otpHash,
      o.attempts,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: MfaChallenge): MfaChallengeOrmEntity {
    const o = new MfaChallengeOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.purpose = d.purpose;
    o.channel = d.channel;
    o.destination = d.destination;
    o.otpHash = d.otpHash;
    o.attempts = d.attempts;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
