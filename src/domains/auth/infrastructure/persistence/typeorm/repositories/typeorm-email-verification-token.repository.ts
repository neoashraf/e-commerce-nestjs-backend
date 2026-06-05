import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { EmailVerificationToken } from '../../../../domain/entities/email-verification-token.entity';
import { IEmailVerificationTokenRepository } from '../../../../domain/repositories/email-verification-token.repository.interface';
import { EmailVerificationTokenOrmEntity } from '../entities/email-verification-token.orm-entity';
import { EmailVerificationTokenMapper } from '../mappers/email-verification-token.mapper';

@Injectable()
export class TypeOrmEmailVerificationTokenRepository implements IEmailVerificationTokenRepository {
  constructor(
    @InjectRepository(EmailVerificationTokenOrmEntity)
    private readonly repo: Repository<EmailVerificationTokenOrmEntity>,
  ) {}

  async findByTokenHash(hash: string): Promise<EmailVerificationToken | null> {
    const orm = await this.repo.findOne({ where: { tokenHash: hash } });
    return orm ? EmailVerificationTokenMapper.toDomain(orm) : null;
  }

  async findLatestByCustomer(customerId: string): Promise<EmailVerificationToken | null> {
    const orm = await this.repo.findOne({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
    return orm ? EmailVerificationTokenMapper.toDomain(orm) : null;
  }

  async consumeOutstandingForCustomer(customerId: string, now: Date): Promise<void> {
    await this.repo.update({ customerId, consumedAt: IsNull() }, { consumedAt: now });
  }

  async save(token: EmailVerificationToken): Promise<EmailVerificationToken> {
    const saved = await this.repo.save(EmailVerificationTokenMapper.toOrm(token));
    return EmailVerificationTokenMapper.toDomain(saved);
  }
}
