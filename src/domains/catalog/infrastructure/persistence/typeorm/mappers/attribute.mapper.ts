import { Attribute } from '../../../../domain/entities/attribute.entity';
import { AttributeOption } from '../../../../domain/entities/attribute-option.entity';
import { AttributeType } from '../../../../domain/enums/attribute-type.enum';
import { SwatchType } from '../../../../domain/enums/swatch-type.enum';
import { AttributeOrmEntity } from '../entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from '../entities/attribute-option.orm-entity';

/** Converts between the `attributes` ORM rows and the pure domain `Attribute`. */
export class AttributeMapper {
  static optionToDomain(o: AttributeOptionOrmEntity): AttributeOption {
    return new AttributeOption(
      o.id,
      o.value,
      o.label,
      o.swatchType ? (o.swatchType as SwatchType) : null,
      o.swatchValue ?? null,
      o.position,
    );
  }

  static toDomain(o: AttributeOrmEntity): Attribute {
    const options = (o.options ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((opt) => AttributeMapper.optionToDomain(opt));
    return new Attribute(
      o.id,
      o.code,
      o.adminLabel,
      o.type as AttributeType,
      o.isRequired,
      o.isUnique,
      o.isFilterable,
      o.isConfigurable,
      o.isVisibleOnFront,
      o.isComparable,
      o.isUserDefined,
      o.validation ?? null,
      o.defaultValue ?? null,
      o.position,
      o.isActive,
      options,
      o.createdAt,
      o.updatedAt,
    );
  }
}
