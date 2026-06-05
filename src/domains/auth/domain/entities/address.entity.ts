/**
 * A customer's saved delivery address (SRS 01 §5.6, §8 Address). Pure domain entity — no
 * TypeORM/Nest decorators. `deliveryZone` is the resolved zone string (`inside_dhaka` /
 * `near_dhaka` / `outside_dhaka`, owned by CART) used downstream for delivery charges; it is
 * resolved by CART's zone resolver, never derived here. Exactly one address per customer is the
 * default at any time (BR-AUTH-6).
 */
export class Address {
  constructor(
    public readonly id: string,
    public readonly customerId: string,
    public recipientName: string,
    public recipientPhone: string,
    public addressLine: string,
    public area: string,
    public district: string,
    public division: string,
    public postalCode: string | null,
    public deliveryZone: string,
    public isDefault: boolean,
    public lastUsedAt: Date | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
    public deletedAt: Date | null,
  ) {}

  /** Factory for a newly created address (FR-AUTH-050). `lastUsedAt` seeds to now so a fresh
   * address is a sensible default-promotion candidate (FR-AUTH-053). */
  static create(
    id: string,
    customerId: string,
    props: {
      recipientName: string;
      recipientPhone: string;
      addressLine: string;
      area: string;
      district: string;
      division: string;
      postalCode: string | null;
      deliveryZone: string;
    },
    isDefault: boolean,
    now: Date,
  ): Address {
    return new Address(
      id,
      customerId,
      props.recipientName,
      props.recipientPhone,
      props.addressLine,
      props.area,
      props.district,
      props.division,
      props.postalCode,
      props.deliveryZone,
      isDefault,
      now,
      now,
      now,
      null,
    );
  }

  /** Promote this address to the default (FR-AUTH-052). Caller must clear the prior default first. */
  markDefault(now: Date): void {
    this.isDefault = true;
    this.updatedAt = now;
  }
}
