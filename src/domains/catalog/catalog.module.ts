import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { ATTRIBUTE_REPOSITORY } from './domain/repositories/attribute.repository.interface';
import { ATTRIBUTE_FAMILY_REPOSITORY } from './domain/repositories/attribute-family.repository.interface';
import { AttributeAssignmentValidator } from './application/services/attribute-assignment.validator';
import { FamilyGroupingValidator } from './application/services/family-grouping.validator';
import { CreateAttributeUseCase } from './application/use-cases/create-attribute.use-case';
import { DeleteAttributeUseCase } from './application/use-cases/delete-attribute.use-case';
import { ListAttributesUseCase } from './application/use-cases/list-attributes.use-case';
import { UpdateAttributeUseCase } from './application/use-cases/update-attribute.use-case';
import { CreateAttributeFamilyUseCase } from './application/use-cases/create-attribute-family.use-case';
import { DeleteAttributeFamilyUseCase } from './application/use-cases/delete-attribute-family.use-case';
import { GetAttributeFamilyUseCase } from './application/use-cases/get-attribute-family.use-case';
import { ListAttributeFamiliesUseCase } from './application/use-cases/list-attribute-families.use-case';
import { UpdateAttributeFamilyUseCase } from './application/use-cases/update-attribute-family.use-case';
import { AttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute.orm-entity';
import { AttributeOptionOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-option.orm-entity';
import { AttributeFamilyOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-family.orm-entity';
import { AttributeGroupOrmEntity } from './infrastructure/persistence/typeorm/entities/attribute-group.orm-entity';
import { FamilyAttributeOrmEntity } from './infrastructure/persistence/typeorm/entities/family-attribute.orm-entity';
import { TypeOrmAttributeRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-attribute.repository';
import { TypeOrmAttributeFamilyRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-attribute-family.repository';
import { AttributesController } from './presentation/controllers/attributes.controller';
import { AttributeFamiliesController } from './presentation/controllers/attribute-families.controller';

/**
 * Catalog domain (CAT). Slices so far: the attribute system (Attribute + AttributeOption) and
 * its admin CRUD (SRS 02 §5.2), and attribute families/groups (AttributeFamily + AttributeGroup
 * + FamilyAttribute) with their admin CRUD (SRS 02 §5.3). Imports RbacModule for the admin auth +
 * permission gate. `AttributeAssignmentValidator` is exported for later product/variant briefs.
 */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      AttributeOrmEntity,
      AttributeOptionOrmEntity,
      AttributeFamilyOrmEntity,
      AttributeGroupOrmEntity,
      FamilyAttributeOrmEntity,
    ]),
  ],
  controllers: [AttributesController, AttributeFamiliesController],
  providers: [
    { provide: ATTRIBUTE_REPOSITORY, useClass: TypeOrmAttributeRepository },
    { provide: ATTRIBUTE_FAMILY_REPOSITORY, useClass: TypeOrmAttributeFamilyRepository },
    ListAttributesUseCase,
    CreateAttributeUseCase,
    UpdateAttributeUseCase,
    DeleteAttributeUseCase,
    AttributeAssignmentValidator,
    FamilyGroupingValidator,
    ListAttributeFamiliesUseCase,
    GetAttributeFamilyUseCase,
    CreateAttributeFamilyUseCase,
    UpdateAttributeFamilyUseCase,
    DeleteAttributeFamilyUseCase,
  ],
  exports: [AttributeAssignmentValidator, ATTRIBUTE_REPOSITORY, ATTRIBUTE_FAMILY_REPOSITORY],
})
export class CatalogModule {}
