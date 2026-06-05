import {
  AttributeFamily,
  AttributeGroup,
  FamilyAttributeRef,
} from '../../../../domain/entities/attribute-family.entity';
import { AttributeFamilyOrmEntity } from '../entities/attribute-family.orm-entity';
import { AttributeGroupOrmEntity } from '../entities/attribute-group.orm-entity';

/** A joined family_attribute row (FamilyAttribute ⋈ Attribute) used to build group contents. */
export interface JoinedFamilyAttributeRow {
  fa_id: string;
  group_id: string;
  attribute_id: string;
  position: number;
  code: string;
  admin_label: string;
  type: string;
}

export class AttributeFamilyMapper {
  /** Bare family (list shape) — no groups loaded. */
  static toSummary(o: AttributeFamilyOrmEntity): AttributeFamily {
    return new AttributeFamily(o.id, o.code, o.name, o.isDefault, [], o.createdAt, o.updatedAt);
  }

  /** Full family: assemble ordered groups + ordered attributes from joined rows. */
  static toDomain(
    family: AttributeFamilyOrmEntity,
    groups: AttributeGroupOrmEntity[],
    attributeRows: JoinedFamilyAttributeRow[],
  ): AttributeFamily {
    const byGroup = new Map<string, FamilyAttributeRef[]>();
    for (const r of attributeRows) {
      const ref = new FamilyAttributeRef(
        r.fa_id,
        r.attribute_id,
        r.code,
        r.admin_label,
        r.type,
        Number(r.position),
      );
      const list = byGroup.get(r.group_id) ?? [];
      list.push(ref);
      byGroup.set(r.group_id, list);
    }

    const domainGroups = groups.map(
      (g) =>
        new AttributeGroup(
          g.id,
          g.name,
          Number(g.layoutColumn),
          Number(g.position),
          byGroup.get(g.id) ?? [],
        ),
    );

    return new AttributeFamily(
      family.id,
      family.code,
      family.name,
      family.isDefault,
      domainGroups,
      family.createdAt,
      family.updatedAt,
    );
  }
}
