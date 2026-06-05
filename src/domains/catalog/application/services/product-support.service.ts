import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ATTRIBUTE_FAMILY_REPOSITORY,
  IAttributeFamilyRepository,
} from '../../domain/repositories/attribute-family.repository.interface';
import {
  ATTRIBUTE_REPOSITORY,
  IAttributeRepository,
} from '../../domain/repositories/attribute.repository.interface';
import { Attribute } from '../../domain/entities/attribute.entity';
import { ProductOrmEntity } from '../../infrastructure/persistence/typeorm/entities/product.orm-entity';

/**
 * Shared product helpers reused by the products service: unique-slug generation (numeric-suffix
 * collision handling, FR-CAT-011/§12.6) and family-attribute resolution for EAV validation +
 * required-attribute publish checks.
 */
@Injectable()
export class ProductSupportService {
  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
    @Inject(ATTRIBUTE_FAMILY_REPOSITORY)
    private readonly families: IAttributeFamilyRepository,
    @Inject(ATTRIBUTE_REPOSITORY)
    private readonly attributes: IAttributeRepository,
  ) {}

  /** Slugify a name to a URL key (lowercase, ascii-ish, hyphenated). */
  slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9ঀ-৿]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 190);
  }

  /** Generate a unique slug, appending `-2`, `-3`… on collision (incl. soft-deleted rows). */
  async generateUniqueSlug(name: string, excludeId?: string): Promise<string> {
    const base = this.slugify(name) || 'product';
    let candidate = base;
    let suffix = 1;
    while (await this.slugExists(candidate, excludeId)) {
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }
    return candidate;
  }

  async slugExists(slug: string, excludeId?: string): Promise<boolean> {
    const qb = this.products
      .createQueryBuilder('p')
      .withDeleted()
      .where('p.slug = :slug', { slug });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  async skuExists(sku: string, excludeId?: string): Promise<boolean> {
    const qb = this.products.createQueryBuilder('p').withDeleted().where('p.sku = :sku', { sku });
    if (excludeId) qb.andWhere('p.id != :excludeId', { excludeId });
    return (await qb.getCount()) > 0;
  }

  /** Resolve a family's full attribute set (by code), loaded with options for EAV validation. */
  async getFamilyAttributes(familyId: string): Promise<Map<string, Attribute>> {
    const family = await this.families.findById(familyId);
    const map = new Map<string, Attribute>();
    if (!family) return map;

    const codes = new Set<string>();
    for (const group of family.groups) {
      for (const ref of group.attributes) codes.add(ref.code);
    }
    for (const code of codes) {
      const attribute = await this.attributes.findByCode(code);
      if (attribute) map.set(code, attribute);
    }
    return map;
  }
}
