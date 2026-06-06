import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CategoryOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/category.orm-entity';
import { ProductOrmEntity } from '../../../catalog/infrastructure/persistence/typeorm/entities/product.orm-entity';
import { RedirectTargetType } from '../../domain/search-enums';
import { normalizeQuery } from '../../domain/query-normalize';
import { SearchRedirectOrmEntity } from '../../infrastructure/persistence/typeorm/entities/search-redirect.orm-entity';
import { SearchSynonymOrmEntity } from '../../infrastructure/persistence/typeorm/entities/search-synonym.orm-entity';

export interface CreateSynonymInput {
  terms: string[];
  is_active?: boolean;
}
export interface CreateRedirectInput {
  query_pattern: string;
  target_type: RedirectTargetType;
  target_ref: string;
  is_active?: boolean;
}

/**
 * Synonym + redirect storage/CRUD (FR-SRCH-011/013; §11 validation). Lives here because the query path
 * reads it; the admin UI is out of scope. Validation: a synonym group needs ≥2 non-empty terms; a
 * redirect `query_pattern` is unique among active rules and its `target_ref` must resolve
 * (category/product slug). Terms + patterns are stored normalized so query-time matching is direct.
 */
@Injectable()
export class SearchConfigService {
  constructor(
    @InjectRepository(SearchSynonymOrmEntity)
    private readonly synonyms: Repository<SearchSynonymOrmEntity>,
    @InjectRepository(SearchRedirectOrmEntity)
    private readonly redirects: Repository<SearchRedirectOrmEntity>,
    @InjectRepository(CategoryOrmEntity)
    private readonly categories: Repository<CategoryOrmEntity>,
    @InjectRepository(ProductOrmEntity)
    private readonly products: Repository<ProductOrmEntity>,
  ) {}

  // --- Synonyms ---

  listSynonyms(): Promise<SearchSynonymOrmEntity[]> {
    return this.synonyms.find({ order: { createdAt: 'DESC' } });
  }

  async createSynonym(input: CreateSynonymInput): Promise<SearchSynonymOrmEntity> {
    const terms = this.normalizeTerms(input.terms);
    if (terms.length < 2) {
      throw new BadRequestException({
        code: 'INVALID_SYNONYM',
        message: 'A synonym group needs at least 2 non-empty terms.',
      });
    }
    return this.synonyms.save(
      this.synonyms.create({ terms, isActive: input.is_active ?? true }),
    );
  }

  async updateSynonym(id: string, input: Partial<CreateSynonymInput>): Promise<SearchSynonymOrmEntity> {
    const row = await this.synonyms.findOne({ where: { id } });
    if (!row) throw this.notFound('SYNONYM_NOT_FOUND', id);
    if (input.terms) {
      const terms = this.normalizeTerms(input.terms);
      if (terms.length < 2) {
        throw new BadRequestException({
          code: 'INVALID_SYNONYM',
          message: 'A synonym group needs at least 2 non-empty terms.',
        });
      }
      row.terms = terms;
    }
    if (input.is_active !== undefined) row.isActive = input.is_active;
    return this.synonyms.save(row);
  }

  async deleteSynonym(id: string): Promise<void> {
    const res = await this.synonyms.delete({ id });
    if (!res.affected) throw this.notFound('SYNONYM_NOT_FOUND', id);
  }

  /** Active synonym groups, terms normalized — read by the query path for expansion. */
  async activeSynonymGroups(): Promise<string[][]> {
    const rows = await this.synonyms.find({ where: { isActive: true } });
    return rows.map((r) => r.terms);
  }

  // --- Redirects ---

  listRedirects(): Promise<SearchRedirectOrmEntity[]> {
    return this.redirects.find({ order: { createdAt: 'DESC' } });
  }

