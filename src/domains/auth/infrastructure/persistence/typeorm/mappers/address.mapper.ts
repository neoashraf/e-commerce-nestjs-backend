import { Address } from '../../../../domain/entities/address.entity';
import { AddressOrmEntity } from '../entities/address.orm-entity';

export class AddressMapper {
  static toDomain(o: AddressOrmEntity): Address {
    return new Address(
      o.id,
      o.customerId,
      o.recipientName,
      o.recipientPhone,
      o.addressLine,
      o.area,
      o.district,
      o.division,
      o.postalCode,
      o.deliveryZone,
      o.isDefault,
      o.lastUsedAt ? new Date(o.lastUsedAt) : null,
      new Date(o.createdAt),
      new Date(o.updatedAt),
      o.deletedAt ? new Date(o.deletedAt) : null,
    );
  }

  static toOrm(d: Address): AddressOrmEntity {
    const o = new AddressOrmEntity();
    o.id = d.id;
    o.customerId = d.customerId;
    o.recipientName = d.recipientName;
    o.recipientPhone = d.recipientPhone;
    o.addressLine = d.addressLine;
    o.area = d.area;
    o.district = d.district;
    o.division = d.division;
    o.postalCode = d.postalCode;
    o.deliveryZone = d.deliveryZone;
    o.isDefault = d.isDefault;
    o.lastUsedAt = d.lastUsedAt;
    o.deletedAt = d.deletedAt;
    return o;
  }
}
