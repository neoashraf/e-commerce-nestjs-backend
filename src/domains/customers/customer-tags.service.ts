import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CustomerTagAssignmentEntity } from './entities/customer-tag-assignment.entity';
import { CustomerTagEntity } from './entities/customer-tag.entity';
import { TagDto } from './dto/customer-responses';

/**
 * Customer tag catalog + assignment (FR-CUST-031). Tags are a shared catalog; assignment is idempotent —
 * re-adding the same tag is a no-op and unassigning a missing one is harmless (§12.9). Used by the
 * directory tag filter and export segmentation (FR-CUST-032).
 */
@Injectable()
export class CustomerTagsService {
  constructor(
    @InjectRepository(CustomerTagEntity) private readonly tags: Repository<CustomerTagEntity>,
    @InjectRepository(CustomerTagAssignmentEntity)
    private readonly assignments: Repository<CustomerTagAssignmentEntity>,
  ) {}

  async listTags(): Promise<TagDto[]> {
    const rows = await this.tags.find({ order: { key: 'ASC' } });
    return rows.map((t) => ({ id: t.id, key: t.key, label: t.label, color: t.color }));
  }

  async createTag(key: string, label: string, color?: string): Promise<TagDto> {
    const existing = await this.tags.findOne({ where: { key } });
    if (existing) {
      throw new ConflictException({ code: 'TAG_EXISTS', message: `Tag "${key}" already exists.` });
    }
    const tag = await this.tags.save(this.tags.create({ key, label, color: color ?? null }));
    return { id: tag.id, key: tag.key, label: tag.label, color: tag.color };
  }

  /** Assign a tag to a customer (idempotent — re-adding is a no-op; FR-CUST-031, §12.9). */
  async assign(customerId: string, tagId: string, adminId: string): Promise<void> {
    const tag = await this.tags.findOne({ where: { id: tagId } });
    if (!tag) throw new NotFoundException({ code: 'TAG_NOT_FOUND', message: `Tag ${tagId} not found.` });

    const existing = await this.assignments.findOne({ where: { customerId, tagId } });
    if (existing) return;
    await this.assignments.save(
      this.assignments.create({ customerId, tagId, assignedByAdminId: adminId }),
    );
  }

  /** Remove a tag from a customer (idempotent — unassigning a missing tag is harmless; §12.8). */
  async unassign(customerId: string, tagId: string): Promise<void> {
    await this.assignments.delete({ customerId, tagId });
  }
}