  async createRedirect(input: CreateRedirectInput): Promise<SearchRedirectOrmEntity> {
    const pattern = normalizeQuery(input.query_pattern);
    if (pattern === '') {
      throw new BadRequestException({ code: 'INVALID_REDIRECT', message: 'query_pattern is required.' });
    }
    await this.assertPatternFree(pattern, null, input.is_active ?? true);
    await this.assertTargetResolves(input.target_type, input.target_ref);
    return this.redirects.save(
      this.redirects.create({
        queryPattern: pattern,
        targetType: input.target_type,
        targetRef: input.target_ref,
        isActive: input.is_active ?? true,
      }),
    );
  }

  async updateRedirect(id: string, input: Partial<CreateRedirectInput>): Promise<SearchRedirectOrmEntity> {
    const row = await this.redirects.findOne({ where: { id } });
    if (!row) throw this.notFound('REDIRECT_NOT_FOUND', id);
    const nextActive = input.is_active ?? row.isActive;
    if (input.query_pattern !== undefined) {
      const pattern = normalizeQuery(input.query_pattern);
      if (pattern === '') {
        throw new BadRequestException({ code: 'INVALID_REDIRECT', message: 'query_pattern is required.' });
      }
      await this.assertPatternFree(pattern, id, nextActive);
      row.queryPattern = pattern;
    } else if (input.is_active === true) {
      await this.assertPatternFree(row.queryPattern, id, true);
    }
    if (input.target_type !== undefined || input.target_ref !== undefined) {
      const type = input.target_type ?? (row.targetType as RedirectTargetType);
      const ref = input.target_ref ?? row.targetRef;
      await this.assertTargetResolves(type, ref);
      row.targetType = type;
      row.targetRef = ref;
    }
    if (input.is_active !== undefined) row.isActive = input.is_active;
    return this.redirects.save(row);
  }

  async deleteRedirect(id: string): Promise<void> {
    const res = await this.redirects.delete({ id });
    if (!res.affected) throw this.notFound('REDIRECT_NOT_FOUND', id);
  }

  /** Active redirect matching a normalized query (FR-SRCH-013), or null. */
  async matchRedirect(normalized: string): Promise<SearchRedirectOrmEntity | null> {
    return this.redirects.findOne({ where: { queryPattern: normalized, isActive: true } });
  }

  // --- helpers ---

  private normalizeTerms(terms: string[]): string[] {
    return Array.from(
      new Set((terms ?? []).map((t) => normalizeQuery(String(t))).filter((t) => t !== '')),
    );
  }

  private async assertPatternFree(
    pattern: string,
    excludeId: string | null,
    active: boolean,
  ): Promise<void> {
    if (!active) return; // uniqueness applies only among active rules (§11).
    const existing = await this.redirects.find({ where: { queryPattern: pattern, isActive: true } });
    if (existing.some((r) => r.id !== excludeId)) {
      throw new BadRequestException({
        code: 'REDIRECT_PATTERN_EXISTS',
        message: `query_pattern "${pattern}" is already mapped by an active redirect.`,
      });
    }
  }

  private async assertTargetResolves(type: RedirectTargetType, ref: string): Promise<void> {
    if (type === RedirectTargetType.URL) {
      if (!ref || ref.trim() === '') {
        throw new BadRequestException({ code: 'INVALID_TARGET', message: 'target_ref is required.' });
      }
      return;
    }
    if (type === RedirectTargetType.CATEGORY) {
      const cat = await this.categories.findOne({ where: { slug: ref } });
      if (!cat) throw this.unresolved(ref);
      return;
    }
    if (type === RedirectTargetType.PRODUCT) {
      const product = await this.products.findOne({ where: { slug: ref } });
      if (!product) throw this.unresolved(ref);
      return;
    }
    throw new BadRequestException({ code: 'INVALID_TARGET_TYPE', message: `Unknown target_type ${type}.` });
  }

  private unresolved(ref: string): BadRequestException {
    return new BadRequestException({
      code: 'TARGET_NOT_RESOLVED',
      message: `target_ref "${ref}" does not resolve.`,
    });
  }

  private notFound(code: string, id: string): NotFoundException {
    return new NotFoundException({ code, message: `Not found: ${id}.` });
  }
}
