import { CustomerMfa } from '../../../../domain/entities/customer-mfa.entity';
import { MfaChannel } from '../../../../domain/enums/mfa-channel.enum';
import { CustomerMfaOrmEntity } from '../entities/customer-mfa.orm-entity';

export class CustomerMfaMapper {
  static toDomain(o: CustomerMfaOrmEntity): CustomerMfa {
    return new CustomerMfa(
      o.customerId,
      o.enabled,
      o.preferredChannel ? (o.preferredChannel as MfaChannel) : null,
      o.enabledAt ? new Date(o.enabledAt) : null,
      new Date(o.createdAt),
      new Date(o.updatedAt),
    );
  }

  static toOrm(d: CustomerMfa): CustomerMfaOrmEntity {
    const o = new CustomerMfaOrmEntity();
    o.customerId = d.customerId;
    o.enabled = d.enabled;
    o.preferredChannel = d.preferredChannel;
    o.enabledAt = d.enabledAt;
    return o;
  }
}
