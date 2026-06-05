import { Customer } from '../../../../domain/entities/customer.entity';
import { CustomerStatus } from '../../../../domain/enums/customer-status.enum';
import { Gender } from '../../../../domain/enums/gender.enum';
import { CustomerOrmEntity } from '../entities/customer.orm-entity';

export class CustomerMapper {
  static toDomain(o: CustomerOrmEntity): Customer {
    return new Customer(
      o.id,
      o.fullName,
      o.phone,
      o.email,
      o.passwordHash,
      o.isLightweight,
      o.phoneVerified,
      o.emailVerified,
      o.gender ? (o.gender as Gender) : null,
      o.dateOfBirth ? new Date(o.dateOfBirth) : null,
      o.promoSmsOptIn,
      o.promoEmailOptIn,
      o.status as CustomerStatus,
      o.lastLoginAt ? new Date(o.lastLoginAt) : null,
      new Date(o.createdAt),
      new Date(o.updatedAt),
      o.deletedAt ? new Date(o.deletedAt) : null,
    );
  }

  static toOrm(d: Customer): CustomerOrmEntity {
    const o = new CustomerOrmEntity();
    o.id = d.id;
    o.fullName = d.fullName;
    o.phone = d.phone;
    o.email = d.email;
    o.passwordHash = d.passwordHash;
    o.isLightweight = d.isLightweight;
    o.phoneVerified = d.phoneVerified;
    o.emailVerified = d.emailVerified;
    o.gender = d.gender;
    o.dateOfBirth = d.dateOfBirth;
    o.promoSmsOptIn = d.promoSmsOptIn;
    o.promoEmailOptIn = d.promoEmailOptIn;
    o.status = d.status;
    o.lastLoginAt = d.lastLoginAt;
    o.deletedAt = d.deletedAt;
    return o;
  }
}
