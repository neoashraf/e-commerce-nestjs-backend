import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RbacModule } from '../rbac/rbac.module';
import { GEO_AREA_REPOSITORY } from './domain/repositories/geo-area.repository.interface';
import { ListAreasUseCase } from './application/use-cases/list-areas.use-case';
import { ListDistrictsUseCase } from './application/use-cases/list-districts.use-case';
import { ListDivisionsUseCase } from './application/use-cases/list-divisions.use-case';
import { OverrideAreaZoneUseCase } from './application/use-cases/override-area-zone.use-case';
import { ZoneResolverService } from './application/services/zone-resolver.service';
import { GeoAreaOrmEntity } from './infrastructure/persistence/typeorm/entities/geo-area.orm-entity';
import { TypeOrmGeoAreaRepository } from './infrastructure/persistence/typeorm/repositories/typeorm-geo-area.repository';
import { GeoController } from './presentation/controllers/geo.controller';
import { AdminGeoController } from './presentation/controllers/admin-geo.controller';

/**
 * Cart domain (CART). First slice: the BD administrative-geography reference dataset (GeoArea)
 * with public cascading address selectors, the admin zone override (SRS 04 §5.6), and the
 * exported `ZoneResolverService` (FR-CART-046) that AUTH address create/edit and checkout consume.
 * Imports RbacModule for the admin auth + permission gate on the override endpoint.
 */
@Module({
  imports: [RbacModule, TypeOrmModule.forFeature([GeoAreaOrmEntity])],
  controllers: [GeoController, AdminGeoController],
  providers: [
    { provide: GEO_AREA_REPOSITORY, useClass: TypeOrmGeoAreaRepository },
    ListDivisionsUseCase,
    ListDistrictsUseCase,
    ListAreasUseCase,
    OverrideAreaZoneUseCase,
    ZoneResolverService,
  ],
  exports: [ZoneResolverService, GEO_AREA_REPOSITORY],
})
export class CartModule {}
