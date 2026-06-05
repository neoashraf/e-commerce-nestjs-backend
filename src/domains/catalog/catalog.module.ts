import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { ATTRIBUTE_REPOSITORY } from './domain/repositories/attribute.repository.interface';
import { AttributeAssignmentValidator } from './application/services/attribute-assignment.validator';
import { CreateAttributeUseCase } from './application/use-cases/create-attribute.use-case';
import { DeleteAttributeUseCase } from './application/use-cases/delete-attribute.use-case';
import { ListAttributesUseCase } from './application/use-cases/list-attributes.use-case';
import { UpdateAttributeUseCase } from './application/use-cases/update-attribute.use-case';
import { AttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { TypeOrmAttributeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-attribute.repository';
import { AttributesController } from './presentation/controllers/attributes.controller';

/**
 * Catalog domain (CAT). First slice: the attribute system (Attribute + AttributeOption) and
 * its admin CRUD (SRS 02 §5.2). Imports RbacModule for the admin auth + permission gate.
 * `AttributeAssignmentValidator` is exported for later product/variant briefs (FR-CAT-053).
 */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([AttributeOrmEntity, AttributeOptionOrmEntity]),
  ],
  controllers: [AttributesController],
  providers: [
    { provide: ATTRIBUTE_REPOSITORY, useClass: TypeOrmAttributeRepository },
    ListAttributesUseCase,
    CreateAttributeUseCase,
    UpdateAttributeUseCase,
    DeleteAttributeUseCase,
    AttributeAssignmentValidator,
  ],
  exports: [AttributeAssignmentValidator, ATTRIBUTE_REPOSITORY],
})
export class CatalogModule {}
