import { Category } from '../../../../domain/entities/category.entity';
import { CategoryFilterableAttribute } from '../../../../domain/entities/category-filterable-attribute.entity';
import { DisplayMode } from '../../../../domain/enums/display-mode.enum';
import { CategoryOrmEntity } from '../entities/category.orm-entity';

/** A joined filterable-attribute row (link position + the attribute's `code`). */
export interface JoinedFilterableAttributeRow {
  attribute_id: string;
  code: string;
  position: number;
}

/** Converts between the `categories` ORM rows and the pure domain `Category`. */
export class CategoryMapper {
  static toDomain(o: CategoryOrmEntity, filterable: JoinedFilterableAttributeRow[]): Category {
    const refs = filterable
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((f) => new CategoryFilterableAttribute(f.attribute_id, f.code, f.position));

    return new Category(
      o.id,
      o.parentId ?? null,
      o.name,
      o.slug,
      o.description ?? null,
      o.imageUrl ?? null,
      o.logoUrl ?? null,
      o.bannerUrl ?? null,
      o.displayMode as DisplayMode,
      o.position,
      o.isPublished,
      o.showInMenu,
      o.level,
      o.slugLocked,
      o.metaTitle ?? null,
      o.metaKeywords ?? null,
      o.metaDescription ?? null,
      refs,
      o.createdAt,
      o.updatedAt,
      o.deletedAt ?? null,
    );
  }
}
