import { OtpChallenge } from '../../../../domain/entities/otp-challenge.entity';
import { OtpPurpose } from '../../../../domain/enums/otp-purpose.enum';
import { OtpChallengeOrmEntity } from '../entities/otp-challenge.orm-entity';

export class OtpChallengeMapper {
  static toDomain(o: OtpChallengeOrmEntity): OtpChallenge {
    return new OtpChallenge(
      o.id,
      o.phone,
      o.otpHash,
      o.purpose as OtpPurpose,
      o.attempts,
      new Date(o.expiresAt),
      o.consumedAt ? new Date(o.consumedAt) : null,
      new Date(o.createdAt),
    );
  }

  static toOrm(d: OtpChallenge): OtpChallengeOrmEntity {
    const o = new OtpChallengeOrmEntity();
    o.id = d.id;
    o.phone = d.phone;
    o.otpHash = d.otpHash;
    o.purpose = d.purpose;
    o.attempts = d.attempts;
    o.expiresAt = d.expiresAt;
    o.consumedAt = d.consumedAt;
    return o;
  }
}
