import { TwofaChallenge } from '../../../../domain/entities/twofa-challenge.entity';
import { TwofaChannel } from '../../../../domain/enums/twofa-channel.enum';
import { TwofaPurpose } from '../../../../domain/enums/twofa-purpose.enum';
import { TwofaChallengeOrmEntity } from '../entities/twofa-challenge.orm-entity';

export class TwofaChallengeMapper {
  static toDomain(o: TwofaChallengeOrmEntity): TwofaChallenge {
    return new TwofaChallenge(
      o.id,
      o.adminUserId,
      o.otpHash,
      o.channel as TwofaChannel,
      o.rememberDevice,
      o.attempts,
      o.expiresAt,
      o.consumedAt ?? null,
      o.createdAt,
      o.purpose as TwofaPurpose,
    );
  }

  static toOrm(d: TwofaChallenge): TwofaChallengeOrmEntity {
    const o = new TwofaChallengeOrmEntity();
    o.id = d.id;
    o.adminUserId = d.adminUserId;
    o.otpHash = d.otpHash;
    o.channel = d.channel;
    o.rememberDevice = d.rememberDevice;
    o.purpose = d.purpose;
    o.attempts = d.attempts;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
